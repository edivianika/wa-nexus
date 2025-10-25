/**
 * Modul untuk mengirim pesan langsung, tanpa melewati API HTTP
 * Digunakan oleh broadcastWorker untuk mengirim pesan dengan lebih efisien
 */

import broadcastConnectionFactory from './broadcastConnectionFactory.js';
// Attempt to load ConnectionManager only for server context, not broadcast worker
let getConnectionManager;
try {
  const { getConnectionManager: getCM } = await import('./connectionManagerSingleton.js');
  getConnectionManager = getCM;
} catch (e) {
  // If not available in worker context, this will be undefined
}

import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import axios from 'axios';
import { withDeduplication } from './messageDeduplicator.js';

// Log level control
const LOG_LEVEL = process.env.LOG_LEVEL || 'error'; // 'error', 'warn', 'info', 'debug'
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[LOG_LEVEL] || 0;

// Konfigurasi timeout dan retry
const CONNECTION_TIMEOUT = parseInt(process.env.CONNECTION_TIMEOUT || '15000'); // 15 detik
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '30000'); // 30 detik
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3');
const RETRY_DELAY_BASE = parseInt(process.env.RETRY_DELAY_BASE || '1000'); // 1 detik
const RETRY_JITTER_MAX = parseInt(process.env.RETRY_JITTER_MAX || '1000'); // 1 detik jitter maksimum
const CONNECTION_FAILURE_TTL = parseInt(process.env.CONNECTION_FAILURE_TTL || '300000'); // 5 menit

// Cache untuk koneksi yang gagal untuk menghindari percobaan berulang
const failedConnectionsCache = new Map();

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

/**
 * Format nomor telepon ke format JID WhatsApp yang valid
 * @param {string} number - Nomor telepon tujuan
 * @returns {string} - Nomor dalam format WhatsApp JID
 */
function formatWhatsAppJid(number) {
  if (!number) return '';
  // Jika sudah mengandung @, return apa adanya
  if (number.includes('@')) return number;
  // Hanya ambil digit
  const clean = number.replace(/[^0-9]/g, '');
  return `${clean}@s.whatsapp.net`;
}

/**
 * Mendeteksi tipe media berdasarkan mimetype atau ekstensi file
 * @param {string} filePath - Path ke file media
 * @param {string} mimeType - MIME type file (optional)
 * @returns {Object} - Objek berisi mediaType dan mimetype yang terdeteksi
 */
function detectMediaType(filePath, mimeType) {
  let mediaType = 'document';
  let mimetype = mimeType || 'application/octet-stream';
  
  // Jika mimetype sudah ditentukan
  if (mimeType) {
    if (mimeType.startsWith('image/')) mediaType = 'image';
    else if (mimeType.startsWith('video/')) mediaType = 'video';
    else if (mimeType.startsWith('audio/')) mediaType = 'audio';
    else mediaType = 'document';
    
    return { mediaType, mimetype };
  }
  
  // Jika mimetype tidak ditentukan, deteksi dari ekstensi
  const ext = path.extname(filePath).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
    mediaType = 'image';
    mimetype = 'image/jpeg';
  }
  else if ([".mp4", ".mov", ".webm"].includes(ext)) {
    mediaType = 'video';
    mimetype = 'video/mp4';
  }
  else if ([".mp3", ".ogg", ".wav"].includes(ext)) {
    mediaType = 'audio';
    mimetype = 'audio/mpeg';
  }
  else if (ext === '.pdf') {
    mediaType = 'document';
    mimetype = 'application/pdf';
  }
  
  return { mediaType, mimetype };
}

/**
 * Kirim pesan WhatsApp langsung tanpa melewati HTTP API
 * @param {Object} options - Opsi pengiriman pesan
 * @param {string} options.connectionId - ID koneksi WhatsApp
 * @param {string} options.to - Nomor tujuan
 * @param {string} options.type - Tipe pesan ('text' atau 'media')
 * @param {string} options.message - Pesan teks (untuk tipe 'text')
 * @param {string} options.mediaFullPath - Path ke file media (untuk tipe 'media')
 * @param {string} options.caption - Caption untuk media (untuk tipe 'media')
 * @param {Array} options.media - Array objek media (untuk pesan multi-media)
 * @param {string} options.jobId - Optional job ID for tracking
 * @returns {Promise<Object>} - Hasil pengiriman pesan
 */
async function sendDirectMessage(options) {
  const { 
    connectionId, 
    to, 
    type = 'text', 
    message, 
    mediaFullPath, 
    caption,
    media = [],
    assetId,
    jobId
  } = options;
  
  if (!connectionId || !to) {
    throw new Error('connectionId dan to diperlukan');
  }
  
  // Check if this connection has recently failed
  const failedKey = `${connectionId}:direct`;
  if (failedConnectionsCache.has(failedKey)) {
    const failedData = failedConnectionsCache.get(failedKey);
    if (Date.now() - failedData.timestamp < CONNECTION_FAILURE_TTL) {
      log(`[DirectMessageSender] Skipping direct method for recently failed connection ${connectionId}`, 'info');
      return await sendViaHttp(options);
    }
    // Clear old failure data
    failedConnectionsCache.delete(failedKey);
  }
  
  // Create a deduplication message object
  const deduplicationMessage = {
    connectionId,
    to: formatWhatsAppJid(to),
    type,
    content: type === 'text' ? message : caption || message,
    mediaId: mediaFullPath || (media && media.length > 0 ? media[0].fullPath || media[0].url : null) || assetId,
    jobId
  };
  
  // Use our deduplication service
  return await withDeduplication(deduplicationMessage, async () => {
    try {
      // OPTIMISASI & STRATEGI:
      // 1. Pesan teks: Gunakan Redis PubSub (cepat & ringan)
      // 2. Pesan media: Gunakan HTTP API (lebih reliabel untuk media)
      
      // Deteksi tipe pesan dengan lebih baik
      const isMediaMessage = 
        type === 'media' || 
        mediaFullPath || 
        (Array.isArray(media) && media.length > 0) ||
        assetId ||
        options.mediaUrl;
      
      // Untuk pesan media, langsung gunakan HTTP API (lebih reliable)
      if (isMediaMessage) {
        log(`[DirectMessageSender] Media message detected, using HTTP fallback for ${connectionId.substring(0, 8)} to ${to}`, 'info');
        return await sendViaHttp(options);
      }
      
      const formattedTo = formatWhatsAppJid(to);
      
      if (!message && type === 'text') {
        throw new Error('message diperlukan untuk pesan teks');
      }
      
      // Prioritas 1: Gunakan broadcastConnectionFactory (Redis PubSub)
      try {
        log(`[DirectMessageSender] Sending text via Redis PubSub for ${connectionId.substring(0, 8)}`, 'debug');
        
        // Cek apakah koneksi ini sudah pernah gagal sebelumnya
        const failedInfo = failedConnectionsCache.get(failedKey);
        if (failedInfo && (Date.now() - failedInfo.timestamp < CONNECTION_FAILURE_TTL)) {
          log(`[DirectMessageSender] Skipping recently failed connection ${connectionId.substring(0, 8)}: ${failedInfo.error}`, 'warn');
          throw new Error(`Connection recently failed: ${failedInfo.error}`);
        }
        
        // Gunakan Promise.race untuk menambahkan timeout
        const getConnectionPromise = broadcastConnectionFactory.getConnection(connectionId);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('broadcastConnectionFactory.getConnection timed out after ' + CONNECTION_TIMEOUT + 'ms')), CONNECTION_TIMEOUT)
        );
        
        let connection = null;
        try {
          connection = await Promise.race([getConnectionPromise, timeoutPromise]);
        } catch (connError) {
          log(`[DirectMessageSender] Failed to get connection: ${connError.message}`, 'warn');
          // Mark this connection as failed
          failedConnectionsCache.set(failedKey, { 
            timestamp: Date.now(),
            error: connError.message
          });
          throw connError;
        }
        
        if (!connection || !connection.sendMessage) {
          const errorMsg = 'Koneksi tidak ditemukan atau tidak valid di BroadcastConnectionFactory';
          log(`[DirectMessageSender] ${errorMsg}`, 'warn');
          
          // Mark this connection as failed
          failedConnectionsCache.set(failedKey, { 
            timestamp: Date.now(),
            error: errorMsg
          });
          
          throw new Error(errorMsg);
        }
        
        // Gunakan Promise.race untuk menambahkan timeout pada sendMessage
        const sendMessagePromise = connection.sendMessage(formattedTo, { text: message });
        const sendTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('sendMessage timed out after ' + CONNECTION_TIMEOUT + 'ms')), CONNECTION_TIMEOUT)
        );
        
        let sent = null;
        try {
          sent = await Promise.race([sendMessagePromise, sendTimeoutPromise]);
        } catch (sendError) {
          log(`[DirectMessageSender] Failed to send message: ${sendError.message}`, 'warn');
          throw sendError;
        }
        
        log(`[DirectMessageSender] Text sent via Redis PubSub`, 'debug');
        
        return { 
          success: true, 
          messageId: sent?.key?.id || 'unknown_id',
          contact: to,
          channel: 'redis_pubsub',
          directSending: true
        };
      } catch (redisPubSubError) {
        log(`[DirectMessageSender] Redis PubSub error: ${redisPubSubError.message}`, 'warn');
        
        // Prioritas 2: Coba dari ConnectionManager (jika dalam konteks server)
        if (getConnectionManager) {
          try {
            log(`[DirectMessageSender] Trying via ConnectionManager`, 'debug');
            
            const connectionManager = getConnectionManager();
            let connection = null;
            
            try {
              connection = connectionManager.getConnection(connectionId);
            } catch (connManagerError) {
              log(`[DirectMessageSender] ConnectionManager.getConnection error: ${connManagerError.message}`, 'warn');
              throw connManagerError;
            }
            
            // Validasi koneksi
            if (!connection || !connection.sendMessage) {
              const errorMsg = 'Koneksi tidak ditemukan di ConnectionManager';
              log(`[DirectMessageSender] ${errorMsg}`, 'warn');
              throw new Error(errorMsg);
            }
            
            // Gunakan Promise.race untuk menambahkan timeout pada sendMessage
            const sendMessagePromise = connection.sendMessage(formattedTo, { text: message });
            const sendTimeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('ConnectionManager.sendMessage timed out after ' + CONNECTION_TIMEOUT + 'ms')), CONNECTION_TIMEOUT)
            );
            
            let sent = null;
            try {
              sent = await Promise.race([sendMessagePromise, sendTimeoutPromise]);
            } catch (sendError) {
              log(`[DirectMessageSender] ConnectionManager.sendMessage error: ${sendError.message}`, 'warn');
              throw sendError;
            }
            
            log(`[DirectMessageSender] Text sent via ConnectionManager`, 'debug');
            
            return { 
              success: true, 
              messageId: sent?.key?.id || 'unknown_id',
              contact: to,
              channel: 'direct_connection',
              directSending: true
            };
          } catch (connectionError) {
            log(`[DirectMessageSender] ConnectionManager error: ${connectionError.message}`, 'warn');
            
            // Mark this connection as failed for a period of time
            failedConnectionsCache.set(failedKey, { 
              timestamp: Date.now(),
              error: connectionError.message
            });
          }
        }
        
        // Prioritas 3: Fallback ke HTTP API
        log(`[DirectMessageSender] All direct methods failed, using HTTP fallback`, 'info');
        return await sendViaHttp(options);
      }
    } catch (error) {
      log(`[DirectMessageSender] Error in sendDirectMessage: ${error.message}`, 'error');
      
      // Try HTTP API as last resort
      try {
        return await sendViaHttp(options);
      } catch (httpError) {
        log(`[DirectMessageSender] HTTP API fallback also failed: ${httpError.message}`, 'error');
        return {
          success: false,
          error: `Failed to send message: ${error.message}. HTTP fallback also failed: ${httpError.message}`,
          contact: to
        };
      }
    }
  });
}

/**
 * Kirim pesan melalui HTTP API (fallback method)
 * @param {Object} options - Opsi pengiriman pesan yang sama dengan sendDirectMessage
 * @returns {Promise<Object>} - Hasil pengiriman pesan
 */
async function sendViaHttp(options) {
  const { 
    connectionId, 
    to, 
    type, 
    message, 
    mediaUrl, 
    mediaFullPath, 
    caption,
    apiKey,
    contactData,
    media = [],
    asset_id,
    assetId,
    jobId
  } = options;
  
  const fallbackStartTime = Date.now();
  
  // Clean message from any extra quotes and ensure it's a string
  const cleanMessage = message ? String(message).replace(/^"|"$/g, '').trim() : message;

  // Use SEND_MESSAGE_API_URL from environment variables
  const apiUrl = process.env.SEND_MESSAGE_API_URL;
  if (!apiUrl) {
    throw new Error('SEND_MESSAGE_API_URL is not set in environment variables');
  }

  // Ensure URL ends with /api/sendbroadcast
  let endpoint;
  if (apiUrl.match(/\/api\//)) {
    // Ganti path setelah /api/ menjadi sendbroadcast
    endpoint = apiUrl.replace(/(\/api\/)[^/]*$/, '$1sendbroadcast');
  } else {
    endpoint = apiUrl.replace(/\/$/, '') + '/api/sendbroadcast';
  }
  
  let effectiveApiKey = apiKey;

  if (!effectiveApiKey) {
    // Try to get API key from connection ID if not provided
    try {
      const { data: connection } = await broadcastConnectionFactory.getSupabase()
        .from('connections')
        .select('api_key')
        .eq('id', connectionId)
        .single();
        
      if (connection && connection.api_key) {
        options.apiKey = connection.api_key;
        effectiveApiKey = connection.api_key;
      } else {
        throw new Error('API key not found for connection');
      }
    } catch (error) {
      throw new Error('API key is required for sending messages via HTTP');
    }
  }
  
  const headers = { 
    'Content-Type': 'application/json', 
    'Authorization': `Bearer ${effectiveApiKey}`,
    'x-user-id': options.userId || '', // Add user ID if available
    'x-job-id': jobId || '' // Add job ID for tracking
  };

  // Fungsi untuk mengirim permintaan dengan retry dan exponential backoff
  const sendWithRetry = async (sendFunction) => {
    const maxRetries = MAX_RETRIES;
    let retryCount = 0;
    let lastError = null;
    
    while (retryCount <= maxRetries) {
      try {
        return await sendFunction();
      } catch (error) {
        lastError = error;
        retryCount++;
        
        // More detailed error logging
        const errorMessage = error.response 
          ? `Status: ${error.response.status}`
          : error.message;
          
        // Check for rate limiting (429)
        const isRateLimited = error.response && error.response.status === 429;
        
        if (retryCount <= maxRetries) {
          // Exponential backoff with jitter: 2^n * base_delay + random(0-jitter_max)ms
          // For rate limiting, use longer delays
          const baseDelay = isRateLimited ? RETRY_DELAY_BASE * 2 : RETRY_DELAY_BASE;
          const waitTime = Math.min(
            60000, // Max 60 seconds
            (Math.pow(2, retryCount) * baseDelay) + Math.floor(Math.random() * RETRY_JITTER_MAX)
          );
          
          log(`[DirectMessageSender] HTTP request failed: ${errorMessage}, retry ${retryCount}/${maxRetries} in ${waitTime}ms`, 'warn');
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          log(`[DirectMessageSender] Error after ${maxRetries} attempts: ${errorMessage}`, 'error');
          throw error;
        }
      }
    }
    
    throw lastError || new Error('Failed to send message via HTTP after retries');
  };

  // Determine if this is a media message
  const isMediaMessage = 
    type === 'media' || 
    mediaUrl || 
    mediaFullPath || 
    (Array.isArray(media) && media.length > 0) ||
    asset_id ||
    assetId;

  try {
    // Handle media messages
    if (isMediaMessage) {
      // Consolidate asset ID from various sources
      const effectiveAssetId = asset_id || assetId || (media && media.length > 0 ? media[0].assetId : null);
      
      // CASE 1: Single Media with Caption
      if (Array.isArray(media) && media.length > 0) {
        const mediaItem = media[0];
        const payload = {
          to: to.endsWith('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`,
          type: 'media',
          isBroadcast: true,
          caption: caption || cleanMessage || mediaItem.caption, // Use top-level caption, message, or item-specific caption
          mediaUrl: mediaItem.url || mediaUrl,
          mediaFullPath: mediaItem.fullPath || mediaFullPath,
          filename: mediaItem.filename,
          mimetype: mediaItem.mimetype,
          assetId: effectiveAssetId, // Include asset ID for media handling
          jobId // Include jobId for tracking
        };
        
        log(`[DirectMessageSender] Sending media message with payload: ${JSON.stringify({
          to: payload.to,
          type: payload.type,
          hasCaption: !!payload.caption,
          hasMediaUrl: !!payload.mediaUrl,
          hasMediaFullPath: !!payload.mediaFullPath,
          hasAssetId: !!payload.assetId
        })}`, 'debug');
        
        const response = await sendWithRetry(() => axios.post(endpoint, payload, {
          headers: {
            ...headers,
            'X-Retry-Count': '0'
          },
          timeout: REQUEST_TIMEOUT 
        }));

        if (!response.data || !response.data.messageId) {
          throw new Error('Invalid API response when sending single media.');
        }
        
        const fallbackEndTime = Date.now();
        const fallbackDuration = fallbackEndTime - fallbackStartTime;
        log(`[DirectMessageSender] 🔄 Media message sent to ${to} in ${fallbackDuration}ms`, 'info');
        
        return {
          success: true,
          messageIds: [response.data.messageId],
          contact: to,
          fallbackUsed: true
        };
      } 
      
      // ---- CASE 2 & 3 : media based on assetId or direct URL ----
      const genericMediaPayload = {
          to: to.endsWith('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`,
          type: 'media',
          isBroadcast: true,
          caption: caption || cleanMessage,
        assetId: effectiveAssetId || undefined,
        mediaUrl: mediaUrl || undefined,
        mediaFullPath: mediaFullPath || undefined,
          jobId
        };
        
      const genericResponse = await sendWithRetry(() => axios.post(endpoint, genericMediaPayload, {
          headers,
          timeout: REQUEST_TIMEOUT
        }));
        
      if (!genericResponse.data || !genericResponse.data.messageId) {
        throw new Error('Invalid API response when sending media message.');
      }
        
        return {
          success: true,
        messageIds: [genericResponse.data.messageId],
          contact: to,
          fallbackUsed: true
        };
    }
    
    // ---------- TEXT MESSAGE ----------
    const textPayload = {
      to: to.endsWith('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`,
      message: cleanMessage,
      type: 'text',
      isBroadcast: true,
      jobId
    };
    
    const textResponse = await sendWithRetry(() => axios.post(endpoint, textPayload, {
      headers,
      timeout: REQUEST_TIMEOUT
    }));
    
    if (!textResponse.data || !textResponse.data.messageId) {
      throw new Error('Invalid API response when sending text message.');
    }
    
    return {
      success: true,
      messageIds: [textResponse.data.messageId],
      contact: to,
      fallbackUsed: true
    };
  } catch (error) {
    log(`[DirectMessageSender] Failed to send message via HTTP: ${error.message}`, 'error');
    return {
      success: false,
      error: error.message,
      contact: to,
      fallbackUsed: true
    };
  }
}

export {
  sendDirectMessage,
  formatWhatsAppJid,
  detectMediaType
}; 