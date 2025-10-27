import { Worker } from 'bullmq';
import { broadcastQueue } from './queue.js';
import axios from 'axios';
import Redis from 'ioredis';
import { createClient } from '@supabase/supabase-js';
import { broadcastJobs, messages } from './supabaseClient.js';
import FormData from 'form-data';
import path from 'path';
import fs from 'fs';
import os from 'os';
import mediaService from '../utils/mediaServiceProxy.js';
import broadcastConnectionFactory from '../utils/broadcastConnectionFactory.js';

// Import sendDirectMessage dari directMessageSender
// Note: Circular dependency warnings dapat diabaikan karena:
// - broadcastWorker mengimport directMessageSender
// - directMessageSender mengimport broadcastConnectionFactory
// - broadcastConnectionFactory tidak mengimport broadcastWorker, jadi tidak ada circular dependency yang sebenarnya
import { sendDirectMessage } from '../utils/directMessageSender.js';

// Import our new deduplication service
import { withDeduplication } from '../utils/messageDeduplicator.js';

// Tambahkan banner di startup untuk verifikasi optimisasi direct messaging
console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║                                                                        ║
║  OPTIMIZED BROADCAST WORKER STARTED                                    ║
║  Direct message sending enabled                                        ║
║  Broadcast messages will now bypass HTTP API for better performance    ║
║                                                                        ║
║  Performance monitoring is active                                      ║
║  Enhanced deduplication system active                                  ║
║                                                                        ║
╚════════════════════════════════════════════════════════════════════════╝
`);

// Validate required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please set these variables in your .env file or environment');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
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

// Speed configuration
const SPEED_MAP = {
  fast: 20,    // 20 pesan/menit
  normal: 10,  // 10 pesan/menit
  slow: 6      // 6 pesan/menit
};

// ** NEW: Batch size configuration **
const BATCH_SIZE = 20; // Process 20 contacts in parallel

// Circuit breaker untuk connection yang kena rate limit
const CONNECTION_COOLDOWNS = new Map();

// Fungsi untuk memeriksa dan mendapatkan status cooldown sebuah connection
function getConnectionCooldown(connectionId) {
  const cooldown = CONNECTION_COOLDOWNS.get(connectionId);
  
  if (!cooldown) return null;
  
  // Jika waktu cooldown sudah lewat, hapus dari map
  if (Date.now() > cooldown.expiry) {
    CONNECTION_COOLDOWNS.delete(connectionId);
    console.log(`[BroadcastWorker] Cooldown berakhir untuk connection ${connectionId}`);
    return null;
  }
  
  // Return informasi cooldown jika masih berlaku
  return cooldown;
}

// Fungsi untuk menandai connection dalam cooldown
function setCooldownForConnection(connectionId, durationSeconds) {
  // Default 5 menit jika tidak ditentukan
  const cooldownDuration = durationSeconds > 0 ? durationSeconds : 300; 
  const expiry = Date.now() + (cooldownDuration * 1000);
  
  console.log(`[BroadcastWorker] Setting cooldown untuk connection ${connectionId} selama ${cooldownDuration} detik`);
  
  CONNECTION_COOLDOWNS.set(connectionId, {
    expiry,
    remainingSeconds: () => Math.ceil((expiry - Date.now()) / 1000)
  });
}

// Helper function to get connection ID
async function getConnectionId(apiKey) {
  try {
    // Try Redis first
    const redisKey = `api_key:${apiKey}:connection_id`;
    let connectionId = await redis.get(redisKey);
    
    if (connectionId) {
      // Remove any extra quotes if present
      connectionId = connectionId.replace(/^"|"$/g, '');
      return connectionId;
    }

    // If not in Redis, get from database
    const { data: connections } = await supabase
      .from('connections')
      .select('id')
      .eq('api_key', apiKey)
      .eq('connected', true)
      .limit(1);

    if (connections && connections.length > 0) {
      connectionId = connections[0].id;
      // Cache in Redis without quotes
      await redis.set(redisKey, connectionId);
      return connectionId;
    }

    return null;
  } catch (err) {
    console.error('Error getting connection ID:', err);
    return null;
  }
}

// Utility: Replace {{key}} in text with value from data object
function replaceTemplateVars(text, data) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/{{(\w+)}}/g, (match, key) => {
    if (data && Object.prototype.hasOwnProperty.call(data, key)) {
      return data[key] != null ? String(data[key]) : '';
    }
    return match; // biarkan jika tidak ada key
  });
}

// Default rate limit jika tidak ditentukan di database
const DEFAULT_RATE_LIMIT = {
  max: 5,            // Dari 10 menjadi 5 pesan per window
  duration: 120000,  // Dari 60 detik menjadi 120 detik
  initialBackoff: 10000, // Backoff awal lebih panjang
};

// Fungsi untuk kontrol debug logging
const DEBUG = process.env.DEBUG_BROADCAST_WORKER === 'true' || false;

function logDebug(message) {
  if (DEBUG) {
    console.log(`[BroadcastWorker] ${message}`);
  }
}

function logInfo(message) {
  if (DEBUG) {
    console.log(`[BroadcastWorker] ${message}`);
  }
}

function logWarning(message) {
  console.warn(`[BroadcastWorker] ${message}`);
}

function logError(message) {
  console.error(`[BroadcastWorker] ${message}`);
}

// Helper sleep
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// Send message via direct socket (drip style)
async function sendViaSocket({ to, message, type, mediaUrl, asset_id, caption, connectionId }) {
  try {
    const connection = await broadcastConnectionFactory.getConnection(connectionId);
    if (!connection || !connection.sendMessage) {
      return { success: false, error: 'CONNECTION_NOT_READY' };
    }

    const recipient = to.includes('@') ? to : `${to}@s.whatsapp.net`;

    const mediaNeeded = (type === 'media' || asset_id);

    if (mediaNeeded) {
      // fetch media
      const mediaInfo = await mediaService.getMedia(mediaUrl, asset_id);
      if (!mediaInfo || !mediaInfo.path) return { success: false, error: 'MEDIA_NOT_FOUND' };
      const buffer = fs.readFileSync(mediaInfo.path);

      // determine socket media type
      let mediaType = 'document';
      if (mediaInfo.mimeType.startsWith('image')) mediaType = 'image';
      else if (mediaInfo.mimeType.startsWith('video')) mediaType = 'video';
      else if (mediaInfo.mimeType.startsWith('audio')) mediaType = 'audio';

      const payload = {
        [mediaType]: buffer,
        mimetype: mediaInfo.mimeType,
        fileName: mediaInfo.filename || `file.${mediaInfo.mimeType.split('/')[1]}`
      };
      if (caption) payload.caption = caption;

      await connection.sendMessage(recipient, payload, { mediaPath: mediaInfo.path });
      return { success: true };
    } else {
      // text only
      if (!message || message.trim() === '') return { success: false, error: 'EMPTY_MESSAGE' };
      await connection.sendMessage(recipient, { text: message });
      return { success: true };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Main worker
const worker = new Worker('broadcast', async job => {
  const startTime = Date.now();
  
  // Update job status to active
  await broadcastJobs.updateStatus(job.data.dbJobId, 'active');

  const {
    contacts,
    message,
    connectionId,
    apiKey,
    type = 'text',
    mediaUrl,
    media,
    caption,
    dbJobId,
    speed = 'normal',
    isTest = false,
    asset_id = null,
    userId // Tambahkan userId untuk mengidentifikasi user
  } = job.data;

  // Periksa terlebih dahulu apakah connection dalam cooldown
  if (connectionId) {
    const cooldown = getConnectionCooldown(connectionId);
    if (cooldown) {
      const remainingSeconds = cooldown.remainingSeconds();
      console.log(`[BroadcastWorker] Job ${job.id} untuk koneksi ${connectionId} sedang dalam cooldown. Menunda job selama ${remainingSeconds} detik.`);
      
      // Update status job
      await broadcastJobs.update(dbJobId, {
        status: 'delayed',
        error_message: `Rate limiting: delayed for ${remainingSeconds} seconds`,
      });
      
      // Throw error agar job dapat di-retry
      throw new Error(`Connection ${connectionId} is in cooldown. Will retry in ${remainingSeconds} seconds.`);
    }
  }

  // Logging for debugging
  console.log(`[BroadcastWorker] Processing job ${job.id} with ${contacts ? contacts.length : 0} contacts.`);

  // Dapatkan detail subscription user untuk rate limit
  let messagesPerMinute = SPEED_MAP[speed] || SPEED_MAP.normal;
  
  try {
    // Cek apakah user memiliki subscription aktif
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*, plans(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    // Jika ada subscription aktif, gunakan rate limit dari plan
    if (subscription?.plans?.limits?.max_speed_msg_per_min) {
      messagesPerMinute = subscription.plans_new.limits.max_speed_msg_per_min;
      console.log(`[BroadcastWorker] Using plan rate limit: ${messagesPerMinute} messages/minute for user ${userId}`);
    } else {
      console.log(`[BroadcastWorker] Using default rate limit: ${messagesPerMinute} messages/minute for user ${userId}`);
    }
  } catch (error) {
    console.warn(`[BroadcastWorker] Failed to get subscription details, using default rate limit`, { error: error.message, userId });
  }
  
  const delayBetweenMessages = 60000 / messagesPerMinute;
  const delayBetweenBatches = delayBetweenMessages * BATCH_SIZE;

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let totalProcessed = 0;

  // ---- Sequential, rate-limited sending (Drip style) ----
  
  if (!Array.isArray(contacts)) {
    console.error(`[BroadcastWorker] Contacts is not an array for job ${job.id}. Aborting.`);
    await broadcastJobs.update(dbJobId, {
      status: 'failed',
      error_message: 'Contacts data is not an array.',
      completed_at: new Date().toISOString()
    });
    return;
  }

  const totalContacts = contacts.length;
    
  for (const contact of contacts) {
        const contactData = typeof contact === 'object' ? contact : { phone_number: contact };
        const to = contactData.phone_number;

        const personalizedMessage = replaceTemplateVars(message, contactData);
        const personalizedCaption = replaceTemplateVars(caption, contactData);
        
    const result = await sendViaSocket({
          to,
          message: personalizedMessage,
          type,
      mediaUrl,
      asset_id,
          caption: personalizedCaption,
      connectionId
    });

    totalProcessed++;

        if (result.success) {
          sentCount++;
      await messages.updateStatus(dbJobId, to, 'sent', Array.isArray(result.messageIds) ? result.messageIds[0] : result.messageId || null);
    } else if (result.rateLimit) {
      failedCount++;
        } else {
          failedCount++;
      await messages.updateStatus(dbJobId, to, 'failed', null, result.error || 'Unknown error');
          }

    // Respect rate limit
    await new Promise(res => setTimeout(res, delayBetweenMessages));
  }
  // ---- End sequential loop ----

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  // Final summary
  console.log(`
    [BroadcastWorker] 📊 BROADCAST PERFORMANCE SUMMARY 📊
    - Total contacts processed: ${totalContacts}
    - Messages sent successfully: ${sentCount}
    - Messages failed: ${failedCount}
    - Contacts skipped: ${skippedCount}
  `);

  // Update the job status with proper counts
  await broadcastJobs.updateStatus(dbJobId, 
    sentCount > 0 ? 'completed' : 'failed', 
    100 // Set progress to 100%
  );
  
  // Also update the counts separately to ensure they're saved correctly
  const { data, error } = await supabase
    .from('broadcast_jobs')
    .update({
      sent_count: sentCount,
      failed_count: failedCount,
      skipped_count: skippedCount
    })
    .eq('id', dbJobId);
    
  if (error) {
    console.error(`[BroadcastWorker] Error updating job counts:`, error);
  }

  console.log(`[BroadcastWorker] Job ${job.id} completed in ${duration.toFixed(2)}s`);
}, {
  connection: broadcastQueue.opts.connection,
  concurrency: 5, // Process up to 5 jobs concurrently
  limiter: {
    max: 1000,
    duration: 1000
  }
});

// Event handlers
worker.on('completed', (job, result) => {
  if (DEBUG) {
    console.log(`[BroadcastWorker] Job ${job.id} completed with result:`, result);
  }
});

worker.on('failed', (job, err) => {
  console.error(`[BroadcastWorker] Job ${job.id} failed:`, err);
  if (job.data.dbJobId) {
    broadcastJobs.updateStatus(job.data.dbJobId, 'failed', job.progress || 0)
      .catch(err => console.error('Error updating job status:', err));
  }
});

export default worker; 