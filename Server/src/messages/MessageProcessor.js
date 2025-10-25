import { makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage, delay } from '@whiskeysockets/baileys';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import pino from 'pino';
import pretty from 'pino-pretty';
import FormData from 'form-data';
import { checkAndRunMessageTriggers } from './messageTriggers.js';

// Inisialisasi logger dengan format yang lebih mudah dibaca
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      levelFirst: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
      messageFormat: '{module} | {event} | {msg}',
      errorLikeObjectKeys: ['error', 'err'],
      singleLine: false,
      messageKey: 'message'
    }
  }
});

/**
 * Class untuk memproses pesan WhatsApp dengan efisiensi tinggi
 * Mengelola routing pesan ke agent dan webhook
 */
class MessageProcessor {
  /**
   * Konstruktor MessageProcessor
   * @param {Object} connection - Objek koneksi WhatsApp
   */
  constructor(connection) {
    this.connection = connection;
    
    // Inisialisasi logger
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          levelFirst: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
          messageFormat: '{module} | {event} | {msg}',
          errorLikeObjectKeys: ['error', 'err'],
          singleLine: false,
          messageKey: 'message'
        }
      }
    }).child({ 
      module: 'MessageProcessor',
      connectionId: connection.id 
    });
     
  }

  /**
   * Update konfigurasi webhook dan agent
   * @param {Object} webhookConfig - Konfigurasi webhook
   * @param {string} agentUrl - URL agent untuk pengiriman pesan
   */
  updateConfig(webhookConfig, agentUrl) {
    this.logger.info('Updating MessageProcessor config', {
      hasWebhookConfig: !!webhookConfig,
      hasWebhookUrl: webhookConfig?.url ? true : false,
      hasAgentUrl: !!agentUrl,
      agentUrl: agentUrl || 'not set'
    });
    
    // Update webhook config
    if (webhookConfig) {
      this.connection.webhookConfig = webhookConfig;
    }
    
    // Update agent URL
    if (agentUrl) {
      this.connection.agentUrl = agentUrl;
      this.logger.info(`Agent URL updated to: ${agentUrl}`);
    }
  }

  /**
   * Deteksi tipe pesan berdasarkan remoteJid
   * @param {string} remoteJid - Remote JID
   * @returns {string} - Tipe pesan (private, group, broadcast, newsletter, atau unknown)
   */
  detectMessageType(remoteJid) {
    if (!remoteJid) return 'unknown';
    
    if (remoteJid.endsWith('@broadcast')) {
      return 'broadcast';
    } else if (remoteJid.endsWith('@g.us')) {
      return 'group';
    } else if (remoteJid.endsWith('@s.whatsapp.net')) {
      return 'private';
    } else if (remoteJid.endsWith('@newsletter')) {
      return 'newsletter';
    } else {
      return 'unknown';
    }
  }

  /**
   * Proses pesan masuk
   * @param {Object} message - Objek pesan
   * @param {boolean} shouldSendWebhook - Flag untuk menentukan apakah perlu mengirim webhook
   * @param {string} userIdFromUpsert - User ID dari proses upsert
   * @param {boolean} shouldSendToAgent - Flag untuk menentukan apakah perlu mengirim ke agent
   */
  async processMessage(message, shouldSendWebhook, userIdFromUpsert, shouldSendToAgent, apiKey) {
    //try {
      // 1. Deteksi tipe pesan
      const messageType = this.detectMessageType(message.key.remoteJid);
      const contentType = this.getMessageContentType(message);
      const mediaType = this.getMediaType(message);

      // Jika pesan media, proses dengan processMediaMessage
      // Selalu kirim media ke agent jika ada agentUrl (tanpa memperhatikan shouldSendToAgent)
      if (contentType === 'media' && mediaType) {
        // Untuk pesan media, kita selalu kirim ke agent jika ada agent URL
        const sendMediaToAgent = this.connection.agentUrl ? true : shouldSendToAgent;
        
        await this.processMediaMessage(
          message,
          mediaType,
          shouldSendWebhook,
          sendMediaToAgent,
          userIdFromUpsert
        );
        return;
      }

      // 2. Buat data pesan untuk text
      const messageData = {
        type: "message",
        messageType: messageType,
        contentType: contentType,
        mediaType: mediaType,
        userId: userIdFromUpsert,
        connectionId: this.connection.id,
        agentId: this.connection.aiAgentId,
        devicesPhone: this.connection.phoneNumber || this.connection.id,
        message: {
          id: message.key.id,
          jid: message.key.remoteJid,
          fromPhone: (message.key.participant || message.key.remoteJid).split('@')[0],
          pushName: message.pushName || 'Unknown',
          timestamp: message.messageTimestamp 
            ? new Date(message.messageTimestamp * 1000).toISOString() 
            : new Date().toISOString(),
          content: this.getMessageContent(message),
          fromMe: message.key.fromMe === true,
          isForwarded: message.message?.extendedTextMessage?.contextInfo?.isForwarded || false
        }
      };

      // 3. Kirim ke agent jika diaktifkan
      if (shouldSendToAgent && this.connection.agentUrl) {
        try {
          const agentData = {
            ...messageData,
            settings: this.connection.agentSettings
          };
          await this.sendToAgent(agentData);
        } catch (error) {
          this.logger.error('Error sending to agent', {
            error: error.message,
            messageId: message.key.id
          });
        }
      }

      // 4. Kirim ke webhook jika diaktifkan
      if (shouldSendWebhook && this.connection.webhookConfig?.url) {
        try {
          await this.sendToWebhook(messageData);
        } catch (error) {
          this.logger.error('Error sending to webhook', {
            error: error.message,
            messageId: message.key.id
          });
        }
      }

    // } catch (error) {
    //   this.logger.error('Error processing message', {
    //     error: error.message,
    //     messageId: message?.key?.id
    //   });
    // }
  }

  /**
   * Deteksi tipe konten pesan
   * @param {Object} message - Objek pesan
   * @returns {string} - Tipe konten (text/media)
   */
  getMessageContentType(message) {
    if (message.message.conversation || message.message.extendedTextMessage) {
      return 'text';
    }
    return 'media';
  }

  /**
   * Deteksi tipe media
   * @param {Object} message - Objek pesan
   * @returns {string|null} - Tipe media atau null
   */
  getMediaType(message) {
    const mediaTypes = ['image', 'video', 'document', 'audio', 'sticker'];
    for (const type of mediaTypes) {
      if (message.message[`${type}Message`]) {
        return type;
      }
    }
    return null;
  }

  /**
   * Ambil konten pesan
   * @param {Object} message - Objek pesan
   * @returns {string} - Konten pesan
   */
  getMessageContent(message) {
    if (message.message.conversation) {
      return message.message.conversation;
    }
    if (message.message.extendedTextMessage) {
      return message.message.extendedTextMessage.text;
    }
    const mediaType = this.getMediaType(message);
    if (mediaType) {
      return message.message[`${mediaType}Message`]?.caption || '';
    }
    return '';
  }

  /**
   * Download media dari pesan
   * @param {Object} media - Objek media dari pesan
   * @returns {Promise<Buffer>} - Buffer media yang didownload
   */
  async downloadMedia(media) {
    try {
      this.logger.info('Downloading media', {
        type: media.type,
        mimetype: media.mimetype
      });
      
      // Log the full media object for debugging
      this.logger.debug('Full media object', JSON.stringify(media, null, 2));
      
      // Format pesan sesuai dengan yang diharapkan oleh downloadMediaMessage
      // Pastikan struktur pesan sesuai dengan yang diharapkan oleh baileys
      const messageObj = {
        key: {
          remoteJid: media.remoteJid || 'unknown',
          fromMe: false,
          id: media.id || 'unknown',
          participant: media.participant || 'unknown'
        },
        message: {
          [media.type + 'Message']: {
            ...media,
            // Pastikan properti yang diperlukan ada
            url: media.url || '',
            mimetype: media.mimetype || this.getDefaultMimeType(media.type),
            fileName: media.fileName || `file.${this.getFileExtension(media.mimetype || this.getDefaultMimeType(media.type))}`,
            caption: media.caption || '',
            contextInfo: media.contextInfo || {}
          }
        }
      };
      
      this.logger.debug('Formatted message for download', {
        messageType: media.type,
        hasUrl: !!media.url,
        hasMimetype: !!media.mimetype,
        messageStructure: JSON.stringify(messageObj, null, 2)
      });
      
      const buffer = await downloadMediaMessage(
        messageObj,
        'buffer',
        { },
        { 
          logger: this.logger,
          reuploadRequest: async (media) => {
            try {
              this.logger.debug('Reupload request triggered', { mediaUrl: media.url });
              const { data } = await axios.get(media.url, { responseType: 'arraybuffer' });
              return { data, mime: media.mimetype, ext: media.ext };
            } catch (error) {
              this.logger.error('Error in reuploadRequest', { error: error.message });
              throw error;
            }
          }
        }
      );
      
      if (!buffer) {
        throw new Error('Downloaded buffer is null or empty');
      }
      
      return buffer;
    } catch (error) {
      this.logger.error('Error downloading media', {
        error: error.message,
        type: media.type,
        mimetype: media.mimetype,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Proses pesan media
   * @param {Object} message - Objek pesan
   * @param {string} mediaType - Jenis media
   * @param {boolean} shouldSendWebhook - Flag untuk menentukan apakah perlu mengirim webhook
   * @param {boolean} shouldSendToAgent - Flag untuk menentukan apakah perlu mengirim ke agent
   * @param {string} userIdFromUpsert - User ID dari proses upsert
   */
  async processMediaMessage(message, mediaType, shouldSendWebhook, shouldSendToAgent, userIdFromUpsert) {
    try {
      if (!message || !message.key || !message.key.id) {
        this.logger.warn('Invalid media message structure', { message });
        return;
      }

      const messageType = this.detectMessageType(message.key.remoteJid);
      const mediaMessage = message.message[`${mediaType}Message`];
      
      if (!mediaMessage) {
        this.logger.warn('No media content found', { 
          messageId: message.key.id,
          mediaType,
        });
        return;
      }

      // Log jika media akan dikirim ke agent
      if (shouldSendToAgent) {
        this.logger.info('Media message will be forwarded to HTTP agent', {
          messageId: message.key.id,
          mediaType,
          agentUrl: this.connection.agentUrl || 'Not configured'
        });
      }

      // Hanya download media jika memang akan dikirim ke agent atau webhook
      if (!shouldSendToAgent && !shouldSendWebhook) {
        this.logger.info('Skip downloading media: not sending to agent or webhook', {
          messageId: message.key.id,
          mediaType
        });
        return;
      }

      // Validasi property penting
      if (!mediaMessage.url) {
        this.logger.error('Media message missing url property, cannot download media', {
          messageId: message.key.id,
          mediaType,
          mediaMessage: JSON.stringify(mediaMessage)
        });
        return;
      }

      // Check if media needs processing
      const needsProcessing = mediaMessage.mimetype && 
        (mediaType === 'image' || mediaType === 'video' || mediaType === 'document' || mediaType === 'audio');

      if (needsProcessing) {
        this.logger.info('Processing media message', {
          messageId: message.key.id,
          mediaType,
          mimeType: mediaMessage.mimetype,
          forwardToAgent: shouldSendToAgent
        });

        try {
          // Create a copy of the media message with additional properties
          const media = {
            ...mediaMessage,
            type: mediaType,
            remoteJid: message.key.remoteJid,
            id: message.key.id,
            participant: message.key.participant
          };
          
          // Log media object for debugging
          this.logger.debug('Media object before download', {
            type: media.type,
            hasUrl: !!media.url,
            hasMimetype: !!media.mimetype,
            hasFileName: !!media.fileName,
            remoteJid: media.remoteJid,
            id: media.id
          });
          
          const buffer = await this.downloadMedia(media);
          
          if (!buffer) {
            this.logger.error('Failed to download media - buffer is null', {
              messageId: message.key.id,
              mediaType,
            });
            return;
          }

          // Format data according to the requested structure
          const data = await this.createMessageData(message, 'media', mediaType, mediaMessage.caption || '', userIdFromUpsert);

          // Ambil filename dari mediaMessage atau fallback
          const filename = mediaMessage.fileName || `file.${this.getFileExtension(mediaMessage.mimetype || this.getDefaultMimeType(mediaType))}`;

          // Kirim ke agent dan/atau webhook dengan format yang benar
          await this.sendMediaToDestinations(message, data, shouldSendWebhook, shouldSendToAgent, buffer, mediaMessage.mimetype, filename);
        } catch (downloadError) {
          this.logger.error('Error downloading media', {
            error: downloadError.message,
            messageId: message.key.id,
            mediaType,
            stack: downloadError.stack
          });
          console.error('Full download error:', downloadError);
        }
      } else {
        this.logger.warn('Unsupported media type or missing mimetype', {
          messageId: message.key.id,
          mediaType,
        });
      }
    } catch (error) {
      this.logger.error('Error processing media message', {
        error: error.message,
        messageId: message?.key?.id,
        stack: error.stack
      });
      console.error('Full processing error:', error);
    }
  }

  /**
   * Buat data pesan untuk dikirim ke agent atau webhook
   * @param {Object} message - Objek pesan
   * @param {string} contentType - Tipe konten (text/media)
   * @param {string|null} mediaType - Tipe media jika ada
   * @param {string} content - Isi pesan
   * @returns {Object} - Data pesan
   */
  async createMessageData(message, contentType, mediaType, content, userIdFromUpsert) {
    const messageType = this.detectMessageType(message.key.remoteJid);
    const timestamp = message.messageTimestamp 
      ? new Date(message.messageTimestamp * 1000).toISOString() 
      : new Date().toISOString();
    
    // Gunakan userIdFromUpsert jika ada, fallback ke Redis/database jika tidak
    let userId = userIdFromUpsert || null;
    if (!userId) {
      try {
        const { client: redis } = await import('../utils/redis.js');
        let redisData = await redis.get(`connection:${this.connection.id}`);
        if (redisData) {
          const con = JSON.parse(redisData);
          userId = con.user_id;
          this.logger.debug('Successfully retrieved user_id from Redis connection object', {
            userId: userId,
            connectionId: this.connection.id
          });
        } else {
          // Jika tidak ada di Redis, coba ambil dari database
          const { data, error } = await this.connection.supabase
            .from('connections')
            .select('user_id')
            .eq('id', this.connection.id)
            .single();
          if (data) {
            userId = data.user_id;
            // Simpan ke Redis untuk penggunaan selanjutnya
            const fullData = await this.connection.supabase
              .from('connections')
              .select('*')
              .eq('id', this.connection.id)
              .single();
            if (fullData && fullData.data) {
              await redis.set(`connection:${this.connection.id}`, JSON.stringify(fullData.data));
            }
            this.logger.debug('Successfully retrieved user_id from database and cached in Redis', {
              userId: userId,
              connectionId: this.connection.id
            });
          } else {
            this.logger.warn('No user_id found for connection', {
              connectionId: this.connection.id
            });
          }
        }
      } catch (error) {
        this.logger.error('Error getting user_id:', error);
      }
    }
    
    // Base message data structure without agent settings
    const baseData = {
      type: "message",
      messageType: messageType,
      contentType: contentType,
      mediaType: mediaType,
      userId: userId,
      connectionId: this.connection.id,
      agentId: this.connection.aiAgentId || null,
      devicesPhone: this.connection.phoneNumber || this.connection.id,
      message: {
        id: message.key.id || 'unknown',
        jid: message.key.remoteJid || 'unknown',
        fromPhone: (message.key.participant || message.key.remoteJid).split('@')[0],
        pushName: message.pushName || 'Unknown',
        timestamp: timestamp,
        content: content,
        fromMe: message.key.fromMe === true,
        isForwarded: message.message?.extendedTextMessage?.contextInfo?.isForwarded || false
      }

      //  ,metadata: {
      //    connectionId: this.connection.id,
      //    phoneNumber: this.connection.phoneNumber,
      //    userId: userId,
      //    timestamp: new Date().toISOString()
      //  }
    };

    
    return baseData;
  }

  /**
   * Kirim data ke agent dan/atau webhook
   * @param {Object} message - Objek pesan asli
   * @param {Object} data - Data untuk dikirim
   * @param {boolean} shouldSendWebhook - Flag untuk menentukan apakah perlu mengirim webhook
   */
  async sendToDestinations(message, data, shouldSendWebhook, shouldSendToAgent) {
    // Kirim ke agent hanya jika tipe pesan private dan agentUrl ada
    const messageType = data.messageType;
    if (messageType === 'private' && this.connection.agentUrl) {
      try {
        const agentData = {
          ...data,
          settings: this.connection.agentSettings || null
        };
        await this.sendToAgent(agentData);
      } catch (error) {
        this.logger.error('Error sending to agent', {
          error: error.message,
          id: message.key.id
        });
      }
    }
    // Kirim ke webhook jika perlu (without agent settings)
    if (shouldSendWebhook && this.connection.webhookConfig?.url) {
      try {
        await this.sendToWebhook(data);
      } catch (error) {
        this.logger.error('Error sending to webhook', {
          error: error.message,
          id: message.key.id
        });
      }
    }
  }

  /**
   * Kirim media ke agent dan/atau webhook
   * @param {Object} message - Objek pesan asli
   * @param {Object} data - Metadata untuk dikirim
   * @param {boolean} shouldSendWebhook - Flag untuk menentukan apakah perlu mengirim webhook
   * @param {boolean} shouldSendToAgent - Flag untuk menentukan apakah perlu mengirim ke agent
   * @param {Buffer} media - Buffer media
   * @param {string} mimeType - MIME type
   * @param {string} filename - Nama file
   */
  async sendMediaToDestinations(message, data, shouldSendWebhook, shouldSendToAgent, media, mimeType, filename) {
    // Kirim ke agent jika diaktifkan dan agentUrl ada
    if (shouldSendToAgent && this.connection.agentUrl) {
      try {
        const agentData = {
          ...data,
          settings: this.connection.agentSettings || null
        };
        
        this.logger.info('Forwarding media message to agent', {
          messageId: message.key.id,
          mediaType: data.mediaType,
          messageType: data.messageType
        });
        
        await this.sendMediaToAgent(message, agentData, media, mimeType, filename);
      } catch (error) {
        this.logger.error('Error sending media to agent', {
          error: error.message,
          id: message.key.id
        });
      }
    } else if (this.connection.agentUrl) {
      this.logger.debug('Media message not sent to agent (shouldSendToAgent flag is false)', {
        messageId: message.key.id
      });
    } else {
      this.logger.debug('Media message not sent to agent (no agent URL configured)', {
        messageId: message.key.id
      });
    }
    
    // Kirim ke webhook jika perlu
    if (shouldSendWebhook && this.connection.webhookConfig?.url) {
      try {
        await this.sendMediaToWebhook(message, data, media, mimeType, filename);
      } catch (error) {
        this.logger.error('Error sending media to webhook', {
          error: error.message,
          id: message.key.id
        });
      }
    }
  }

  /**
   * Kirim data ke agent
   * @param {Object} data - Data untuk dikirim
   */
  async sendToAgent(data) {
    try {
      if (!this.connection.agentUrl) {
        this.logger.warn('Agent URL not configured, skipping agent send');
        return null;
      }

      const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Source': 'whatsapp-api',
        'X-Connection-Id': this.connection.id,
        'messagetype': data.mediaType || data.contentType || 'text'
      };

      // Fire and forget
      axios.post(this.connection.agentUrl, data, { headers })
        .catch(error => {
          this.logger.error('Failed to send message to agent (fire-and-forget)', {
            error: error.message,
            messageId: data.message.id
          });
        });
      return null;
    } catch (error) {
      this.logger.error('Failed to send message to agent', {
        error: error.message,
        messageId: data.message.id
      });
      return null;
    }
  }

  /**
   * Kirim data ke webhook
   * @param {Object} data - Data untuk dikirim
   */
  async sendToWebhook(data) {
    try {
      if (!this.connection.webhookConfig?.url) {
        this.logger.warn('Webhook URL not configured, skipping webhook send');
        return null;
      }

      const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Source': 'whatsapp-api',
        'X-Connection-Id': this.connection.id,
        'messagetype': data.mediaType || data.contentType || 'text'
      };

      // Fire and forget
      axios.post(this.connection.webhookConfig.url, data, { headers })
        .catch(error => {
          this.logger.error('Failed to send message to webhook (fire-and-forget)', {
            error: error.message,
            messageId: data.message.id
          });
        });
      return null;
    } catch (error) {
      this.logger.error('Failed to send message to webhook', {
        error: error.message,
        messageId: data.message.id
      });
      return null;
    }
  }

  /**
   * Kirim media ke agent
   * @param {Object} message - Objek pesan asli
   * @param {Object} data - Metadata untuk dikirim
   * @param {Buffer} media - Buffer media
   * @param {string} mimeType - MIME type
   * @param {string} filename - Nama file
   */
  async sendMediaToAgent(message, data, media, mimeType, filename) {
    try {
      if (!this.connection.agentUrl) {
        this.logger.warn('Agent URL not configured, skipping media send to agent');
        return null;
      }

      // Log connection properties for debugging
      this.logger.debug('Connection properties', {
        id: this.connection.id,
        name: this.connection.name,
        phoneNumber: this.connection.phoneNumber,
        apiKey: this.connection.apiKey ? '[REDACTED]' : 'undefined',
        agentUrl: this.connection.agentUrl
      });

      this.logger.info('Sending media to agent', {
        url: this.connection.agentUrl,
        id: message.key.id,
        size: `${(media.length/1024).toFixed(2)} KB`,
        mimeType: mimeType,
        filename: filename,
        isBuffer: Buffer.isBuffer(media),
        bufferLength: media.length
      });

      // Format metadata yang akan dikirim ke n8n
      const metadata = {
        message: {
          id: message.key.id,
          from: message.key.remoteJid,
          timestamp: message.messageTimestamp,
          pushName: message.pushName || 'Unknown',
          text: data.message.content || '',
          mediaType: data.mediaType
        },
        connection: {
          id: this.connection.id,
          name: this.connection.name || 'Unknown',
          phoneNumber: this.connection.phoneNumber || '',
          apiKey: this.connection.apiKey || ''
        },
        settings: this.connection.agentSettings || {}
      };

      // Log metadata untuk debugging (redact sensitive info)
      const debugMetadata = JSON.parse(JSON.stringify(metadata));
      if (debugMetadata.connection && debugMetadata.connection.apiKey) {
        debugMetadata.connection.apiKey = '[REDACTED]';
      }
      this.logger.debug('Agent metadata', { metadata: debugMetadata });

      // Buat multipart form-data
      const form = new FormData();
      
      // Tambahkan metadata sebagai JSON string
      form.append('metadata', JSON.stringify(metadata));
      
      // Tambahkan file media dengan filename dan mimetype yang benar
      form.append('file', media, {
        filename: filename,
        contentType: mimeType
      });

      // Log form data untuk debugging
      this.logger.debug('Form data prepared', {
        hasMetadata: !!form.getBuffer().toString().includes('metadata'),
        hasFile: !!form.getBuffer().toString().includes('Content-Disposition: form-data; name="file"'),
        formLength: form.getLengthSync(),
        boundary: form.getBoundary()
      });

      // Set headers yang sesuai
      const headers = {
        ...form.getHeaders(),
        'X-Webhook-Source': 'whatsapp-api',
        'X-Connection-Id': this.connection.id,
        'X-Media-Type': data.mediaType
      };
      
      this.logger.debug('Request headers', {
        headers: {
          ...headers,
          'Content-Type': headers['content-type'] // Pastikan content-type yang benar
        }
      });
      
      // Kirim dengan timeout yang cukup untuk file besar
      this.logger.debug(`Sending POST request to ${this.connection.agentUrl} with binary file`);
      
      axios.post(this.connection.agentUrl, form, {
        headers,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 60000 // 60 second timeout
      }).then(response => {
        this.logger.info('Successfully sent media to agent', {
          messageId: message.key.id,
          status: response.status,
          statusText: response.statusText,
          responseData: typeof response.data === 'object' ? JSON.stringify(response.data) : response.data?.toString().substring(0, 100)
        });
      }).catch(error => {
        this.logger.error('Failed to send media to agent (fire-and-forget)', {
          error: error.message,
          messageId: message.key.id,
          stack: error.stack,
          responseStatus: error.response?.status,
          responseData: error.response?.data ? 
            (typeof error.response.data === 'object' ? 
              JSON.stringify(error.response.data) : 
              error.response.data.toString().substring(0, 100)
            ) : 'No response data'
        });
      });
      
      return null;
    } catch (error) {
      this.logger.error('Error preparing media for agent', {
        error: error.message,
        messageId: message.key.id,
        stack: error.stack
      });
      return null;
    }
  }

  /**
   * Kirim media ke webhook
   * @param {Object} message - Objek pesan asli
   * @param {Object} data - Metadata untuk dikirim
   * @param {Buffer} media - Buffer media
   * @param {string} mimeType - MIME type
   * @param {string} filename - Nama file
   */
  async sendMediaToWebhook(message, data, media, mimeType, filename) {
    this.logger.info('Sending media to webhook', {
      url: this.connection.webhookConfig.url,
      id: message.key.id,
      size: `${(media.length/1024).toFixed(2)} KB`
    });
    const form = new FormData();
    form.append('data', JSON.stringify(data));
    form.append('file', media, {
      filename: filename,
      contentType: mimeType
    });
    const headers = {
      ...form.getHeaders(),
      'X-Webhook-Source': 'whatsapp-api',
      'X-Connection-Id': this.connection.id,
      'messagetype': data.mediaType || 'media'
    };
    // Fire and forget
    axios.post(this.connection.webhookConfig.url, form, {
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    }).catch(error => {
      this.logger.error('Failed to send media to webhook (fire-and-forget)', {
        error: error.message,
        messageId: message.key.id
      });
    });
    return null;
  }

  /**
   * Mendapatkan MIME type default
   * @param {string} mediaType - Jenis media
   * @returns {string} - MIME type default
   */
  getDefaultMimeType(mediaType) {
    const mimeTypes = {
      image: 'image/jpeg',
      video: 'video/mp4',
      document: 'application/pdf',
      audio: 'audio/mp4',
      sticker: 'image/webp'
    };
    return mimeTypes[mediaType] || 'application/octet-stream';
  }

  /**
   * Mendapatkan ekstensi file
   * @param {string} mimeType - MIME type
   * @returns {string} - Ekstensi file
   */
  getFileExtension(mimeType) {
    const extensions = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'video/mp4': 'mp4',
      'application/pdf': 'pdf',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'image/webp': 'webp'
    };
    return extensions[mimeType] || 'bin';
  }
}

// Export the MessageProcessor class
export default MessageProcessor; 