import { scheduledMessageQueue } from './scheduledMessageQueue.js';
import { v4 as uuidv4 } from 'uuid';
import { broadcastQueue } from '../broadcast/queue.js';
import { broadcastJobs } from '../broadcast/supabaseClient.js';
import BaseWorker from '../workers/BaseWorker.js';
import connectionManager from '../utils/ConnectionManager.js';
import { getConnectionManager } from '../utils/connectionManagerSingleton.js';
import { withRetry } from '../utils/retry.js';

/**
 * Worker for processing scheduled messages
 * Extends BaseWorker for consistent architecture and improved performance
 */
class ScheduledMessageQueueWorker extends BaseWorker {
  constructor() {
    super('scheduled-messages', async (job) => this.processJob(job), {
      concurrency: 5
    });
    
    // Initialize the worker
    this.initialize();
    
    // Logging control
    this.logLevel = process.env.LOG_LEVEL || 'error'; // Only show errors by default
    this.isVerboseLogging = this.logLevel === 'debug';
  }
  
  /**
   * Utility method to log based on importance and configured log level
   * @param {string} message - The message to log
   * @param {string} level - Log level: 'error', 'warn', 'info', 'debug'
   */
  log(message, level = 'debug') {
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    const configLevel = levels[this.logLevel] || 0;
    
    if (levels[level] <= configLevel) {
      if (level === 'error') {
        console.error(message);
      } else if (level === 'warn') {
        console.warn(message);
      } else {
        console.log(message);
      }
    }
  }
  
  /**
   * Initialize the worker with repeatable job for checking pending messages
   */
  async initialize() {
    try {
      // Process pending messages at startup with lock to prevent race conditions
      const lockKey = 'scheduled-message-startup-lock';
      const lockAcquired = await connectionManager.getRedisClient().set(lockKey, 'locked', 'EX', 60, 'NX');

      if (lockAcquired) {
        this.log('[ScheduledMessageWorker] Processing pending messages at startup', 'info');
        try {
          const result = await this.processPendingMessages();
          if (result.error || (result.processed && result.processed > 0)) {
            this.log(`[ScheduledMessageWorker] Startup processed: ${result.processed || 0}, errors: ${result.error ? 'yes' : 'no'}`, 'info');
          }
        } catch (error) {
          console.error('[ScheduledMessageWorker] Error processing pending messages at startup:', error);
        } finally {
          // Release the lock
          await connectionManager.getRedisClient().del(lockKey);
        }
      }
      
      // Set up repeatable job to check for pending messages
      await this.setupRepeatableJob();
    } catch (error) {
      console.error('[ScheduledMessageWorker] Initialization error:', error);
    }
  }
  
  /**
   * Set up repeatable job to check for pending messages
   */
  async setupRepeatableJob() {
    try {
      // Remove any existing repeatable jobs to avoid duplicates
      const repeatableJobs = await scheduledMessageQueue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.name === 'check-pending-messages') {
          await scheduledMessageQueue.removeRepeatableByKey(job.key);
        }
      }
      
      // Add the new repeatable job
      await scheduledMessageQueue.add(
        'check-pending-messages',
        { action: 'check-pending-messages' },
        { 
          repeat: { 
            every: 60000, // Every minute
            immediately: true // Run immediately on startup too
          },
          jobId: 'check-pending-messages',
          removeOnComplete: true
        }
      );
      this.log('[ScheduledMessageWorker] Job scheduler initialized', 'info');
    } catch (error) {
      console.error('[ScheduledMessageWorker] Error setting up repeatable job:', error);
    }
  }
  
  /**
   * Process a job from the queue
   * @param {Object} job - The job to process
   * @returns {Promise<Object>} - The result of processing
   */
  async processJob(job) {
    this.log(`[ScheduledMessageWorker] Processing job ${job.id} of type ${job.name}`, 'debug');
    
    // Handle the check-pending-messages job type
    if (job.name === 'check-pending-messages') {
      return await this.handleCheckPendingMessages();
    }
    
    // Handle regular scheduled message jobs
    return await this.handleScheduledMessage(job);
  }
  
  /**
   * Handle check-pending-messages job
   * @returns {Promise<Object>} - The result of checking pending messages
   */
  async handleCheckPendingMessages() {
    try {
      // Use a lock to prevent multiple workers from processing at the same time
      const lockKey = 'scheduled-message-check-lock';
      const lockAcquired = await connectionManager.getRedisClient().set(lockKey, 'locked', 'EX', 30, 'NX');
      
      if (lockAcquired) {
        this.log('[ScheduledMessageWorker] Running periodic check', 'debug');
        const result = await this.processPendingMessages();
        
        // Only log if there are messages found or there's an error
        if ((result.processed && result.processed > 0) || result.error) {
          this.log(`[ScheduledMessageWorker] Check found ${result.processed || 0} messages to process`, 'info');
        }
        
        // Release the lock
        await connectionManager.getRedisClient().del(lockKey);
        return { success: true, result };
      } else {
        this.log('[ScheduledMessageWorker] Skipping check - another worker active', 'debug');
        return { success: true, skipped: true };
      }
    } catch (error) {
      console.error('[ScheduledMessageWorker] Error in periodic check:', error);
      throw error;
    }
  }
  
  /**
   * Handle scheduled message job
   * @param {Object} job - The job to process
   * @returns {Promise<Object>} - The result of processing
   */
  async handleScheduledMessage(job) {
    const { 
      messageId,
      connectionId, 
      apiKey, 
      contact, 
      message,
      type,
      mediaUrl,
      caption,
      asset_id,
      media,
      jobUuid,
      ownerId,
      isRecurring,
      recurrencePattern,
      scheduledAt
    } = job.data;
    
    try {
      // Create a broadcast job in the database
      const broadcastName = `Scheduled Message: ${messageId.substring(0, 8)}`;
      
      // Ensure type is set to 'media' if asset_id or mediaUrl is present
      const messageType = asset_id || mediaUrl || (Array.isArray(media) && media.length > 0) ? 'media' : (type || 'text');
      
      this.log(`[ScheduledMessageWorker] Creating broadcast job for message ${messageId}`, 'debug');
      
      // Format media data for the broadcast job
      let broadcastOptions = {
        type: messageType,
        broadcast_name: broadcastName
      };
      
      // Add media information if this is a media message
      if (messageType === 'media') {
        broadcastOptions = {
          ...broadcastOptions,
          mediaUrl: mediaUrl,
          caption: caption || message, // Use message as caption if no caption is provided
          asset_id: asset_id
        };
        
        // If we have structured media data, add it
        if (Array.isArray(media) && media.length > 0) {
          broadcastOptions.media = media;
        }
      }
      
      const jobData = await broadcastJobs.create(
        connectionId,
        message,
        [contact],
        broadcastOptions,
        ownerId,
        false // Not a broadcast, but a scheduled message
      );

      // Add the job to the broadcast queue with proper media handling
      const broadcastJobData = {
        contacts: [contact],
        message: message,
        connectionId: connectionId,
        apiKey: apiKey,
        type: messageType,
        ownerId: ownerId,
        dbJobId: jobUuid,
        deduplicationId: `scheduled_${messageId}`,
        parentJobId: uuidv4()
      };
      
      // Add media information if this is a media message
      if (messageType === 'media') {
        broadcastJobData.mediaUrl = mediaUrl;
        broadcastJobData.caption = caption || message;
        broadcastJobData.asset_id = asset_id;
        
        // If we have structured media data, add it
        if (Array.isArray(media) && media.length > 0) {
          broadcastJobData.media = media;
        }
      }
      
      await broadcastQueue.add('broadcast', broadcastJobData, {
        priority: 2,
        removeOnComplete: true,
        removeOnFail: false,
        jobId: jobUuid
      });

      // Update message status to 'sent'
      await connectionManager.getSupabaseClient()
        .from('scheduled_messages')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          message_id: jobUuid
        })
        .eq('id', messageId);

      // If this is a recurring message, schedule the next occurrence
      if (isRecurring && recurrencePattern) {
        this.log(`[ScheduledMessageWorker] Processing recurring message: ${messageId}`, 'info');
        await this.handleRecurringMessage(
          messageId,
          scheduledAt,
          recurrencePattern,
          contact,
          apiKey,
          ownerId
        );
      }

      return { success: true };
    } catch (error) {
      console.error(`[ScheduledMessageWorker] Error processing scheduled message:`, error);
      
      // Update message status to 'failed'
      try {
        await connectionManager.getSupabaseClient()
          .from('scheduled_messages')
          .update({
            status: 'failed',
            error: error.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', messageId);
      } catch (updateError) {
        console.error(`[ScheduledMessageWorker] Error updating message status:`, updateError);
      }
      
      throw error;
    }
  }
  
  /**
   * Handle recurring message by creating the next occurrence
   * @param {string} messageId - The message ID
   * @param {string} scheduledAt - The scheduled date
   * @param {string} recurrencePattern - The recurrence pattern
   * @param {Object} contact - The contact
   * @param {string} apiKey - The API key
   * @param {string} ownerId - The owner ID
   */
  async handleRecurringMessage(messageId, scheduledAt, recurrencePattern, contact, apiKey, ownerId) {
    const nextDate = this.getNextScheduledDate(new Date(scheduledAt), recurrencePattern);
    
    await connectionManager.getSupabaseClient()
      .from('scheduled_messages')
      .update({
        next_scheduled_at: nextDate.toISOString()
      })
      .eq('id', messageId);

    // Create a new scheduled message for the next occurrence
    
    // Get the original message to copy its data
    const { data: originalMessage } = await connectionManager.getSupabaseClient()
      .from('scheduled_messages')
      .select('*')
      .eq('id', messageId)
      .single();
      
    if (originalMessage) {
      const newScheduledMessage = {
        connection_id: originalMessage.connection_id,
        contact_id: originalMessage.contact_id,
        message: originalMessage.message,
        type: originalMessage.type,
        media_url: originalMessage.media_url,
        caption: originalMessage.caption,
        asset_id: originalMessage.asset_id,
        scheduled_at: nextDate.toISOString(),
        owner_id: ownerId,
        status: 'pending',
        is_recurring: originalMessage.is_recurring,
        recurrence_pattern: originalMessage.recurrence_pattern,
        next_scheduled_at: this.getNextScheduledDate(nextDate, recurrencePattern).toISOString(),
        media: originalMessage.media
      };
      
      const { error: insertError, data: newMessage } = await connectionManager.getSupabaseClient()
        .from('scheduled_messages')
        .insert(newScheduledMessage)
        .select()
        .single();

      if (insertError) {
        console.error('[ScheduledMessageWorker] Error creating next recurring message:', insertError);
      } else if (newMessage) {
        // Calculate delay for the next scheduled message
        const now = new Date();
        const nextScheduledTime = new Date(nextDate);
        const delay = Math.max(0, nextScheduledTime.getTime() - now.getTime());
        
        // Generate new UUIDs for the next job
        const nextJobUuid = uuidv4();
        
        // Add the next occurrence directly to the queue with appropriate delay
        await scheduledMessageQueue.add('scheduled-message', {
          messageId: newMessage.id,
          connectionId: newMessage.connection_id,
          apiKey: apiKey,
          contact,
          message: newMessage.message,
          type: newMessage.type || (newMessage.asset_id ? 'media' : 'text'),
          caption: newMessage.caption || newMessage.message,
          mediaUrl: newMessage.media_url,
          media: newMessage.media,
          asset_id: newMessage.asset_id,
          jobUuid: nextJobUuid,
          ownerId: newMessage.owner_id,
          isRecurring: newMessage.is_recurring,
          recurrencePattern: newMessage.recurrence_pattern,
          scheduledAt: newMessage.scheduled_at
        }, {
          jobId: nextJobUuid,
          delay,
          removeOnComplete: true,
          removeOnFail: false
        });
        
        // Update the new message status to 'in_queue'
        await connectionManager.getSupabaseClient()
          .from('scheduled_messages')
          .update({
            status: 'in_queue',
            message_id: nextJobUuid
          })
          .eq('id', newMessage.id);
          
        this.log(`[ScheduledMessageWorker] Next occurrence scheduled with delay ${Math.round(delay/1000)}s`, 'info');
      }
    }
  }
  
  /**
   * Process pending scheduled messages
   * Uses the optimized database function for better performance
   */
  async processPendingMessages() {
    try {
      const startTime = Date.now();
      
      // Get pending messages that are due using the optimized function
      const now = new Date().toISOString();
      
      // Use the optimized database function if available, otherwise fall back to regular query
      let data;
      let error;
      
      try {
        const result = await withRetry(
          () => connectionManager.getSupabaseClient().rpc('get_pending_messages_due', { limit_count: 100 }),
          'get_pending_messages_due'
        );
        data = result.data;
        error = result.error;
      } catch (rpcError) {
        // Fall back to regular query if the function doesn't exist
        this.log('[ScheduledMessageService] RPC failed, using fallback query', 'warn');
        try {
          const result = await withRetry(
            () => connectionManager.getSupabaseClient()
              .from('scheduled_messages')
              .select('id')
              .eq('status', 'pending')
              .lte('scheduled_at', now)
              .order('scheduled_at', { ascending: true })
              .limit(100),
            'get_pending_messages_fallback'
          );
          data = result.data;
          error = result.error;
        } catch (fallbackError) {
          console.error('[ScheduledMessageService] Network/database error fetching pending messages:', fallbackError);
          return { success: false, error: { message: 'Network/database error fetching pending messages', details: fallbackError.message || fallbackError.toString() } };
        }
      }
      
      if (error) {
        console.error('[ScheduledMessageService] Error fetching pending messages:', error);
        return { success: false, error };
      }
      
      if (!data || data.length === 0) {
        return { success: true, count: 0 };
      }
      
      this.log(`[ScheduledMessageService] Found ${data.length} pending messages`, 'info');
      
      // Batch process messages in groups of 10 for better performance
      const batchSize = 10;
      let processedCount = 0;
      let skippedCount = 0;
      
      // Process messages in batches
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        
        // Process batch in parallel with concurrency limit
        const results = await Promise.all(
          batch.map(message => this.processPendingMessage(message.id)
            .catch(error => {
              console.error(`[ScheduledMessageService] Error processing message ${message.id}:`, error);
              return { success: false, error: error.message };
            })
          )
        );
        
        // Count successes and failures
        const batchSuccesses = results.filter(r => r.success).length;
        const batchSkipped = results.filter(r => !r.success).length;
        processedCount += batchSuccesses;
        skippedCount += batchSkipped;
      }
      
      const totalTime = Date.now() - startTime;
      if (processedCount > 0) {
        this.log(`[ScheduledMessageService] Processed ${processedCount}/${data.length} messages in ${totalTime}ms`, 'info');
      }
      
      return {
        success: true,
        processed: processedCount,
        skipped: skippedCount,
        total: data.length,
        processingTime: totalTime
      };
    } catch (error) {
      console.error('[ScheduledMessageService] Error processing pending messages:', error);
      return { success: false, error };
    }
  }
  
  /**
   * Process a single pending message by ID
   * @param {string} messageId - ID of the message to process
   * @returns {Promise<Object>} - Result of processing
   */
  async processPendingMessage(messageId) {
    try {
      // Get message details with all needed related data using explicit joins
      const { data: message, error: messageError } = await withRetry(
        () => connectionManager.getSupabaseClient()
          .from('scheduled_messages')
          .select('*')
          .eq('id', messageId)
          .eq('status', 'pending')
          .single(),
        `get_scheduled_message_${messageId}`
      );
      
      if (!messageError && message) {
        // Get connection details separately
        const { data: connectionData } = await connectionManager.getSupabaseClient()
          .from('connections')
          .select('id, api_key, connected')
          .eq('id', message.connection_id)
          .single();
          
        // Get contact details separately
        const { data: contactData } = await connectionManager.getSupabaseClient()
          .from('contacts')
          .select('id, phone_number, contact_name, owner_id')
          .eq('id', message.contact_id)
          .single();
          
        // Attach the related data to the message object
        if (connectionData) message.connections = connectionData;
        if (contactData) message.contacts = contactData;
      }
      
      if (messageError) {
        console.error(`[ScheduledMessageService] Error fetching message ${messageId}:`, messageError);
        return { success: false, error: messageError };
      }
      
      if (!message) {
        return { success: false, error: 'Message not found or not pending' };
      }
      
      // Check if scheduled time has passed
      const now = new Date();
      const scheduledTime = new Date(message.scheduled_at);
      
      if (scheduledTime > now) {
        return { success: true, status: 'future' };
      }
      
      // Check connection from joined data
      if (!message.connections || !message.connections.connected) {
        return { success: false, error: 'Connection not found or not active' };
      }
      
      // Check contact from joined data
      if (!message.contacts) {
        return { success: false, error: 'Contact not found' };
      }
      
      // Generate a job UUID
      const jobUuid = uuidv4();
      
      // Update message status to 'in_queue'
      await withRetry(
        () => connectionManager.getSupabaseClient()
          .from('scheduled_messages')
          .update({
            status: 'in_queue',
            message_id: jobUuid,
            updated_at: new Date().toISOString()
          })
          .eq('id', message.id),
        `update_scheduled_message_status_${message.id}`
      );

      // Properly prepare media data for broadcast
      let mediaData = null;
      if (message.asset_id || message.media_url) {
        // If we have media information, prepare it for the broadcast
        mediaData = [];
        
        // If there's a structured media object in the message.media field
        if (message.media && typeof message.media === 'object') {
          // Use the structured media data
          mediaData.push({
            url: message.media.url || message.media_url,
            fullPath: message.media.fullPath,
            filename: message.media.filename || 'file',
            mimetype: message.media.mimetype || 'application/octet-stream',
            assetId: message.asset_id || message.media.assetId,
            caption: message.caption || message.message
          });
        } else {
          // Create a basic media object
          mediaData.push({
            url: message.media_url,
            assetId: message.asset_id,
            caption: message.caption || message.message
          });
        }
      }
      
      // Add to queue immediately with proper media handling
      await scheduledMessageQueue.add('scheduled-message', {
        messageId: message.id,
        connectionId: message.connection_id,
        apiKey: message.connections.api_key,
        contact: message.contacts.phone_number,
        message: message.message,
        type: message.asset_id || message.media_url ? 'media' : (message.type || 'text'),
        caption: message.caption || message.message,
        mediaUrl: message.media_url,
        media: mediaData, // Pass the properly formatted media array
        asset_id: message.asset_id,
        jobUuid,
        ownerId: message.owner_id || message.contacts.owner_id,
        isRecurring: message.is_recurring,
        recurrencePattern: message.recurrence_pattern,
        scheduledAt: message.scheduled_at
      }, {
        jobId: jobUuid,
        removeOnComplete: true,
        removeOnFail: false
      });
      
      return {
        success: true,
        messageId: message.id,
        jobId: jobUuid
      };
    } catch (error) {
      console.error(`[ScheduledMessageService] Error processing message ${messageId}:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Helper function to calculate next scheduled date based on recurrence pattern
   */
  getNextScheduledDate(currentDate, pattern) {
    const nextDate = new Date(currentDate);
    
    switch (pattern) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      default:
        nextDate.setDate(nextDate.getDate() + 1);
    }
    
    return nextDate;
  }
}

// Create a singleton instance
const worker = new ScheduledMessageQueueWorker();

// Display minimal startup message
console.error('[ScheduledMessageWorker] Started with error-only logging');

export {
  worker
}; 