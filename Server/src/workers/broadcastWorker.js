// Proses job broadcast
import { RateLimiter } from 'bullmq';
import IORedis from 'ioredis';
import { supabase, supabaseAdmin } from '../utils/supabaseClient.js';
import { loggerUtils as logger } from '../utils/logger.js';

// Setup Redis connection
const redisOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
};

const connection = new IORedis(redisOptions);

const processJob = async (job) => {
  try {
    const { contacts, message, connectionId, userId, messageType, options } = job.data;
    
    let maxSpeed = 10;
    let needsWatermark = false;
    
    try {
      // Cek subscription aktif
      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .select('*, plans(*)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (subError && subError.code !== 'PGRST116') {
        throw subError;
      }

      if (subscription) {
        // User punya subscription aktif, gunakan limit dari paket
        if (subscription.plans?.limits?.max_speed_msg_per_min) {
          maxSpeed = subscription.plans_new.limits.max_speed_msg_per_min;
        }
        // Pastikan tidak ada watermark untuk user berbayar
        needsWatermark = false; 
      } else {
        // Tidak ada subscription, cek apakah user dalam masa trial
        const { data: connection, error: connError } = await supabase
          .from('connections')
          .select('expired_date')
          .eq('id', connectionId)
          .single();

        if (connError) throw connError;

        if (connection && new Date(connection.expired_date) > new Date()) {
          // User dalam masa trial, tambahkan watermark
          needsWatermark = true;
        }
      }
      
      logger.info(`Using rate limit: ${maxSpeed} messages/minute. Watermark: ${needsWatermark}`, { userId, connectionId });

    } catch (error) {
      logger.warn('Failed to get subscription or trial details, using defaults', { 
        error: error.message, 
        userId 
      });
    }
    
    // Initialize rate limiter based on the user's plan or trial status
    const rateLimiter = new RateLimiter({
      connection,
      queueName: 'broadcast-limiter',
      max: maxSpeed,
      duration: 60 * 1000, // Per minute in milliseconds
      groupKey: `broadcast:${userId}`
    });
    
    // Apply watermark if needed
    let messageContent = message;
    if (needsWatermark && typeof message === 'string') {
      messageContent = `${message}\n\n---\nSent via WhatsApp Automation Suite`;
    }
    
    // Check if the job can proceed
    const { success, remaining } = await rateLimiter.limit();
    if (!success) {
      // If rate limited, re-queue the job with a delay
      await job.moveToDelayed(Date.now() + 5000, job.token);
      logger.warn(`Rate limited for user ${userId}. Re-queuing with delay. Remaining: ${remaining}`);
      throw new Error(`Rate limited for user ${userId}. Re-queuing.`);
    }
    
    // Update job data with modified message if watermark was added
    if (needsWatermark && typeof message === 'string') {
      job.data.message = messageContent;
    }
    
    // ... rest of the existing code ...
    logger.info(`Processing broadcast job for user ${userId} with ${contacts.length} contacts`);
    
  } catch (error) {
    logger.error('Error processing job', { error: error.message });
  }
};

export { processJob }; 