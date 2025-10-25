/**
 * WhatsApp Message Handler - Processor for broadcast requests via Redis
 * 
 * File ini bertugas menangani permintaan pengiriman pesan dari broadcast workers
 * yang dikirim melalui Redis pub/sub, kemudian meneruskannya ke koneksi WhatsApp
 * yang sudah ada di server utama.
 */

import Redis from 'ioredis';
import axios from 'axios';
import { getConnectionManager } from './connectionManagerSingleton.js';
import { promises as fs } from 'fs';

// Redis channels
const BROADCAST_REQUEST_CHANNEL = 'whatsapp:broadcast:requests';

// Log level control
const LOG_LEVEL = process.env.LOG_LEVEL || 'error'; // 'error', 'warn', 'info', 'debug'
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[LOG_LEVEL] || 0;

// Utility function for controlled logging
function log(message, level = 'debug') {
  if (LOG_LEVELS[level] <= CURRENT_LOG_LEVEL) {
    if (level === 'error') {
      console.error(message);
    } else if (level === 'warn') {
      console.warn(message);
    } else {
      console.log(message);
    }
  }
}

class WhatsAppMessageHandler {
  constructor() {
    // Redis client to subscribe to requests
    this.subscriber = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      // maxRetriesPerRequest must be null for BullMQ
    });

    // Redis client to publish responses
    this.publisher = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      // maxRetriesPerRequest must be null for BullMQ
    });

    // Cache untuk performa
    this.connectionManager = null;
  }

  /**
   * Memulai listener untuk permintaan pesan
   */
  start() {
    // Subscribe to broadcast request channel
    this.subscriber.subscribe(BROADCAST_REQUEST_CHANNEL);

    // Setup message handler
    this.subscriber.on('message', async (channel, message) => {
      if (channel === BROADCAST_REQUEST_CHANNEL) {
        try {
          const request = JSON.parse(message);
          const { requestId, connectionId, responseChannel, action, data } = request;

          // Validate request
          if (!requestId || !connectionId || !responseChannel || !action || !data) {
            log('[WhatsAppMessageHandler] Invalid request format', 'error');
            return;
          }

          log(`[WhatsAppMessageHandler] Received ${action} request for ${connectionId}`, 'debug');
          
          // Process request
          try {
            const result = await this.processRequest(connectionId, action, data);
            
            // Send success response
            await this.publisher.publish(responseChannel, JSON.stringify({
              requestId,
              result
            }));
            
            log(`[WhatsAppMessageHandler] Processed request ${requestId.substring(0, 8)}`, 'debug');
          } catch (error) {
            // Send error response
            await this.publisher.publish(responseChannel, JSON.stringify({
              requestId,
              error: error.message
            }));
            
            log(`[WhatsAppMessageHandler] Error processing request ${requestId.substring(0, 8)}: ${error.message}`, 'error');
          }
        } catch (err) {
          log('[WhatsAppMessageHandler] Failed to parse request: ' + err.message, 'error');
        }
      }
    });

    log('[WhatsAppMessageHandler] Started listening for broadcast requests', 'info');
  }

  /**
   * Process message request
   */
  async processRequest(connectionId, action, data) {
    // Get connection manager (lazy load)
    if (!this.connectionManager) {
      this.connectionManager = getConnectionManager();
    }

    // Get connection from manager
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    // Handle different action types
    switch (action) {
      case 'sendMessage':
        return await this.handleSendMessage(connection, data);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Handle send message request
   */
  async handleSendMessage(connection, data) {
    const { jid, content, options, isMediaMessage } = data;
    
    try {
      let processedContent = content;
      
      // Process media content if needed
      if (isMediaMessage) {
        const mediaTypes = ['image', 'video', 'audio', 'document', 'sticker'];
        
        for (const type of mediaTypes) {
          // Check if this media type exists in the content
          if (content[type] && content[type]._mediaPathInfo) {
            const mediaInfo = content[type]._mediaPathInfo;
            
            // Get the media path
            const mediaPath = mediaInfo.mediaPath;
            if (!mediaPath) {
              throw new Error(`Missing media path for ${type}`);
            }
            
            log(`[WhatsAppMessageHandler] Loading media from: ${mediaPath}`, 'debug');
            
            try {
              // Read the file from disk
              const fileBuffer = await fs.readFile(mediaPath);
              
              // Replace the placeholder with actual buffer
              processedContent = {
                ...content,
                [type]: fileBuffer,
                mimetype: mediaInfo.mimetype || content.mimetype,
                fileName: mediaInfo.fileName || content.fileName
              };
            } catch (fileError) {
              log(`[WhatsAppMessageHandler] Failed to read media file: ${fileError.message}`, 'error');
              throw new Error(`Media file not accessible: ${fileError.message}`);
            }
            
            break; // Only process one media type per message
          }
        }
      }
      
      // Coba kirim pesan melalui koneksi WhatsApp
      log(`[WhatsAppMessageHandler] Sending message to ${jid}`, 'debug');
      
      // Coba tunggu koneksi jika tersedia metodenya
      if (connection.waitForConnection) {
        const isConnected = await connection.waitForConnection(3000);
        if (!isConnected) {
          log(`[WhatsAppMessageHandler] Connection timeout for ${connection.id}, trying fallback`, 'warn');
          return await this.sendMessageFallback(connection.id, jid, processedContent, options);
        }
      }
      
      try {
        // Coba kirim pesan
        const result = await connection.sendMessage(jid, processedContent, options);
        
        // Clean up the result object to make it serializable
        const cleanResult = {
          key: result.key,
          status: 'sent'
        };
        
        return cleanResult;
      } catch (sendError) {
        log(`[WhatsAppMessageHandler] Error sending message: ${sendError.message}, trying fallback`, 'warn');
        
        // Jika error, coba gunakan fallback
        return await this.sendMessageFallback(connection.id, jid, processedContent, options);
      }
    } catch (error) {
      log(`[WhatsAppMessageHandler] Error sending message to ${jid}: ${error.message}`, 'error');
      throw error;
    }
  }
  
  /**
   * Fallback untuk mengirim pesan melalui API HTTP
   */
  async sendMessageFallback(connectionId, jid, content, options) {
    log(`[WhatsAppMessageHandler] Using HTTP fallback for ${jid}`, 'info');
    
    const maxRetries = 5; // Increased from 3 to 5
    let retryCount = 0;
    let lastError = null;
    
    while (retryCount <= maxRetries) {
      try {
        
        // Dapatkan URL API dari konfigurasi
        const apiUrl = process.env.API_BASE_URL || 'http://localhost:3000';
        const endpoint = `${apiUrl}/api/messages/send`;
        
        // Siapkan payload
        const payload = {
          connectionId,
          to: jid,
          content,
          options
        };
        
        // Add timeout and retry tracking
        const startTime = Date.now();
        const timeoutMs = 15000; // Increased from 10000 to 15000
        
        // Kirim permintaan HTTP
        const response = await axios.post(endpoint, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Request': 'true', // Tanda bahwa ini adalah permintaan internal
            'X-Retry-Count': retryCount.toString() // Add retry count to headers for tracking
          },
          timeout: timeoutMs // 15 detik timeout
        });
        
        const duration = Date.now() - startTime;
        log(`[WhatsAppMessageHandler] HTTP fallback successful in ${duration}ms`, 'debug');
        
        return {
          key: { id: response.data?.messageId || `fallback-${Date.now()}` },
          status: 'sent',
          method: 'fallback',
          duration
        };
      } catch (fallbackError) {
        lastError = fallbackError;
        retryCount++;
        
        // More detailed error logging
        const errorMessage = fallbackError.response 
          ? `Status: ${fallbackError.response.status}`
          : fallbackError.message;
          
        if (retryCount <= maxRetries) {
          // Exponential backoff with jitter: 2^n * 1000 + random(0-1000)ms
          const waitTime = Math.min(30000, (Math.pow(2, retryCount) * 1000) + Math.floor(Math.random() * 1000));
          log(`[WhatsAppMessageHandler] HTTP fallback failed: ${errorMessage}, retry ${retryCount}/${maxRetries} in ${Math.round(waitTime/1000)}s`, 'warn');
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          log(`[WhatsAppMessageHandler] HTTP fallback failed after ${maxRetries} attempts: ${errorMessage}`, 'error');
          throw new Error(`Failed to send message via fallback: ${fallbackError.message}`);
        }
      }
    }
    
    // Jika semua retry gagal
    throw lastError || new Error('Failed to send message via fallback after retries');
  }

  /**
   * Stop the handler
   */
  async stop() {
    await this.subscriber.unsubscribe(BROADCAST_REQUEST_CHANNEL);
    log('[WhatsAppMessageHandler] Stopped', 'info');
  }
}

export default new WhatsAppMessageHandler(); 