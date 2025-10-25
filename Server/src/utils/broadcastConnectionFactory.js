import 'dotenv/config';

/**
 * BroadcastConnectionFactory - Redis-based message broker for WhatsApp
 */

import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';

// Singleton instance
let instance = null;

// Nama channel Redis untuk komunikasi
const BROADCAST_REQUEST_CHANNEL = 'whatsapp:broadcast:requests';
const BROADCAST_RESPONSE_CHANNEL_PREFIX = 'whatsapp:broadcast:responses:';

// Konfigurasi timeout dan retry
const CONNECTION_TIMEOUT = parseInt(process.env.CONNECTION_TIMEOUT || '15000'); // 15 detik
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '15000'); // 15 detik
const CACHE_TTL = parseInt(process.env.CONNECTION_CACHE_TTL || '3600'); // 1 jam
const MAX_PENDING_REQUESTS = parseInt(process.env.MAX_PENDING_REQUESTS || '100'); // Maksimum 100 request tertunda

class BroadcastConnectionFactory {
  constructor() {
    this.pendingRequests = new Map();
    this.requestTimeouts = new Map();
    this.connectionErrors = new Map();
    this.lastCleanupTime = Date.now();
    
    // Redis untuk Pub/Sub dengan optimasi
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      connectTimeout: 10000,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        return Math.min(times * 200, 3000); // Exponential backoff capped at 3s
      }
    });
    
    // Dedicated subscriber client
    this.subscriber = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      connectTimeout: 10000,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        return Math.min(times * 200, 3000); // Exponential backoff capped at 3s
      }
    });

    // Supabase connection
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Connection info cache
    this.connectionInfoCache = new Map();
    
    // Setup subscriber for responses
    this.setupResponseSubscriber();
    
    // Periodic cleanup
    setInterval(() => this.cleanupPendingRequests(), 60000); // Cleanup every minute
  }

  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!instance) {
      instance = new BroadcastConnectionFactory();
    }
    return instance;
  }
  
  /**
   * Setup subscriber for responses
   */
  setupResponseSubscriber() {
    // Unique channel for this worker
    this.responseChannel = `${BROADCAST_RESPONSE_CHANNEL_PREFIX}${process.pid}`;
    
    // Subscribe
    this.subscriber.subscribe(this.responseChannel);
    
    // Handle messages
    this.subscriber.on('message', (channel, message) => {
      if (channel === this.responseChannel) {
        try {
          const response = JSON.parse(message);
          const { requestId, result, error } = response;
          
          if (this.pendingRequests.has(requestId)) {
            const { resolve, reject } = this.pendingRequests.get(requestId);
            
            // Clear timeout
            if (this.requestTimeouts.has(requestId)) {
              clearTimeout(this.requestTimeouts.get(requestId));
              this.requestTimeouts.delete(requestId);
            }
            
            // Handle response
            if (error) {
              reject(new Error(error));
            } else {
              resolve(result);
            }
            
            // Clean up
            this.pendingRequests.delete(requestId);
          }
        } catch (err) {
          console.error(`[BroadcastConnectionFactory] Error parsing response:`, err);
        }
      }
    });
    
    console.log(`[BroadcastConnectionFactory] Listening on ${this.responseChannel}`);
  }

  /**
   * Cleanup stale pending requests
   */
  cleanupPendingRequests() {
    const now = Date.now();
    
    // Cleanup connection info cache
    for (const [connectionId, info] of this.connectionInfoCache.entries()) {
      if (now - info.timestamp > CACHE_TTL * 1000) {
        this.connectionInfoCache.delete(connectionId);
      }
    }
    
    // Cleanup connection errors
    for (const [connectionId, errorInfo] of this.connectionErrors.entries()) {
      if (now - errorInfo.timestamp > 300000) { // 5 minutes
        this.connectionErrors.delete(connectionId);
      }
    }
    
    // Log if too many pending requests
    if (this.pendingRequests.size > MAX_PENDING_REQUESTS) {
      console.warn(`[BroadcastConnectionFactory] High number of pending requests: ${this.pendingRequests.size}`);
    }
    
    this.lastCleanupTime = now;
  }

  /**
   * Get connection wrapper
   */
  async getConnection(connectionId) {
    if (!connectionId) {
      throw new Error('connectionId diperlukan');
    }
    
    // Check for recent errors with this connection
    if (this.connectionErrors.has(connectionId)) {
      const errorInfo = this.connectionErrors.get(connectionId);
      if (Date.now() - errorInfo.timestamp < 60000) { // 1 minute cooldown
        throw new Error(`Connection ${connectionId} recently failed: ${errorInfo.message}`);
      }
      // Clear old error
      this.connectionErrors.delete(connectionId);
    }
    
    // Get connection info
    let connectionInfo;
    try {
      connectionInfo = await this.getConnectionInfo(connectionId);
    } catch (error) {
      // Track connection error
      this.connectionErrors.set(connectionId, {
        timestamp: Date.now(),
        message: error.message
      });
      throw error;
    }
    
    // Create wrapper
    return this.createConnectionWrapper(connectionId, connectionInfo);
  }
  
  /**
   * Get connection info
   */
  async getConnectionInfo(connectionId) {
    // Check cache
    if (this.connectionInfoCache.has(connectionId)) {
      const cachedInfo = this.connectionInfoCache.get(connectionId);
      if (Date.now() - cachedInfo.timestamp < CACHE_TTL * 1000) {
        return cachedInfo.data;
      }
    }
    
    try {
      // Try Redis
      const redisKey = `connection:${connectionId}`;
      let connectionInfo = null;
      let redisError = null;
      
      try {
        // Get data from Redis
        const redisData = await this.redis.get(redisKey);
      
        if (redisData) {
          try {
            // Validate that we have a proper string before parsing
            if (typeof redisData === 'string') {
              connectionInfo = JSON.parse(redisData);
            
            // Validate connection info
            if (connectionInfo && connectionInfo.id && connectionInfo.api_key) {
              // Cache in memory with timestamp
              this.connectionInfoCache.set(connectionId, {
                data: connectionInfo,
                timestamp: Date.now()
              });
              
              return connectionInfo;
      } else {
              console.warn(`[BroadcastConnectionFactory] Invalid connection data from Redis for ${connectionId}, falling back to database`);
              }
            } else {
              console.warn(`[BroadcastConnectionFactory] Redis data is not a string: ${typeof redisData}, falling back to database`);
              redisError = new Error(`Redis data is not a string: ${typeof redisData}`);
            }
          } catch (parseError) {
            console.warn(`[BroadcastConnectionFactory] Error parsing Redis data: ${parseError.message}, falling back to database`);
            redisError = parseError;
          }
        } else {
          console.log(`[BroadcastConnectionFactory] No data in Redis for ${connectionId}, falling back to database`);
        }
      } catch (redisConnectionError) {
        console.warn(`[BroadcastConnectionFactory] Redis connection error: ${redisConnectionError.message}, falling back to database`);
        redisError = redisConnectionError;
      }
      
      // Get from database as fallback
      try {
        const { data, error } = await this.supabase
          .from('connections')
          .select('*')
          .eq('id', connectionId)
          .single();

        if (error) {
          console.error(`[BroadcastConnectionFactory] Database error for connection ${connectionId}: ${error.message}`);
          throw new Error(`Koneksi ${connectionId} tidak dapat diakses: ${error.message}`);
        }

        if (!data) {
          throw new Error(`Koneksi ${connectionId} tidak ditemukan`);
        }

        connectionInfo = data;
        
        // Validate connection info
        if (!connectionInfo || !connectionInfo.id || !connectionInfo.api_key) {
          throw new Error(`Data koneksi ${connectionId} tidak valid dari database`);
        }
        
        // Cache in Redis (only if Redis was working)
        if (!redisError) {
          try {
            // Ensure the data is serializable before storing in Redis
            const serializedData = JSON.stringify(connectionInfo);
            await this.redis.set(redisKey, serializedData, 'EX', CACHE_TTL);
          } catch (redisCacheError) {
            // Just log, don't fail the operation
            console.warn(`[BroadcastConnectionFactory] Failed to cache connection in Redis: ${redisCacheError.message}`);
          }
      }
      
        // Cache in memory with timestamp
        this.connectionInfoCache.set(connectionId, {
          data: connectionInfo,
          timestamp: Date.now()
        });
      
      return connectionInfo;
      } catch (dbError) {
        console.error(`[BroadcastConnectionFactory] Database error: ${dbError.message}`);
        
        // If we have connection info in cache but it's expired, use it as last resort
        const expiredCacheEntry = this.connectionInfoCache.get(connectionId);
        if (expiredCacheEntry && expiredCacheEntry.data) {
          console.warn(`[BroadcastConnectionFactory] Using expired cache as last resort for ${connectionId}`);
          return expiredCacheEntry.data;
        }
        
        throw dbError;
      }
    } catch (err) {
      console.error(`[BroadcastConnectionFactory] Error getting connection info for ${connectionId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Create connection wrapper
   */
  createConnectionWrapper(connectionId, info) {
    console.log(`[BroadcastConnectionFactory] Creating wrapper for ${connectionId}`);
    
    return {
      id: connectionId,
      name: info.name,
      phoneNumber: info.phone_number,
      apiKey: info.api_key,
      
      sendMessage: async (jid, content, options = {}) => {
        try {
          // Check if too many pending requests
          if (this.pendingRequests.size > MAX_PENDING_REQUESTS) {
            throw new Error(`Too many pending requests (${this.pendingRequests.size}), try again later`);
          }
          
          // Special handling for media content - we need to send only file paths, not buffers
          let processedContent = content;
          let isMediaMessage = false;
          
          // Detect if this is a media message
          const mediaTypes = ['image', 'video', 'audio', 'document', 'sticker'];
          for (const type of mediaTypes) {
            if (content && content[type] !== undefined) {
              isMediaMessage = true;
              
              // If content[type] is Buffer, we need special handling
              if (Buffer.isBuffer(content[type])) {
                // Get the media path info only, not the buffer
                processedContent = {
                  ...content,
                  [type]: {
                    _mediaPathInfo: {
                      isBuffer: true,
                      mediaType: type,
                      mimetype: content.mimetype,
                      fileName: content.fileName
                    }
                  }
                };
                
                // Pass media path if available (for broadcastWorker which uses fullPath)
                if (options && options.mediaPath) {
                  processedContent[type]._mediaPathInfo.mediaPath = options.mediaPath;
                } else if (content.mediaPath) {
                  processedContent[type]._mediaPathInfo.mediaPath = content.mediaPath;
                }
              }
              break;
            }
          }
          
          // Create request ID
          const requestId = uuidv4();
          
          // Create request
          const request = {
            requestId,
            connectionId,
            responseChannel: this.responseChannel,
            action: 'sendMessage',
            data: { 
              jid, 
              content: processedContent, 
              options,
              isMediaMessage
            }
          };
          
          // Setup promise
          const responsePromise = new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });
            
            // Set timeout
            const timeout = setTimeout(() => {
              if (this.pendingRequests.has(requestId)) {
                reject(new Error(`Request timeout after ${REQUEST_TIMEOUT}ms`));
                this.pendingRequests.delete(requestId);
                this.requestTimeouts.delete(requestId);
              }
            }, REQUEST_TIMEOUT);
            
            this.requestTimeouts.set(requestId, timeout);
          });
          
          // Send request
          await this.redis.publish(BROADCAST_REQUEST_CHANNEL, JSON.stringify(request));
          
          // Wait for response
          return await responsePromise;
        } catch (error) {
          // Track connection error
          this.connectionErrors.set(connectionId, {
            timestamp: Date.now(),
            message: error.message
          });
          throw error;
        }
      }
    };
  }
}

// Create singleton
const factory = BroadcastConnectionFactory.getInstance();

export default factory; 