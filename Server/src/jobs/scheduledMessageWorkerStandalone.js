/**
 * Standalone Scheduled Message Worker
 * Versi yang tidak menggunakan Supabase Realtime untuk menghindari error
 */

import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import { broadcastQueue } from '../broadcast/queue.js';
import { broadcastJobs } from '../broadcast/supabaseClient.js';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║                                                                        ║
║  STANDALONE SCHEDULED MESSAGE WORKER                                   ║
║  Versi yang tidak menggunakan Supabase Realtime                        ║
║  Menggunakan polling untuk memeriksa pesan terjadwal                   ║
║                                                                        ║
╚════════════════════════════════════════════════════════════════════════╝
`);

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

// Cache for connection API keys
const connectionCache = new Map();

// Helper function to get connection details including API key
async function getConnectionDetails(connectionId) {
  try {
    // Check cache first
    if (connectionCache.has(connectionId)) {
      return connectionCache.get(connectionId);
    }

    console.log(`[ScheduledWorker] Getting connection details for ${connectionId}`);
    
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
        console.error(`[ScheduledWorker] Error parsing Redis connection info:`, e);
      }
    }
    
    // Get from database if not in Redis
    const { data, error } = await supabase
      .from('connections')
      .select('id, name, phone_number, api_key, connected, status')
      .eq('id', connectionId)
      .single();
    
    if (error) {
      console.error(`[ScheduledWorker] Error fetching connection details:`, error);
      throw error;
    }
    
    if (!data) {
      console.error(`[ScheduledWorker] Connection not found for ID: ${connectionId}`);
      return null;
    }
    
    // Cache in Redis
    await redis.set(redisKey, JSON.stringify(data), 'EX', 3600);
    
    // Cache in memory
    connectionCache.set(connectionId, data);
    
    return data;
  } catch (error) {
    console.error(`[ScheduledWorker] Error getting connection details:`, error);
    return null;
  }
}

// Helper function to get contact details
async function getContactDetails(contactId) {
  try {
    console.log(`[ScheduledWorker] Fetching contact details for ID: ${contactId}`);
    
    // If contactId is a number or numeric string, try to get from database
    if (!isNaN(contactId)) {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single();
      
      if (error) {
        console.error(`[ScheduledWorker] Error fetching contact details:`, error);
        throw error;
      }
      
      if (!data) {
        console.error(`[ScheduledWorker] Contact not found for ID: ${contactId}`);
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
    console.error(`[ScheduledWorker] Error fetching contact details for ID ${contactId}:`, error);
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

// Validate UUID format
function isValidUUID(uuid) {
  if (!uuid) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Process a single scheduled message
async function processScheduledMessage(message) {
  console.log(`[ScheduledWorker] Processing scheduled message ${message.id}`);
  
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
      
      console.log(`[ScheduledWorker] Message ${message.id} kept as pending due to inactive connection`);
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
    
    console.log(`[ScheduledWorker] Creating broadcast job for message ${message.id}`);
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

    // Add the job to the queue
    console.log(`[ScheduledWorker] Adding job to queue: ${jobUuid}`);
    await broadcastQueue.add('broadcast', {
      contacts: [contact],
      message: messageData.message,
      connectionId: message.connection_id,
      apiKey: connection.api_key, // Add API key from the connection
      type: messageData.type,
      mediaUrl: messageData.mediaUrl,
      caption: messageData.caption,
      media: messageData.media,
      dbJobId: jobUuid, // Use the valid UUID here
      deduplicationId: `scheduled_${message.id}`,
      parentJobId: uuidv4()
    }, {
      priority: 2,
      removeOnComplete: true,
      removeOnFail: false,
      jobId: jobUuid // Set the job ID explicitly to ensure it's a valid UUID
    });

    // Update message status to 'sent'
    console.log(`[ScheduledWorker] Updating message status to 'sent': ${message.id}`);
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
      console.log(`[ScheduledWorker] Processing recurring message: ${message.id}, pattern: ${message.recurrence_pattern}`);
      const nextDate = getNextScheduledDate(new Date(message.scheduled_at), message.recurrence_pattern);
      
      await supabase
        .from('scheduled_messages')
        .update({
          next_scheduled_at: nextDate.toISOString()
        })
        .eq('id', message.id);

      // Create a new scheduled message for the next occurrence
      console.log(`[ScheduledWorker] Creating next occurrence for message: ${message.id}, scheduled at: ${nextDate.toISOString()}`);
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
        console.error('[ScheduledWorker] Error creating next recurring message:', insertError);
      }
    }

    console.log(`[ScheduledWorker] Successfully processed message ${message.id}`);
    return true;
  } catch (error) {
    console.error(`[ScheduledWorker] Error processing message ${message.id}:`, error);
    
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
      console.error(`[ScheduledWorker] Error updating message status:`, updateError);
    }
    
    return false;
  }
}

// Process a specific scheduled message by ID
async function processSingleScheduledMessage(messageId) {
  try {
    console.log(`[ScheduledWorker] Processing specific message: ${messageId}`);
    
    // Fetch the message
    const { data, error } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('id', messageId)
      .single();
    
    if (error) {
      console.error(`[ScheduledWorker] Error fetching message ${messageId}:`, error);
      return false;
    }
    
    if (!data) {
      console.error(`[ScheduledWorker] Message ${messageId} not found`);
      return false;
    }
    
    // Process the message
    return await processScheduledMessage(data);
  } catch (error) {
    console.error(`[ScheduledWorker] Error processing specific message ${messageId}:`, error);
    return false;
  }
}

// Main function to process all pending scheduled messages
async function processScheduledMessages() {
  console.log('[ScheduledWorker] Checking for pending scheduled messages');
  
  try {
    // Use direct SQL query instead of RPC function to avoid schema cache issues
    const { data, error } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true });
    
    if (error) {
      console.error('[ScheduledWorker] Error fetching pending messages:', error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      console.log('[ScheduledWorker] No pending scheduled messages found');
      return;
    }
    
    console.log(`[ScheduledWorker] Found ${data.length} pending scheduled messages`);
    
    // Get unique connection IDs from the messages
    const connectionIds = [...new Set(data.map(message => message.connection_id))];
    console.log(`[ScheduledWorker] Found ${connectionIds.length} unique connections to check`);
    
    // Check all connections at once
    const { data: connections, error: connectionsError } = await supabase
      .from('connections')
      .select('id, connected, status, api_key')
      .in('id', connectionIds);
      
    if (connectionsError) {
      console.error('[ScheduledWorker] Error fetching connections:', connectionsError);
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
          console.log(`[ScheduledWorker] Skipping message ${message.id} - connection ${message.connection_id} is not active`);
          
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
        console.error(`[ScheduledWorker] Error processing message ${message.id}:`, messageError);
        // Continue processing other messages even if one fails
      }
    }
    
    console.log('[ScheduledWorker] Finished processing scheduled messages');
  } catch (error) {
    console.error('[ScheduledWorker] Error processing scheduled messages:', error);
  }
}

// Start the worker with polling approach
console.log('[ScheduledWorker] Starting standalone worker with polling approach');

// Process messages immediately on startup
processScheduledMessages().catch(error => {
  console.error('[ScheduledWorker] Error during initial processing:', error);
});

// Set up polling interval (check every 30 seconds)
const pollingInterval = setInterval(() => {
  processScheduledMessages().catch(error => {
    console.error('[ScheduledWorker] Error during polling:', error);
  });
}, 30000);

// Also set up cron job as a backup (every 5 minutes)
cron.schedule('*/5 * * * *', () => {
  console.log('[ScheduledWorker] Running scheduled backup check (every 5 minutes)');
  processScheduledMessages().catch(error => {
    console.error('[ScheduledWorker] Error during cron job:', error);
  });
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[ScheduledWorker] SIGTERM received, shutting down gracefully');
  clearInterval(pollingInterval);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[ScheduledWorker] SIGINT received, shutting down gracefully');
  clearInterval(pollingInterval);
  process.exit(0);
});

console.log('[ScheduledWorker] Worker initialized and running');

export {
  processScheduledMessages,
  processSingleScheduledMessage
}; 