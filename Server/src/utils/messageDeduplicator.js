/**
 * Message Deduplication Service
 * 
 * This module provides a robust way to prevent duplicate messages from being sent
 * by using Redis as a distributed lock and tracking mechanism.
 */

import Redis from 'ioredis';
import crypto from 'crypto';

// Initialize Redis client with optimized settings
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  // Optimized Redis settings
  connectTimeout: 10000,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    return Math.min(times * 200, 3000); // Exponential backoff capped at 3s
  }
});

// In-memory cache to reduce Redis calls
const memoryCache = {
  sent: new Map(),
  locks: new Map()
};

// Konfigurasi timeout dan TTL
const LOCK_TTL = parseInt(process.env.DEDUP_LOCK_TTL || '300'); // 5 menit
const SENT_TTL = parseInt(process.env.DEDUP_SENT_TTL || '86400'); // 24 jam
const MEMORY_CACHE_TTL = parseInt(process.env.DEDUP_MEMORY_TTL || '60000'); // 1 menit
const LOCK_WAIT_TIMEOUT = parseInt(process.env.DEDUP_LOCK_WAIT || '2000'); // 2 detik

/**
 * Generate a unique message fingerprint
 * @param {Object} message - Message details
 * @returns {string} - Unique fingerprint
 */
function generateMessageFingerprint(message) {
  const {
    connectionId,
    to,
    type,
    content,
    mediaId,
    jobId,
    timestamp = Date.now()
  } = message;

  // Create a deterministic representation of the message
  const contentToHash = JSON.stringify({
    connectionId: connectionId || '',
    to: to || '',
    type: type || 'text',
    content: content || '',
    mediaId: mediaId || '',
    jobId: jobId || '',
    // Don't include timestamp in the hash to make it deterministic
  });

  return crypto.createHash('md5').update(contentToHash).digest('hex');
}

/**
 * Acquire a distributed lock
 * @param {string} fingerprint - Message fingerprint
 * @param {number} ttl - Lock TTL in milliseconds
 * @returns {Promise<boolean>} - True if lock was acquired
 */
async function acquireLock(fingerprint, ttl = LOCK_TTL) {
  const lockKey = `lock:message:${fingerprint}`;
  
  // Check memory cache first
  if (memoryCache.locks.has(fingerprint)) {
    const lockEntry = memoryCache.locks.get(fingerprint);
    if (Date.now() - lockEntry.timestamp < lockEntry.ttl) {
      return false; // Lock already exists
    }
    // Lock expired, remove from memory
    memoryCache.locks.delete(fingerprint);
  }
  
  try {
    // Try to set lock with NX (only if not exists) and expiration
    const result = await redis.set(lockKey, '1', 'PX', ttl, 'NX');
  
    // If lock was acquired, also store in memory cache
    if (result === 'OK') {
      memoryCache.locks.set(fingerprint, {
        timestamp: Date.now(),
        ttl
      });
      return true;
}

    return false;
  } catch (error) {
    console.warn(`[MessageDeduplicator] Redis error acquiring lock: ${error.message}`);
    
    // Use memory-only lock as fallback
    if (!memoryCache.locks.has(fingerprint)) {
      memoryCache.locks.set(fingerprint, {
        timestamp: Date.now(),
        ttl
      });
      return true;
    }
    
    return false;
  }
}

/**
 * Mark a message as sent
 * @param {string} fingerprint - Message fingerprint
 * @param {Object} metadata - Message metadata
 * @param {number} ttl - TTL in milliseconds
 * @returns {Promise<boolean>} - True if successful
 */
async function markAsSent(fingerprint, metadata = {}, ttl = SENT_TTL) {
  try {
    // Store in memory cache
    memoryCache.sent.set(fingerprint, {
      data: metadata,
      timestamp: Date.now()
    });
    
    // Store in Redis
    try {
    await redis.set(
        `sent:message:${fingerprint}`,
        JSON.stringify(metadata),
      'EX', 
        Math.floor(ttl / 1000) // Convert ms to seconds for Redis
    );
    } catch (redisError) {
      console.warn(`[MessageDeduplicator] Redis error storing sent status: ${redisError.message}`);
      // Continue execution since we already stored in memory
    }
    
    // Release the lock
    try {
    await redis.del(`lock:message:${fingerprint}`);
    } catch (redisError) {
      console.warn(`[MessageDeduplicator] Redis error releasing lock: ${redisError.message}`);
    }
    
    memoryCache.locks.delete(fingerprint);
    
    return true;
  } catch (error) {
    console.error(`[MessageDeduplicator] Error marking message as sent: ${error.message}`);
    
    // Try to release the lock even on error
    try {
      await redis.del(`lock:message:${fingerprint}`);
    } catch (redisError) {
      // Just ignore at this point
    }
    
    memoryCache.locks.delete(fingerprint);
    
    return false;
  }
}

/**
 * Check if a message has already been sent
 * @param {string} fingerprint - Message fingerprint
 * @returns {Promise<boolean>} - True if message was already sent
 */
async function isAlreadySent(fingerprint) {
  // Check memory cache first (fast)
  if (memoryCache.sent.has(fingerprint)) {
    const cacheEntry = memoryCache.sent.get(fingerprint);
    if (Date.now() - cacheEntry.timestamp < MEMORY_CACHE_TTL) {
      return true; // Found in memory cache
    }
  }
  
  const sentKey = `sent:message:${fingerprint}`;
  
  try {
    const exists = await redis.exists(sentKey);
    return exists === 1;
  } catch (error) {
    console.warn(`[MessageDeduplicator] Redis error checking if message was sent: ${error.message}`);
    // Default to not sent on Redis error to prevent missing messages
    // But still check memory cache as fallback
    return memoryCache.sent.has(fingerprint);
  }
}

/**
 * Get metadata for a sent message
 * @param {string} fingerprint - Message fingerprint
 * @returns {Promise<Object|null>} - Message metadata or null if not found
 */
async function getSentMetadata(fingerprint) {
  // Check memory cache first
  if (memoryCache.sent.has(fingerprint)) {
    const cacheEntry = memoryCache.sent.get(fingerprint);
    if (Date.now() - cacheEntry.timestamp < MEMORY_CACHE_TTL) {
      return cacheEntry.data;
    }
  }
  
  const sentKey = `sent:message:${fingerprint}`;
  
  try {
    const data = await redis.get(sentKey);
    if (!data) return null;
    
    try {
      const parsedData = JSON.parse(data);
      
      // Update memory cache
      memoryCache.sent.set(fingerprint, {
        data: parsedData,
        timestamp: Date.now()
      });
      
      return parsedData;
    } catch (parseError) {
      console.warn(`[MessageDeduplicator] Error parsing message metadata: ${parseError.message}`);
      return null;
    }
  } catch (redisError) {
    console.warn(`[MessageDeduplicator] Redis error getting message metadata: ${redisError.message}`);
    
    // Return from memory cache if available, even if expired
    if (memoryCache.sent.has(fingerprint)) {
      return memoryCache.sent.get(fingerprint).data;
    }
    
    return null;
  }
}

/**
 * Clean expired entries from memory cache
 */
function cleanupMemoryCache() {
  const now = Date.now();
  
  // Clean sent cache
  for (const [fingerprint, entry] of memoryCache.sent.entries()) {
    if (now - entry.timestamp > MEMORY_CACHE_TTL) {
      memoryCache.sent.delete(fingerprint);
    }
  }
  
  // Clean locks cache
  for (const [fingerprint, entry] of memoryCache.locks.entries()) {
    if (now - entry.timestamp > entry.ttl) {
      memoryCache.locks.delete(fingerprint);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupMemoryCache, 60000);

/**
 * Execute a function with deduplication
 * @param {Object} message - Message details
 * @param {Function} sendFunction - Function to execute if message is not a duplicate
 * @returns {Promise<Object>} - Result of the function or skipped status
 */
async function withDeduplication(message, sendFunction) {
  try {
    // Generate fingerprint
    const fingerprint = generateMessageFingerprint(message);
    
    // Check if already sent
    if (await isAlreadySent(fingerprint)) {
      const metadata = await getSentMetadata(fingerprint);
      console.log(`[MessageDeduplicator] Skipping duplicate message to ${message.to}`);
      return {
        success: true,
        skipped: true,
        messageId: metadata?.messageId || 'unknown',
        contact: message.to,
        deduplicationFingerprint: fingerprint
      };
    }
    
    // Try to acquire lock
    let lockAcquired = false;
    let waitTime = 0;
    const startTime = Date.now();
    
    // Try to acquire lock with timeout
    while (!lockAcquired && waitTime < LOCK_WAIT_TIMEOUT) {
      lockAcquired = await acquireLock(fingerprint);
      if (!lockAcquired) {
        // Wait a bit before retrying
        const delay = Math.min(100, LOCK_WAIT_TIMEOUT - waitTime);
        await new Promise(resolve => setTimeout(resolve, delay));
        waitTime += delay;
      }
    }
    
    // If we couldn't acquire the lock, check if message was sent by another process
    if (!lockAcquired) {
      if (await isAlreadySent(fingerprint)) {
        const metadata = await getSentMetadata(fingerprint);
        console.log(`[MessageDeduplicator] Message was sent by another process to ${message.to}`);
        return {
          success: true,
          skipped: true,
          messageId: metadata?.messageId || 'unknown',
          contact: message.to,
          deduplicationFingerprint: fingerprint
        };
      }
      
      // If not sent and we couldn't acquire lock, something is wrong
      console.warn(`[MessageDeduplicator] Could not acquire lock for ${fingerprint} and message not sent`);
      throw new Error('Could not acquire lock for message deduplication');
    }
    
    try {
      // Execute the function
      const result = await sendFunction();
      
      // If successful, mark as sent
      if (result && result.success) {
        // Determine message ID from various possible formats
        let messageId;
        if (result.messageId) {
          messageId = result.messageId;
        } else if (result.messageIds && result.messageIds.length > 0) {
          messageId = result.messageIds[0];
        } else if (result.mediaMessageId) {
          messageId = result.mediaMessageId;
        } else {
          messageId = 'unknown';
        }
        
        // Store metadata about the sent message
        const metadata = {
          messageId,
          timestamp: Date.now(),
          to: message.to,
          type: message.type,
          // For media messages, store additional info
          isMedia: message.type === 'media',
          mediaId: message.mediaId,
          assetId: message.assetId || message.asset_id,
          // Include result data
          result: {
            success: true,
            channel: result.channel || 'http',
            directSending: !!result.directSending,
            fallbackUsed: !!result.fallbackUsed
          }
        };
        
        await markAsSent(fingerprint, metadata);
        return result;
      }
      
      // If not successful, release lock and return result
      await redis.del(`lock:message:${fingerprint}`);
      memoryCache.locks.delete(fingerprint);
      
      return result;
    } catch (error) {
      // Release lock on error
      try {
        await redis.del(`lock:message:${fingerprint}`);
        memoryCache.locks.delete(fingerprint);
      } catch (redisError) {
        // Just log, don't throw
        console.warn(`[MessageDeduplicator] Error releasing lock: ${redisError.message}`);
      }
      
      console.error(`[MessageDeduplicator] Error in deduplication process: ${error.message}`);
      throw error;
    }
  } catch (error) {
    console.error(`[MessageDeduplicator] Error in withDeduplication: ${error.message}`);
    // Return error result
    return {
      success: false,
      error: error.message,
      contact: message.to
    };
  }
}

// Export the module functions
export {
  withDeduplication,
  generateMessageFingerprint,
  isAlreadySent,
  markAsSent,
  acquireLock,
  getSentMetadata
}; 