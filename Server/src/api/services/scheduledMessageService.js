import { createClient } from '@supabase/supabase-js';
import { scheduledMessageQueue } from '../../jobs/scheduledMessageQueue.js';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0')
});

// Cache for connection API keys
const connectionCache = new Map();

/**
 * Helper function to get connection details including API key
 */
async function getConnectionDetails(connectionId) {
  try {
    // Check cache first
    if (connectionCache.has(connectionId)) {
      return connectionCache.get(connectionId);
    }

    // Try Redis first
    const redisKey = `connection:${connectionId}`;
    let connectionInfo = await redis.get(redisKey);
    
    if (connectionInfo) {
      try {
        connectionInfo = JSON.parse(connectionInfo);
        if (connectionInfo && connectionInfo.api_key) {
          // Cache it
          connectionCache.set(connectionId, connectionInfo);
          return connectionInfo;
        }
      } catch (e) {
        console.error(`[ScheduledMessageService] Error parsing Redis connection info:`, e);
      }
    }
    
    // Get from database if not in Redis
    const { data, error } = await supabase
      .from('connections')
      .select('id, name, phone_number, api_key, connected, status')
      .eq('id', connectionId)
      .single();
    
    if (error) {
      console.error(`[ScheduledMessageService] Error fetching connection details:`, error);
      throw error;
    }
    
    if (!data) {
      console.error(`[ScheduledMessageService] Connection not found for ID: ${connectionId}`);
      return null;
    }
    
    // Cache in Redis
    await redis.set(redisKey, JSON.stringify(data), 'EX', 3600);
    
    // Cache in memory
    connectionCache.set(connectionId, data);
    
    return data;
  } catch (error) {
    console.error(`[ScheduledMessageService] Error getting connection details:`, error);
    return null;
  }
}

/**
 * Helper function to get contact details
 */
async function getContactDetails(contactId) {
  try {
    // If contactId is a number or numeric string, try to get from database
    if (!isNaN(contactId)) {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single();
      
      if (error) {
        console.error(`[ScheduledMessageService] Error fetching contact details:`, error);
        throw error;
      }
      
      if (!data) {
        console.error(`[ScheduledMessageService] Contact not found for ID: ${contactId}`);
        return null;
      }
      
      return data;
    } else {
      // If contactId is not a number, treat it as a test contact
      return {
        id: contactId,
        contact_name: 'Test Contact',
        phone_number: contactId
      };
    }
  } catch (error) {
    console.error(`[ScheduledMessageService] Error fetching contact details for ID ${contactId}:`, error);
    return null;
  }
}

/**
 * Helper function to calculate next scheduled date based on recurrence pattern
 */
function getNextScheduledDate(currentDate, pattern) {
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

/**
 * Validate UUID format
 */
function isValidUUID(uuid) {
  if (!uuid) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Create a scheduled message and add it directly to Bull MQ
 */
export const createScheduledMessage = async (req, res) => {
  try {
    const {
      connection_id,
      contact_id,
      message,
      scheduled_at,
      type = 'text',
      media_url,
      caption,
      media,
      asset_id,
      is_recurring = false,
      recurrence_pattern,
      owner_id
    } = req.body;

    // Validate required fields
    const hasMedia = media_url || asset_id;
    if (!connection_id || !contact_id || (!message && !hasMedia) || !scheduled_at) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: connection_id, contact_id, (message or media), scheduled_at'
      });
    }

    // Validate connection
    const connection = await getConnectionDetails(connection_id);
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: `Connection not found for ID: ${connection_id}`
      });
    }

    if (!connection.connected) {
      return res.status(400).json({
        success: false,
        error: `Connection ${connection_id} is not active`
      });
    }

    // Validate contact
    const contact = await getContactDetails(contact_id);
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: `Contact not found for ID: ${contact_id}`
      });
    }

    // Create message in database
    const messageId = uuidv4();
    const jobUuid = uuidv4();
    
    // Calculate delay for Bull MQ
    const now = new Date();
    const scheduledTime = new Date(scheduled_at);
    const delay = Math.max(0, scheduledTime.getTime() - now.getTime());
    
    // Determine status based on scheduled time
    // If scheduled time is in the future, use 'pending'
    // If scheduled time is now or in the past, use 'in_queue'
    const initialStatus = delay > 0 ? 'pending' : 'in_queue';
    
    // Prepare message data
    const messageData = {
      id: messageId,
      connection_id,
      contact_id,
      message,
      scheduled_at,
      type,
      media_url,
      caption,
      media,
      asset_id,
      status: initialStatus,
      is_recurring,
      recurrence_pattern,
      owner_id: owner_id && isValidUUID(owner_id) ? owner_id : null,
      message_id: jobUuid,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // If recurring, calculate next scheduled date
    if (is_recurring && recurrence_pattern) {
      messageData.next_scheduled_at = getNextScheduledDate(
        new Date(scheduled_at),
        recurrence_pattern
      ).toISOString();
    }

    // Insert into database
    const { error: insertError } = await supabase
      .from('scheduled_messages')
      .insert(messageData);

    if (insertError) {
      console.error('[ScheduledMessageService] Error inserting message:', insertError);
      return res.status(500).json({ success: false, error: 'Failed to schedule message' });
    }

    // Add to Bull MQ
    const jobData = {
        messageId,
        connectionId: connection_id,
        apiKey: connection.api_key,
        contact,
      message: message,
      type: type,
          mediaUrl: media_url,
      caption: caption,
      media: media,
      asset_id: asset_id,
        jobUuid,
      ownerId: owner_id,
        isRecurring: is_recurring,
        recurrencePattern: recurrence_pattern,
        scheduledAt: scheduled_at
    };

    await scheduledMessageQueue.add('scheduled-message', jobData, {
      delay,
        jobId: jobUuid,
        removeOnComplete: true,
        removeOnFail: false
      });
      
    console.log(`[ScheduledMessageService] Message ${messageId} queued with job ID ${jobUuid} and delay ${delay}ms`);

    res.status(201).json({
      success: true,
      message: 'Message scheduled successfully',
      data: messageData
    });

  } catch (error) {
    console.error('[ScheduledMessageService] Error creating scheduled message:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get all scheduled messages
 */
export const getScheduledMessages = async (req, res) => {
  try {
    const { connection_id, status, limit = 100, offset = 0 } = req.query;

    let query = supabase
      .from('scheduled_messages')
      .select('*');

    if (connection_id) {
      query = query.eq('connection_id', connection_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query
      .order('scheduled_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[ScheduledMessageService] Error fetching scheduled messages:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch scheduled messages',
        details: error.message
      });
    }

    return res.status(200).json({
      success: true,
      data,
      count,
      limit,
      offset
    });
  } catch (error) {
    console.error('[ScheduledMessageService] Error in getScheduledMessages:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Delete a scheduled message
 */
export const deleteScheduledMessage = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if message exists
    const { data, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select('id, status, message_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[ScheduledMessageService] Error fetching scheduled message:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch scheduled message',
        details: fetchError.message
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: `Scheduled message not found for ID: ${id}`
      });
    }

    // If message is in queue, remove from Bull MQ
    if (data.status === 'in_queue' && data.message_id) {
      try {
        await scheduledMessageQueue.remove(data.message_id);
        console.log(`[ScheduledMessageService] Removed job ${data.message_id} from queue`);
      } catch (removeError) {
        console.error(`[ScheduledMessageService] Error removing job ${data.message_id}:`, removeError);
        // Continue with deletion even if job removal fails
      }
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('scheduled_messages')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[ScheduledMessageService] Error deleting scheduled message:', deleteError);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete scheduled message',
        details: deleteError.message
      });
    }

    return res.status(200).json({
      success: true,
      message: `Scheduled message ${id} deleted successfully`
    });
  } catch (error) {
    console.error('[ScheduledMessageService] Error in deleteScheduledMessage:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Process any pending scheduled messages and add them to the queue
 * This is used for migration from the old system and for recovery
 */
export const processPendingMessages = async () => {
  try {
    console.log('[ScheduledMessageService] Processing pending scheduled messages');
    
    // Get pending messages that are due
    const now = new Date().toISOString();
    console.log(`[ScheduledMessageService] Checking for messages scheduled before: ${now}`);
    
    const { data, error } = await supabase
      .from('scheduled_messages')
      .select('id')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true });
    
    if (error) {
      console.error('[ScheduledMessageService] Error fetching pending messages:', error);
      return { success: false, error };
    }
    
    if (!data || data.length === 0) {
      console.log('[ScheduledMessageService] No pending scheduled messages found');
      return { success: true, count: 0 };
    }
    
    console.log(`[ScheduledMessageService] Found ${data.length} pending scheduled messages to queue`);
    
    let processedCount = 0;
    let skippedCount = 0;
    
    // Process each message
    for (const message of data) {
      try {
        console.log(`[ScheduledMessageService] Processing message ID: ${message.id}`);
        const result = await processPendingMessage(message.id);
        if (result.success) {
          processedCount++;
          console.log(`[ScheduledMessageService] Successfully processed message ${message.id}`);
        } else {
          skippedCount++;
          console.log(`[ScheduledMessageService] Skipped message ${message.id}: ${result.error || 'Unknown reason'}`);
        }
      } catch (messageError) {
        console.error(`[ScheduledMessageService] Error processing message ${message.id}:`, messageError);
        skippedCount++;
      }
    }
    
    console.log(`[ScheduledMessageService] Processing complete. Processed: ${processedCount}, Skipped: ${skippedCount}, Total: ${data.length}`);
    
    return {
      success: true,
      processed: processedCount,
      skipped: skippedCount,
      total: data.length
    };
  } catch (error) {
    console.error('[ScheduledMessageService] Error processing pending messages:', error);
    return { success: false, error };
  }
};

/**
 * Process a single pending message by ID
 * @param {string} messageId - ID of the message to process
 * @returns {Promise<Object>} - Result of processing
 */
async function processPendingMessage(messageId) {
  try {
    console.log(`[ScheduledMessageService] Processing pending message ${messageId}`);
    
    // Get message details
    const { data: message, error: messageError } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('id', messageId)
      .eq('status', 'pending')
      .single();
    
    if (messageError) {
      console.error(`[ScheduledMessageService] Error fetching message ${messageId}:`, messageError);
      return { success: false, error: messageError };
    }
    
    if (!message) {
      console.log(`[ScheduledMessageService] Message ${messageId} not found or not pending`);
      return { success: false, error: 'Message not found or not pending' };
    }
    
    // Check if scheduled time has passed
    const now = new Date();
    const scheduledTime = new Date(message.scheduled_at);
    
    if (scheduledTime > now) {
      const remainingTime = scheduledTime.getTime() - now.getTime();
      console.log(`[ScheduledMessageService] Message ${messageId} is scheduled for future: ${message.scheduled_at} (in ${Math.round(remainingTime / 1000)} seconds)`);
      return { success: true, status: 'future', remainingTime };
    }
    
    // Get connection details
    const connection = await getConnectionDetails(message.connection_id);
    if (!connection || !connection.connected) {
      console.log(`[ScheduledMessageService] Connection ${message.connection_id} not found or not active`);
      return { success: false, error: 'Connection not found or not active' };
    }
    
    // Get contact details
    const contact = await getContactDetails(message.contact_id);
    if (!contact) {
      console.log(`[ScheduledMessageService] Contact ${message.contact_id} not found`);
      return { success: false, error: 'Contact not found' };
    }
    
    // Generate a job UUID
    const jobUuid = uuidv4();
    
    // Update message status to 'in_queue'
    await supabase
      .from('scheduled_messages')
      .update({
        status: 'in_queue',
        message_id: jobUuid,
        updated_at: new Date().toISOString()
      })
      .eq('id', message.id);
    
    // Add to queue immediately
    await scheduledMessageQueue.add('scheduled-message', {
      messageId: message.id,
      connectionId: message.connection_id,
      apiKey: connection.api_key,
      contact,
      message: message.message,
      type: message.type || 'text',
      caption: message.caption,
      mediaUrl: message.media_url,
      media: message.media,
      asset_id: message.asset_id,
      jobUuid,
      ownerId: message.owner_id,
      isRecurring: message.is_recurring,
      recurrencePattern: message.recurrence_pattern,
      scheduledAt: message.scheduled_at
    }, {
      jobId: jobUuid,
      removeOnComplete: true,
      removeOnFail: false
    });
    
    console.log(`[ScheduledMessageService] Successfully queued message ${message.id} with job ID ${jobUuid}`);
    
    return {
      success: true,
      messageId: message.id,
      jobId: jobUuid
    };
  } catch (error) {
    console.error(`[ScheduledMessageService] Error processing message ${messageId}:`, error);
    return { success: false, error };
  }
}

// Export for internal use
export { processPendingMessage }; 