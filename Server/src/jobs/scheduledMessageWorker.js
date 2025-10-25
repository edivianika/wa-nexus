/**
 * DEPRECATED: This worker is deprecated and will be removed in a future version.
 * Please use the Bull MQ worker (scheduledMessageQueueWorker.js) instead.
 * 
 * To use the Bull MQ worker:
 * 1. Run the migration: node src/migrations/add_in_queue_status.js
 * 2. Start the worker: npm run dev:scheduled-queue
 * 
 * Or use the setup script: ./scripts/setup_scheduled_queue.sh
 */

console.warn(`
╔════════════════════════════════════════════════════════════════════════╗
║                                                                        ║
║  WARNING: DEPRECATED WORKER                                            ║
║  This scheduled message worker is deprecated.                          ║
║  Please use the Bull MQ worker (scheduledMessageQueueWorker.js)        ║
║  instead for better reliability and performance.                       ║
║                                                                        ║
║  Run: npm run dev:scheduled-queue                                      ║
║  Or: ./scripts/setup_scheduled_queue.sh                                ║
║                                                                        ║
╚════════════════════════════════════════════════════════════════════════╝
`);

import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import { broadcastQueue } from '../broadcast/queue.js';
import { broadcastJobs } from '../broadcast/supabaseClient.js';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

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
  // maxRetriesPerRequest must be null for BullMQ
});

// Redis subscriber for real-time updates
const subscriber = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0')
  // maxRetriesPerRequest must be null for BullMQ
});

// Cache for connection API keys
const connectionCache = new Map();

// Set up Redis subscriber for real-time scheduled message processing
subscriber.subscribe('scheduled_messages:process');
subscriber.on('message', async (channel, message) => {
  if (channel === 'scheduled_messages:process') {
    try {
      const data = JSON.parse(message);
      if (data.action === 'process') {
        console.log(`[ScheduledMessageWorker] Received real-time trigger to process scheduled messages`);
        await processScheduledMessages();
      } else if (data.action === 'process_single' && data.messageId) {
        console.log(`[ScheduledMessageWorker] Received real-time trigger to process specific message: ${data.messageId}`);
        await processSingleScheduledMessage(data.messageId);
      }
    } catch (error) {
      console.error('[ScheduledMessageWorker] Error processing Redis message:', error);
    }
  }
});

// Helper function to get connection details including API key
async function getConnectionDetails(connectionId) {
  try {
    // Check cache first
    if (connectionCache.has(connectionId)) {
      return connectionCache.get(connectionId);
    }

    console.log(`[ScheduledMessageWorker] Getting connection details for ${connectionId}`);
    
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
        console.error(`[ScheduledMessageWorker] Error parsing Redis connection info:`, e);
      }
    }
    
    // Get from database if not in Redis
    const { data, error } = await supabase
      .from('connections')
      .select('id, name, phone_number, api_key, connected, status')
      .eq('id', connectionId)
      .single();
    
    if (error) {
      console.error(`[ScheduledMessageWorker] Error fetching connection details:`, error);
      throw error;
    }
    
    if (!data) {
      console.error(`[ScheduledMessageWorker] Connection not found for ID: ${connectionId}`);
      return null;
    }
    
    // Cache in Redis
    await redis.set(redisKey, JSON.stringify(data), 'EX', 3600);
    
    // Cache in memory
    connectionCache.set(connectionId, data);
    
    return data;
  } catch (error) {
    console.error(`[ScheduledMessageWorker] Error getting connection details:`, error);
    return null;
  }
}

// Helper function to check if a connection is active
async function isConnectionActive(connectionId) {
  try {
    const connection = await getConnectionDetails(connectionId);
    
    if (!connection) {
      console.log(`[ScheduledMessageWorker] Connection ${connectionId} not found`);
      return false;
    }
    
    if (!connection.connected) {
      console.log(`[ScheduledMessageWorker] Connection ${connectionId} is not active`);
      return false;
    }
    
    console.log(`[ScheduledMessageWorker] Connection ${connectionId} is active`);
    return true;
  } catch (error) {
    console.error(`[ScheduledMessageWorker] Error checking connection status:`, error);
    return false;
  }
}

// Helper function to get contact details
async function getContactDetails(contactId) {
  try {
    console.log(`[ScheduledMessageWorker] Fetching contact details for ID: ${contactId}`);
    
    // If contactId is a number or numeric string, try to get from database
    if (!isNaN(contactId)) {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single();
      
      if (error) {
        console.error(`[ScheduledMessageWorker] Error fetching contact details:`, error);
        throw error;
      }
      
      if (!data) {
        console.error(`[ScheduledMessageWorker] Contact not found for ID: ${contactId}`);
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
    console.error(`[ScheduledMessageWorker] Error fetching contact details for ID ${contactId}:`, error);
    return null;
  }
}

// Helper function to calculate next scheduled date based on recurrence pattern
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

// Process a specific scheduled message by ID
async function processSingleScheduledMessage(messageId) {
  try {
    console.log(`[ScheduledMessageWorker] Processing specific message: ${messageId}`);
    
    // Fetch the message
    const { data, error } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('id', messageId)
      .single();
    
    if (error) {
      console.error(`[ScheduledMessageWorker] Error fetching message ${messageId}:`, error);
      return false;
    }
    
    if (!data) {
      console.error(`[ScheduledMessageWorker] Message ${messageId} not found`);
      return false;
    }
    
    // Process the message
    return await processScheduledMessage(data);
  } catch (error) {
    console.error(`[ScheduledMessageWorker] Error processing specific message ${messageId}:`, error);
    return false;
  }
}

// Process a single scheduled message
async function processScheduledMessage(message) {
  console.log(`[ScheduledMessageWorker] Processing scheduled message ${message.id}`);
  
  try {
    // Get connection details including API key
    const connection = await getConnectionDetails(message.connection_id);
    if (!connection) {
      throw new Error(`Connection ${message.connection_id} not found`);
    }
    
    if (!connection.connected) {
      // For inactive connections, we'll update the status but not mark as failed
      // This allows the message to be retried when the connection becomes active again
      await supabase
        .from('scheduled_messages')
        .update({
          status: 'pending',
          error_message: `Connection ${message.connection_id} is not active`
        })
        .eq('id', message.id);
      
      console.log(`[ScheduledMessageWorker] Message ${message.id} kept as pending due to inactive connection`);
      return false;
    }
    
    // Get contact details
    const contact = await getContactDetails(message.contact_id);
    
    if (!contact) {
      throw new Error(`Contact not found for ID: ${message.contact_id}`);
    }

    // Prepare message data
    const messageData = {
      type: message.type || 'text',
      message: message.message,
      caption: message.caption,
      mediaUrl: message.media_url
    };

    // Handle media array if present
    if (message.media && typeof message.media === 'object') {
      messageData.media = message.media;
    }

    // Create a broadcast job in the database
    const broadcastName = `Scheduled Message: ${message.id.substring(0, 8)}`;
    
    // Ensure owner_id is a valid UUID or null
    const ownerId = message.owner_id && isValidUUID(message.owner_id) ? message.owner_id : null;
    
    // Generate a valid UUID for the job
    const jobUuid = uuidv4();
    
    console.log(`[ScheduledMessageWorker] Creating broadcast job for message ${message.id}`);
    const jobData = await broadcastJobs.create(
      message.connection_id,
      messageData.message,
      [contact],
      {
        type: messageData.type,
        mediaUrl: messageData.mediaUrl,
        caption: messageData.caption,
        media: messageData.media,
        broadcast_name: broadcastName
      },
      ownerId,
      false // Not a broadcast, but a scheduled message
    );

    // Always use a valid UUID for the job ID
    console.log(`[ScheduledMessageWorker] Created job with ID: ${jobUuid}`);

    // Add the job to the queue
    console.log(`[ScheduledMessageWorker] Adding job to queue: ${jobUuid}`);
    await broadcastQueue.add('broadcast', {
      contacts: [contact],
      message: messageData.message,
      connectionId: message.connection_id,
      apiKey: connection.api_key, // Ensure API key is passed from the connection
      type: messageData.type,
      mediaUrl: messageData.mediaUrl,
      caption: messageData.caption,
      media: messageData.media,
      dbJobId: jobUuid, // Use the valid UUID here
      deduplicationId: `scheduled_${message.id}`,
      parentJobId: uuidv4(),
      userId: message.owner_id // Add user ID for authentication
    }, {
      priority: 2,
      removeOnComplete: true,
      removeOnFail: false,
      jobId: jobUuid // Set the job ID explicitly to ensure it's a valid UUID
    });

    // Update message status to 'sent'
    console.log(`[ScheduledMessageWorker] Updating message status to 'sent': ${message.id}`);
    await supabase
      .from('scheduled_messages')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        message_id: jobUuid // Use the valid UUID here
      })
      .eq('id', message.id);

    // If this is a recurring message, schedule the next occurrence
    if (message.is_recurring && message.recurrence_pattern) {
      console.log(`[ScheduledMessageWorker] Processing recurring message: ${message.id}, pattern: ${message.recurrence_pattern}`);
      const nextDate = getNextScheduledDate(new Date(message.scheduled_at), message.recurrence_pattern);
      
      await supabase
        .from('scheduled_messages')
        .update({
          next_scheduled_at: nextDate.toISOString()
        })
        .eq('id', message.id);

      // Create a new scheduled message for the next occurrence
      console.log(`[ScheduledMessageWorker] Creating next occurrence for message: ${message.id}, scheduled at: ${nextDate.toISOString()}`);
      const newScheduledMessage = {
        connection_id: message.connection_id,
        contact_id: message.contact_id,
        message: message.message,
        type: message.type,
        media_url: message.media_url,
        caption: message.caption,
        scheduled_at: nextDate.toISOString(),
        owner_id: ownerId,
        status: 'pending',
        is_recurring: message.is_recurring,
        recurrence_pattern: message.recurrence_pattern,
        next_scheduled_at: getNextScheduledDate(nextDate, message.recurrence_pattern).toISOString(),
        media: message.media
      };
      
      const { error: insertError } = await supabase
        .from('scheduled_messages')
        .insert(newScheduledMessage);

      if (insertError) {
        console.error('[ScheduledMessageWorker] Error creating next recurring message:', insertError);
      }
    }

    console.log(`[ScheduledMessageWorker] Successfully processed message ${message.id}`);
    return true;
  } catch (error) {
    console.error(`[ScheduledMessageWorker] Error processing message ${message.id}:`, error);
    
    // Check if this is a connection error
    const isConnectionError = error.message && (
      error.message.includes('Connection') || 
      error.message.includes('active connection') ||
      error.message.includes('No active connection')
    );
    
    // Update message status based on error type
    try {
      await supabase
        .from('scheduled_messages')
        .update({
          // If it's a connection error, keep it as pending for retry
          status: isConnectionError ? 'pending' : 'failed',
          error_message: error.message || 'Unknown error'
        })
        .eq('id', message.id);
    } catch (updateError) {
      console.error(`[ScheduledMessageWorker] Error updating message status:`, updateError);
    }
    
    return false;
  }
}

// Validate UUID format
function isValidUUID(uuid) {
  if (!uuid) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Main function to process all pending scheduled messages
async function processScheduledMessages() {
  console.log('[ScheduledMessageWorker] Checking for pending scheduled messages');
  
  try {
    // Use direct SQL query instead of RPC function to avoid schema cache issues
    const { data, error } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true });
    
    if (error) {
      console.error('[ScheduledMessageWorker] Error fetching pending messages:', error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      console.log('[ScheduledMessageWorker] No pending scheduled messages found');
      return;
    }
    
    console.log(`[ScheduledMessageWorker] Found ${data.length} pending scheduled messages`);
    
    // Get unique connection IDs from the messages
    const connectionIds = [...new Set(data.map(message => message.connection_id))];
    console.log(`[ScheduledMessageWorker] Found ${connectionIds.length} unique connections to check`);
    
    // Check all connections at once
    const { data: connections, error: connectionsError } = await supabase
      .from('connections')
      .select('id, connected, status, api_key')
      .in('id', connectionIds);
      
    if (connectionsError) {
      console.error('[ScheduledMessageWorker] Error fetching connections:', connectionsError);
    }
    
    // Create a map of active connections for quick lookup
    const activeConnections = new Map();
    if (connections) {
      connections.forEach(conn => {
        activeConnections.set(conn.id, {
          active: conn.connected === true,
          api_key: conn.api_key
        });
        // Cache connection details
        connectionCache.set(conn.id, conn);
      });
    }
    
    // Process each message
    for (const message of data) {
      try {
        // Check if connection is in our active map
        const connectionInfo = activeConnections.get(message.connection_id);
        const isConnectionActive = connectionInfo && connectionInfo.active;
                                  
        if (!isConnectionActive) {
          console.log(`[ScheduledMessageWorker] Skipping message ${message.id} - connection ${message.connection_id} is not active`);
          
          // Update message with connection error but keep as pending
          await supabase
            .from('scheduled_messages')
            .update({
              status: 'pending',
              error_message: `Connection ${message.connection_id} is not active`
            })
            .eq('id', message.id);
            
          continue;
        }
        
        await processScheduledMessage(message);
      } catch (messageError) {
        console.error(`[ScheduledMessageWorker] Error processing message ${message.id}:`, messageError);
        // Continue processing other messages even if one fails
      }
    }
    
    console.log('[ScheduledMessageWorker] Finished processing scheduled messages');
  } catch (error) {
    console.error('[ScheduledMessageWorker] Error processing scheduled messages:', error);
  }
}

// Function to schedule next message processing based on database
async function scheduleNextProcessing() {
  try {
   // console.log('[ScheduledMessageWorker] Calculating next processing time...');
    
    // Find the next pending message
    const { data, error } = await supabase
      .from('scheduled_messages')
      .select('id, scheduled_at')
      .eq('status', 'pending')
      .order('scheduled_at', { ascending: true })
      .limit(1);
    
    if (error) {
      console.error('[ScheduledMessageWorker] Error finding next message:', error);
      // Schedule next check in 1 minute as fallback
      console.log('[ScheduledMessageWorker] Scheduling fallback check in 1 minute due to error');
      global.nextCheckTimeout = setTimeout(scheduleNextProcessing, 60000);
      return;
    }
    
    // If no pending messages, check again in 5 minutes
    if (!data || data.length === 0) {
      //console.log('[ScheduledMessageWorker] No pending messages, checking again in 5 minutes');
      global.nextCheckTimeout = setTimeout(scheduleNextProcessing, 5 * 60000);
      return;
    }
    
    const nextMessageId = data[0].id;
    const nextMessageTime = new Date(data[0].scheduled_at);
    const now = new Date();
    
   // console.log(`[ScheduledMessageWorker] Next message ${nextMessageId} scheduled for ${nextMessageTime.toISOString()}`);
    
    // If the next message is due now or in the past, process immediately
    if (nextMessageTime <= now) {
      console.log('[ScheduledMessageWorker] Found messages due now, processing immediately');
      await processScheduledMessages();
      // Schedule next check after a short delay
      console.log('[ScheduledMessageWorker] Scheduling next check in 1 second after processing');
      global.nextCheckTimeout = setTimeout(scheduleNextProcessing, 1000);
      return;
    }
    
    // Calculate delay until next message
    const delay = nextMessageTime.getTime() - now.getTime();
    
    // If delay is more than 5 minutes, use a 5-minute check instead
    // This ensures we don't miss any newly created messages
    const actualDelay = Math.min(delay, 5 * 60000);
    
    // Clear any existing timeout
    if (global.nextCheckTimeout) {
      console.log('[ScheduledMessageWorker] Clearing existing timeout');
      clearTimeout(global.nextCheckTimeout);
    }
    
    console.log(`[ScheduledMessageWorker] Next message due in ${Math.round(delay/1000)} seconds, checking in ${Math.round(actualDelay/1000)} seconds`);
    
    // Schedule the next check
    global.nextCheckTimeout = setTimeout(() => {
      console.log('[ScheduledMessageWorker] Smart scheduler timeout triggered');
      scheduleNextProcessing();
    }, actualDelay);
    
    console.log(`[ScheduledMessageWorker] Smart scheduler set, next check at ${new Date(Date.now() + actualDelay).toISOString()}`);
  } catch (error) {
    console.error('[ScheduledMessageWorker] Error scheduling next processing:', error);
    // Fallback to checking in 1 minute
    console.log('[ScheduledMessageWorker] Scheduling fallback check in 1 minute due to error');
    global.nextCheckTimeout = setTimeout(scheduleNextProcessing, 60000);
  }
}

// Set up database triggers via Realtime subscription
async function setupRealtimeSubscription() {
  try {
    console.log('[ScheduledMessageWorker] Setting up Realtime subscription for scheduled_messages');
    
    // Menggunakan pendekatan yang lebih sederhana tanpa Realtime subscription
    // Karena Realtime subscription menyebabkan error "bind.callback is not a function"
    
    console.log('[ScheduledMessageWorker] Using polling approach instead of Realtime subscription');
    
    // Set up interval to check for new messages every 30 seconds
    // This is a fallback approach until we can fix the Realtime subscription
    const checkInterval = setInterval(async () => {
      console.log('[ScheduledMessageWorker] Polling for new scheduled messages');
      try {
        // Check for pending messages
        await processScheduledMessages();
        // Update next processing time
        await scheduleNextProcessing();
      } catch (error) {
        console.error('[ScheduledMessageWorker] Error in polling interval:', error);
      }
    }, 30000); // 30 seconds
    
    // Store interval reference for cleanup
    global.checkInterval = checkInterval;
    
    console.log('[ScheduledMessageWorker] Polling setup complete');
    return { type: 'polling', interval: checkInterval };
  } catch (error) {
    console.error('[ScheduledMessageWorker] Error setting up message monitoring:', error);
    return null;
  }
}

// Start the cron job to run every 5 minutes as a fallback (changed from every minute)
cron.schedule('*/5 * * * *', async () => {
  console.log('[ScheduledMessageWorker] Running scheduled fallback check (every 5 minutes)');
  try {
    await processScheduledMessages();
    
    // After processing, schedule the next check based on actual data
    // This ensures we're not just relying on the cron job
    scheduleNextProcessing();
  } catch (error) {
    console.error('[ScheduledMessageWorker] Unhandled error in cron job:', error);
  }
});

// Initialize the worker
async function initializeWorker() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║                                                                        ║
║  SCHEDULED MESSAGE WORKER STARTED                                      ║
║  Using optimized event-driven processing                               ║
║  Checking for messages using smart scheduling                          ║
║  Fallback check every 5 minutes                                        ║
║                                                                        ║
╚════════════════════════════════════════════════════════════════════════╝
`);

  try {
    // Cleanup any existing intervals/timeouts
    if (global.checkInterval) {
      console.log('[ScheduledMessageWorker] Cleaning up existing polling interval');
      clearInterval(global.checkInterval);
    }
    
    if (global.nextCheckTimeout) {
      console.log('[ScheduledMessageWorker] Cleaning up existing timeout');
      clearTimeout(global.nextCheckTimeout);
    }
    
    // Set up monitoring for scheduled messages
    await setupRealtimeSubscription();
    
    // Initial processing
    await processScheduledMessages();
    
    // Start the smart scheduling
    console.log('[ScheduledMessageWorker] Starting smart scheduling');
    scheduleNextProcessing();
    
    // Log confirmation that initialization is complete
    console.log('[ScheduledMessageWorker] Worker successfully initialized');
  } catch (error) {
    console.error('[ScheduledMessageWorker] Error during initialization:', error);
    console.log('[ScheduledMessageWorker] Falling back to cron-based scheduling');
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[ScheduledMessageWorker] SIGTERM received, shutting down gracefully');
  if (global.checkInterval) {
    clearInterval(global.checkInterval);
  }
  if (global.nextCheckTimeout) {
    clearTimeout(global.nextCheckTimeout);
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[ScheduledMessageWorker] SIGINT received, shutting down gracefully');
  if (global.checkInterval) {
    clearInterval(global.checkInterval);
  }
  if (global.nextCheckTimeout) {
    clearTimeout(global.nextCheckTimeout);
  }
  process.exit(0);
});

// Start the worker
initializeWorker();

export {
  processScheduledMessages,
  processSingleScheduledMessage
}; 