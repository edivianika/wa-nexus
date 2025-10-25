import { makeWASocket, downloadMediaMessage, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import pretty from 'pino-pretty';
import axios from 'axios';
import MessageProcessor from '../messages/MessageProcessor.js';
import { loggerUtils, errorHandler, whatsappConnection, messageEvent } from '../utils/logger.js';
import { ConfigManager } from './ConfigManager.js';
import { setWithTTL, exists, set, get } from '../utils/redis.js';
import { chownSync } from 'fs';
import { refreshConnection } from '../api/services/connectionService.js';
import ConnectionManager from './ConnectionManager.js';
import { getConnectionManager } from './ConnectionManager.js';
import { stringify } from 'querystring';
import { checkAndRunMessageTriggers } from '../messages/messageTriggers.js';
import { AgentFactory } from '../agents/AgentFactory.js';
import FormData from 'form-data';
import { useRedisAuthState } from './redisAuthState.js';
import leadScoreService from '../api/services/leadScoreService.js';

/**
 * Class untuk mengelola koneksi WhatsApp untuk satu akun
 */
class WhatsAppConnection {
  /**
   * Konstruktor
   * @param {string} id - ID koneksi
   * @param {string} name - Nama koneksi
   * @param {string} phoneNumber - Nomor telepon
   * @param {string} apiKey - API Key untuk koneksi
   * @param {Object} socketIo - Instans Socket.IO
   * @param {Object} supabase - Instans Supabase
   */
  constructor(id, name, phoneNumber, apiKey, socketIo, supabase, ownerId) {
    this.id = id;
    this.name = name;
    this.phoneNumber = this.cleanPhoneNumber(phoneNumber);
    this.apiKey = apiKey;
    this.ownerId = ownerId;
    this.socket = null;
    this.connected = false;
    this.qrCode = null;
    this.reconnectAttempts = 0;
    
    this.agent = null;
    
    this.io = socketIo;
    this.supabase = supabase;
    this.messageProcessor = null;
    this.configManager = new ConfigManager(supabase);
    this.webhookConfig = {
      url: '',
      triggers: { group: false, private: false, broadcast: false, newsletter: false }
    };

    // Heartbeat monitoring
    this.heartbeatInterval = null;
    this.lastHeartbeat = null;
    this.heartbeatTimeout = 60000; // 1 minute

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
      module: 'WhatsAppConnection',
      connectionId: this.id 
    });
    
    // Inisialisasi loggerUtils
    this.loggerUtils = loggerUtils;

    // Setup config update listener
    this.setupConfigUpdateListener();

    whatsappConnection(this.id, 'initialized', {
      name: this.name,
      phoneNumber: this.phoneNumber,
    });
  }

  /**
   * Membersihkan format nomor telepon
   * @param {string} phoneNumber - Nomor telepon yang akan dibersihkan
   * @returns {string} - Nomor telepon yang sudah dibersihkan
   */
  cleanPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;
    // Hapus bagian setelah : dan @
    return phoneNumber.split(':')[0].split('@')[0];
  }

  /**
   * Menghubungkan ke WhatsApp
   * @returns {Object} - Objek socket WhatsApp
   */
  async connect() {
    try {
      whatsappConnection(this.id, 'connecting', { 
        phoneNumber: this.phoneNumber,
        attempt: this.reconnectAttempts + 1
      });

      // Menggunakan Redis untuk state otentikasi dengan error handling
      let state, saveCreds, clearState;
      try {
        const authState = await useRedisAuthState(this.id);
        state = authState.state;
        saveCreds = authState.saveCreds;
        clearState = authState.clearState;
        this.clearAuthState = clearState; // Simpan fungsi clearState untuk logout
      } catch (authError) {
        loggerUtils.error('Error loading auth state:', authError);
        throw new Error(`Failed to load authentication state: ${authError.message}`);
      }
      
      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        // Baileys v7 specific configurations
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: true,
        defaultQueryTimeoutMs: 60000,
        generateHighQualityLinkPreview: true,
        retryRequestDelayMs: 3000,
        // Enhanced message handling for Baileys v7
        getMessage: async (key) => {
          try {
            // Try to get message from cache or database
            const cachedMessage = await this.getMessageFromCache(key);
            if (cachedMessage) {
              return cachedMessage;
            }
            return {
              conversation: 'Hello'
            };
          } catch (error) {
            loggerUtils.error('Error getting message:', error);
            return {
              conversation: 'Hello'
            };
          }
        },
        // Baileys v7 LID support
        shouldSyncHistoryMessage: () => true,
        shouldIgnoreJid: (jid) => {
          // Ignore group messages if needed
          return jid.includes('@g.us');
        }
      });
      
      // Inisialisasi message processor setelah socket dibuat
      this.messageProcessor = new MessageProcessor(this);
      
      // Load agent config
      await this.loadAgentConfig();
      
      // Setup event listeners
      this.setupEventListeners(saveCreds);

      // Simpan koneksi ke Redis
      if (this.configManager.redis) {
  
        try {
          const connectionConfig = {
            id: this.id,
            name: this.name,
            phoneNumber: this.phoneNumber,
            ai_agent_id: this.aiAgentId,
            agent_url: this.agentUrl,
            webhook_config: this.webhookConfig,
            connected: false, // akan diupdate saat connection.update
            status: 'connecting'
          };

          // simpan ke redis
          await set(
            `connection:${this.id}`,
            JSON.stringify(connectionConfig)
          );
          
         // logger.info(`Connection config saved to Redis for ${this.id}`);
        } catch (redisError) {
          logger.error('Error saving connection to Redis:', redisError);
        }
      }
      
      // Emit status koneksi
      this.emitStatus('connecting', 'Menghubungkan ke WhatsApp', {
        phoneNumber: this.phoneNumber,
        attempt: this.reconnectAttempts + 1
      });
      
      return this.socket;
    } catch (error) {
      errorHandler(error, { 
        module: 'WhatsAppConnection.connect',
        connectionId: this.id,
        phoneNumber: this.phoneNumber
      });
      
      // Emit error status
      this.emitStatus('error', 'Gagal menghubungkan ke WhatsApp', {
        error: error.message,
        phoneNumber: this.phoneNumber
      });
      
      throw error;
    }
  }
  
  /**
   * Memuat state otentikasi
   * @returns {Object} - State otentikasi
   */
  async loadAuthState() {
    // Menggunakan Redis auth state
    return useRedisAuthState(this.id);
  }

  /**
   * Memastikan direktori session ada
   */
  async ensureSessionDirectory() {
    // Method ini sudah tidak diperlukan karena menggunakan Redis
    // Tetap dipertahankan untuk backward compatibility
    return true;
  }

  /**
   * Get message from cache for Baileys v7
   */
  async getMessageFromCache(key) {
    try {
      const cacheKey = `message:${this.id}:${key.id}`;
      const cached = await get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      loggerUtils.error('Error getting message from cache:', error);
      return null;
    }
  }
  
  /**
   * Setup event listeners
   * @param {Function} saveCreds - Fungsi untuk menyimpan kredensial
   */
  setupEventListeners(saveCreds) {
    try {
      this.logger.debug('[SOCKET_DEBUG] Setting up event listeners for connection: ' + this.id);
      
      // Debug: Log socket connection status
      this.logger.debug('[SOCKET_DEBUG] Socket connection status: ' + JSON.stringify({
        isConnected: this.socket?.user ? true : false,
        hasSocket: !!this.socket,
        hasEventEmitter: !!this.socket?.ev,
        connectionId: this.id
      }));
      
      // Setup untuk connection.update event
      this.socket.ev.on('connection.update', this.handleConnectionUpdate.bind(this));
      
      // Setup untuk creds.update event
      this.socket.ev.on('creds.update', saveCreds);
      
      // Setup untuk messages.upsert event
      this.socket.ev.on('messages.upsert', this.handleMessagesUpsert.bind(this));
      
      // Debug: Log messages.upsert event
      this.socket.ev.on('messages.upsert', (messages) => {
        this.logger.debug('[SOCKET_DEBUG] messages.upsert event triggered: ' + JSON.stringify({
          type: messages.type,
          messageCount: messages.messages?.length || 0,
          hasMedia: !!(messages.messages?.[0]?.message?.imageMessage || messages.messages?.[0]?.message?.videoMessage || messages.messages?.[0]?.message?.audioMessage || messages.messages?.[0]?.message?.documentMessage),
          timestamp: new Date().toISOString()
        }));
      });
      
      this.logger.debug('[SOCKET_DEBUG] Event listeners setup completed for connection: ' + this.id);
      
      // Debug: Log event registration status
      this.logger.debug('[SOCKET_DEBUG] Event handlers registered successfully for connection: ' + this.id);
    } catch (error) {
      this.logger.error('[SOCKET_DEBUG] Error setting up event listeners: ' + error.message);
    }
    
    try {
      // Setup untuk message.reaction event
      this.socket.ev.on('messages.reaction', async (reactions) => {
        // TODO: Implement reaction handler
      });
      
      // Setup untuk presence.update event
      this.socket.ev.on('presence.update', async (update) => {
        // TODO: Implement presence handler
      });
    } catch (error) {
      console.error('[SOCKET_DEBUG] Error setting up additional event handlers:', error);
    }
    
    // Setup untuk message-status.update event untuk memperbarui lead score
    this.socket.ev.on('message-status.update', async (statuses) => {
      try {
        for (const status of statuses) {
          if (status.status === 'READ' && !status.key.fromMe) {
            // Pesan telah dibaca oleh kontak
            const remoteJid = status.key.remoteJid;
            
            // Pengecualian: Jangan proses pesan dari broadcast, status, newsletter, atau grup
            if (remoteJid.endsWith('@broadcast') || remoteJid.endsWith('@newsletter') || remoteJid.endsWith('@g.us')) {
              continue;
            }
            
            // Ambil nomor telepon dari remoteJid
            const phoneNumber = remoteJid.split('@')[0];
            
            // Cari kontak berdasarkan nomor telepon
            const { data: contact, error } = await this.supabase
              .from('contacts')
              .select('id, owner_id')
              .eq('phone_number', phoneNumber)
              .eq('owner_id', this.ownerId)
              .single();
            
            if (!error && contact) {
              // Update lead score untuk pesan yang dibaca
              await leadScoreService.updateScoreOnMessageRead(contact.id, contact.owner_id);
              this.logger.info('Lead score updated for message read', {
                contactId: contact.id,
                phoneNumber
              });
            }
          }
        }
      } catch (error) {
        this.logger.error('Error updating lead score on message read', {
          error: error.message
        });
      }
    });

    // Setup untuk LID mapping updates (Baileys v7 feature)
    this.socket.ev.on('lid-mapping.update', async (mapping) => {
      try {
        this.logger.info('LID mapping update received', {
          connectionId: this.id,
          mapping: mapping
        });
        
        // Store LID mapping in Redis for future use
        if (mapping && this.configManager.redis) {
          await this.configManager.redis.set(
            `lid-mapping:${this.id}`,
            JSON.stringify(mapping),
            'EX',
            86400 // 24 hours
          );
        }
      } catch (error) {
        this.logger.error('Error handling LID mapping update', {
          error: error.message
        });
      }
    });
  }
  
  /**
   * Handler untuk event connection.update
   * @param {Object} update - Data update
   */
  async handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      try {
        const qrcode = await import('qrcode');
        const qrCodeDataUrl = await qrcode.toDataURL(qr);
        this.qrCode = qrCodeDataUrl;
        
        whatsappConnection(this.id, 'qr_ready', {
          qr: qrCodeDataUrl,
          phoneNumber: this.phoneNumber
        });
        
        // Update QR code di database
        try {
          await this.supabase
            .from('connections')
            .update({ qr_code: qrCodeDataUrl })
            .eq('id', this.id);
            
          // Update status di Redis
          await this.updateRedisStatus('qr_ready');
        } catch (error) {
          errorHandler(error, {
            module: 'WhatsAppConnection.handleConnectionUpdate',
            operation: 'update_qr_code',
            connectionId: this.id
          });
        }
      } catch (error) {
        errorHandler(error, {
          module: 'WhatsAppConnection.handleConnectionUpdate',
          operation: 'generate_qr',
          connectionId: this.id
        });
      }
    }
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut; // Use DisconnectReason enum
      
      this.connected = false;
      
      if (shouldReconnect) {
        this.reconnectAttempts++;
        
        // Batasi jumlah reconnect attempts
        const maxReconnectAttempts = 10;
        const reconnectDelay = Math.min(5000 * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
        
        whatsappConnection(this.id, 'reconnecting', {
          attempt: this.reconnectAttempts,
          maxAttempts: maxReconnectAttempts,
          error: lastDisconnect?.error?.message,
          statusCode,
          phoneNumber: this.phoneNumber,
          nextRetryIn: reconnectDelay
        });
        
        // Update status di database
        await this.updateConnectionStatus(false);
        
        // Update status di Redis
        await this.updateRedisStatus('disconnected', {
          reconnecting: true,
          reconnect_attempt: this.reconnectAttempts,
          max_attempts: maxReconnectAttempts
        });

        // Reconnect dengan delay yang meningkat secara eksponensial
        if (this.reconnectAttempts <= maxReconnectAttempts) {
          setTimeout(() => {
            this.logger.info(`Attempting reconnect ${this.reconnectAttempts}/${maxReconnectAttempts} in ${reconnectDelay}ms`);
            this.connect().catch(error => {
              this.logger.error('Reconnect failed:', error);
            });
          }, reconnectDelay);
        } else {
          this.logger.error('Max reconnect attempts reached. Stopping reconnection.');
          whatsappConnection(this.id, 'reconnect_failed', {
            maxAttempts: maxReconnectAttempts,
            phoneNumber: this.phoneNumber
          });
        }
      } else {
        whatsappConnection(this.id, 'disconnected', {
          permanent: true,
          phoneNumber: this.phoneNumber
        }); 

        // Hapus state dari Redis karena logout permanen
        if (this.clearAuthState) {
          this.logger.info('Permanent disconnect (logout). Clearing auth state from Redis.');
          await this.clearAuthState();
        }

        // Update status di database
        await this.updateConnectionStatus(false);
        
        // Update status di Redis
        await this.updateRedisStatus('logged_out');
      }
    } else if (connection === 'open') {
      this.connected = true;
      this.reconnectAttempts = 0;
      
      // Dapatkan nomor telepon dari socket dan bersihkan formatnya
      const rawPhoneNumber = this.socket.user?.id?.split('@')[0];
      if (rawPhoneNumber) {
        const cleanPhoneNumber = this.cleanPhoneNumber(rawPhoneNumber);
        this.phoneNumber = cleanPhoneNumber;
        whatsappConnection(this.id, 'phone_number_updated', {
          oldPhoneNumber: this.phoneNumber,
          newPhoneNumber: cleanPhoneNumber
        });
      }
      
      whatsappConnection(this.id, 'connected', {
        phoneNumber: this.phoneNumber
      });
      
      // edited by edi 
      // Hapus pengecekan dan penulisan connection:${this.id}:user_id
      // Data user_id sudah ada di dalam objek connection di Redis
      const redisData = await get(`connection:${this.id}`);
      if (!redisData) {
        // Get user_id dari database dan simpan seluruh objek connection ke Redis
        const { data: connectionData, error: connectionError } = await this.supabase
          .from('connections')
          .select('*')
          .eq('id', this.id)
          .single();
        if (!connectionError && connectionData) {
          await this.configManager.redis.set(`connection:${this.id}`, JSON.stringify(connectionData));
        }
      }
      
      // Update status dan nomor telepon di database
      await this.updateConnectionStatus(true);
      
      // Update status di Redis
      await this.updateRedisStatus('connected');
      
      // Emit status koneksi ke socket
      this.emitStatus('connected', 'WhatsApp terhubung', {
        phoneNumber: this.phoneNumber,
        connectionId: this.id
      });

      // Start heartbeat monitoring
      this.startHeartbeat();
    }
  }
  
  /**
   * Update status koneksi di database
   * @param {boolean} isConnected - Status koneksi
   * Updat connection status and phone number
   */
  async updateConnectionStatus(isConnected) {
    this.logger.debug({ event: 'update_connection_status' }, `Updating connection status to ${isConnected}`);
    const timestamp = new Date().toISOString();
   
    try {
      const updateData = {
        connected: isConnected,
        ...(this.phoneNumber && { phone_number: this.phoneNumber })
      };
      
      await this.supabase
        .from('connections')
        .update(updateData)
        .eq('id', this.id); 
    } catch (error) {
      errorHandler(error, {
        module: 'WhatsAppConnection.updateConnectionStatus',
        connectionId: this.id
      });
    }
  }
  
  /**
   * Handler untuk event messages.upsert
   * @param {Object} messages - Data pesan
   */
  async handleMessagesUpsert(messages) { 


    try {
      const m = messages.messages[0];
      
      this.logger.debug('[MESSAGE] ===== handleMessagesUpsert called =====');
      this.logger.debug('[MESSAGE] Message details: ' + JSON.stringify({
        fromMe: m.key.fromMe,
        type: messages.type,
        remoteJid: m.key.remoteJid,
        connectionId: this.id,
        hasImageMessage: !!m.message?.imageMessage,
        hasVideoMessage: !!m.message?.videoMessage,
        hasAudioMessage: !!m.message?.audioMessage,
        hasDocumentMessage: !!m.message?.documentMessage
      }));

      if (m.key.fromMe || messages.type !== 'notify') {
        this.logger.info('[MESSAGE] Skipping message: fromMe or not notify');
        return;
      }

      const remoteJid = m.key.remoteJid;

      // Pengecualian: Jangan proses pesan dari broadcast, status, newsletter, atau grup
      if (remoteJid.endsWith('@broadcast') || remoteJid.endsWith('@newsletter') || remoteJid.endsWith('@g.us')) {
        this.logger.info('[MESSAGE] Skipping message: broadcast/newsletter/group');
        return;
      }

      messageEvent(this.id, 'message_received', {
        from: m.key.remoteJid,
        type: messages.type,
        message: m.message
      });
      
      // AUTO-SAVE CONTACT (NEW)
      await this.autoSaveContact(m);
      
      // Proses pesan melalui webhook dan AI agent
      await this.processIncomingMessage(m);
      
      // Update lead score untuk kontak yang membalas pesan
      try {
        // Ambil nomor telepon dari remoteJid
        const phoneNumber = remoteJid.split('@')[0];
        
        // Cari kontak berdasarkan nomor telepon
        const { data: contact, error } = await this.supabase
          .from('contacts')
          .select('id, owner_id')
          .eq('phone_number', phoneNumber)
          .eq('owner_id', this.ownerId)
          .single();
        
        if (!error && contact) {
          // Update lead score untuk pesan masuk
          await leadScoreService.updateScoreOnReply(contact.id, contact.owner_id);
          this.logger.info('Lead score updated for incoming message', {
            contactId: contact.id,
            phoneNumber
          });
        }
      } catch (scoreError) {
        this.logger.error('Error updating lead score', {
          error: scoreError.message,
          remoteJid
        });
      }
    } catch (error) {
      errorHandler(error, {
        module: 'WhatsAppConnection.handleMessagesUpsert',
        connectionId: this.id
      });
    }
  }

  /**
   * Auto-save contact from incoming message
   * @param {Object} message - Message object from Baileys
   */
  async autoSaveContact(message) {
    try {
      // Extract phone number from the correct field based on WhatsApp format
      let phoneNumber;
      const remoteJid = message.key.remoteJid;
      const remoteJidAlt = message.key.remoteJidAlt;
      
      // Prioritize remoteJidAlt if it contains @s.whatsapp.net (newer WhatsApp format)
      if (remoteJidAlt && typeof remoteJidAlt === 'string' && remoteJidAlt.includes('@s.whatsapp.net')) {
        phoneNumber = remoteJidAlt.split('@')[0];
        this.logger.info('Using remoteJidAlt for phone number', { 
          remoteJidAlt, 
          extractedPhone: phoneNumber 
        });
      }
      // Check if remoteJid is in the correct format (@s.whatsapp.net)
      else if (remoteJid && typeof remoteJid === 'string' && remoteJid.includes('@s.whatsapp.net')) {
        phoneNumber = remoteJid.split('@')[0];
        this.logger.info('Using remoteJid for phone number', { 
          remoteJid, 
          extractedPhone: phoneNumber 
        });
      }
      // Fallback to remoteJid if no @s.whatsapp.net format found
      else {
        phoneNumber = remoteJid ? remoteJid.split('@')[0] : 'unknown';
        this.logger.warn('Fallback to remoteJid for phone number', { 
          remoteJid, 
          remoteJidAlt, 
          extractedPhone: phoneNumber 
        });
      }
      
      const senderName = message.pushName || message.businessName || 'Unknown';
      
      // Log the phone number extraction for debugging
      this.logger.info('Phone number extraction', {
        remoteJid,
        remoteJidAlt,
        extractedPhoneNumber: phoneNumber,
        senderName,
        extractionMethod: remoteJidAlt && remoteJidAlt.includes('@s.whatsapp.net') ? 'remoteJidAlt' : 
                         remoteJid && remoteJid.includes('@s.whatsapp.net') ? 'remoteJid' : 'fallback'
      });
      
      if (!this.ownerId) {
        this.logger.warn('Cannot auto-save contact: ownerId is missing');
        return;
      }
      
      const redis = this.configManager?.redis;
      if (!redis) {
        this.logger.warn('Cannot auto-save contact: Redis is not available');
        return;
      }
      
      const redisSetKey = `contacts:${this.ownerId}`;
      
      // Check if contact already in Redis
      const added = await redis.sadd(redisSetKey, phoneNumber);
      
      if (added === 1) {
        // New contact, insert into database
        const { data, error } = await this.supabase
          .from('contacts')
          .insert({
            phone_number: phoneNumber,
            contact_name: senderName,
            owner_id: this.ownerId,
            agent_id: this.aiAgentId || null,
            connection_id: this.id,
            labels: []
          })
          .select();
        
        if (error && error.code === '23505') {
          // Duplicate key, update existing contact
          const { error: updateError } = await this.supabase
            .from('contacts')
            .update({
              contact_name: senderName,
              agent_id: this.aiAgentId || null,
              connection_id: this.id
            })
            .eq('phone_number', phoneNumber)
            .eq('owner_id', this.ownerId);
          
          if (updateError) {
            this.logger.error('Failed to update existing contact', {
              phoneNumber,
              error: updateError.message
            });
          } else {
            this.logger.info('Contact updated', { phoneNumber, contactName: senderName });
          }
        } else if (error) {
          this.logger.error('Failed to insert new contact', {
            phoneNumber,
            error: error.message
          });
        } else {
          this.logger.info('New contact saved', { phoneNumber, contactName: senderName });
        }
      } else {
        // Contact already exists, optionally update name if changed
        const { data: existingContact } = await this.supabase
          .from('contacts')
          .select('contact_name')
          .eq('phone_number', phoneNumber)
          .eq('owner_id', this.ownerId)
          .single();
        
        if (existingContact && existingContact.contact_name !== senderName && senderName !== 'Unknown') {
          await this.supabase
            .from('contacts')
            .update({ contact_name: senderName })
            .eq('phone_number', phoneNumber)
            .eq('owner_id', this.ownerId);
          
          this.logger.info('Contact name updated', { phoneNumber, newName: senderName });
        }
      }
    } catch (error) {
      this.logger.error('Error in autoSaveContact', {
        error: error.message,
        remoteJid: message.key.remoteJid
      });
    }
  }
  
  /**
   * Memproses pesan masuk, mengirim ke webhook dan AI agent jika dikonfigurasi
   * @param {Object} message - Objek pesan dari Baileys
   */
  async processIncomingMessage(message) {
    // this.logger.info('[MEDIA] ===== processIncomingMessage called =====');
    // this.logger.info('[MEDIA] Message keys: ' + JSON.stringify(Object.keys(message.message || {})));
 
    let messageContent = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    let mediaType = 'text';
    let mediaBuffer = null;
    let mimeType = null;
    let filename = null;

    // Mendeteksi dan menangani media
    const MimetypeMap = {
      imageMessage: 'image',
      videoMessage: 'video',
      audioMessage: 'audio',
      documentMessage: 'document',
    };
    
    const [type, content] = Object.entries(message.message || {}).find(([key, _]) => MimetypeMap[key]) || [];
    
    // this.logger.info('[MEDIA] Media detection check: ' + JSON.stringify({
    //   hasMessage: !!message.message,
    //   messageKeys: Object.keys(message.message || {}),
    //   foundType: type,
    //   hasContent: !!content,
    //   mimetype: content?.mimetype,
    //   fileName: content?.fileName
    // }));

    if (type && MimetypeMap[type] && content) {
        // this.logger.info('[MEDIA] Media detected: ' + JSON.stringify({
        //     type,
        //     mediaType: MimetypeMap[type],
        //     mimetype: content.mimetype,
        //     fileName: content.fileName
        // }));
        
        mediaType = MimetypeMap[type];
        messageContent = content.caption || ''; // Gunakan caption sebagai teks jika ada
        mimeType = content.mimetype;
        filename = content.fileName || `${Date.now()}.${this.getFileExtension(mimeType)}`;
        
        // this.logger.info('[MEDIA] Before download: ' + JSON.stringify({ mediaType, filename, mimeType }));
        
        try {
            // Download media sebagai buffer
            mediaBuffer = await downloadMediaMessage(message, 'buffer', {});
            // this.logger.info('[MEDIA] Media download result: ' + JSON.stringify({
            //     hasBuffer: !!mediaBuffer,
            //     bufferSize: mediaBuffer ? mediaBuffer.length : 0,
            //     filename,
            //     mimeType
            // }));
            this.logger.info('Media downloaded successfully', {
                messageId: message.key.id,
                mediaType,
                bufferSize: mediaBuffer ? `${(mediaBuffer.length/1024).toFixed(2)} KB` : 'null',
                mimeType: mimeType
            });
            
            // Simpan media ke filesystem
            if (mediaBuffer && filename) {
                try {
                    const fs = await import('fs');
                    const path = await import('path');
                    
                    // Create trigger-specific directory
                    const triggerDir = path.join(process.cwd(), 'temp', 'media-cache', `trigger_${this.id}`);
                    this.logger.info('[MEDIA] Trigger directory path: ' + triggerDir);
                    
                    // Ensure directory exists
                    if (!fs.existsSync(triggerDir)) {
                        fs.mkdirSync(triggerDir, { recursive: true });
                        this.logger.info('[MEDIA] Created trigger directory: ' + triggerDir);
                    }
                    
                    // Generate unique filename with timestamp
                    const timestamp = Date.now();
                    const fileExtension = path.extname(filename) || this.getFileExtension(mimeType);
                    const baseFilename = path.basename(filename, fileExtension);
                    const uniqueFilename = `${timestamp}_${baseFilename}${fileExtension}`;
                    
                    // Save media buffer to file
                    const filePath = path.join(triggerDir, uniqueFilename);
                    this.logger.info('[MEDIA] Saving file to: ' + filePath);
                    await fs.promises.writeFile(filePath, mediaBuffer);
                    this.logger.info('[MEDIA] File saved successfully');
                    
                    // Generate public URL
                    const baseUrl = process.env.MEDIA_BASE_URL || 'http://localhost:3000';
                    const mediaUrl = `${baseUrl}/api/media/${uniqueFilename}`;
                    this.logger.info('[MEDIA] Generated public URL: ' + mediaUrl);
                    
                    // Store media details for trigger
                    this.lastMediaUrl = mediaUrl;
                    this.lastMediaDetails = {
                        url: mediaUrl,
                        filename: uniqueFilename,
                        mimetype: mimeType,
                        size: mediaBuffer.length,
                        timestamp: timestamp
                    };
                    
                    this.logger.info('Media saved for trigger', {
                        messageId: message.key.id,
                        filename: uniqueFilename,
                        size: mediaBuffer.length,
                        url: mediaUrl
                    });
                    
                } catch (error) {
                    this.logger.error('Failed to save media for trigger', {
                        messageId: message.key.id,
                        error: error.message
                    });
                }
            }
        } catch (error) {
            this.logger.error('[MEDIA] Media download error: ' + error.message);
            errorHandler(error, {
                module: 'WhatsAppConnection.processIncomingMessage',
                operation: 'media_download',
                connectionId: this.id,
                errorMessage: error.message
            });
        }
    } else {
        this.logger.debug('[MEDIA] No media detected');
    }

    // --- Start of Payload Construction ---

    // Payload untuk Agent dan Webhook (disederhanakan)
    const simplifiedAgentMessage = {
      id: message.key.id,
      from: message.key.remoteJid,
      timestamp: message.messageTimestamp,
      pushName: message.pushName,
      text: messageContent,
      mediaType: mediaType !== 'text' ? mediaType : undefined
    };

    // Payload untuk Triggers (lebih kaya, berisi object 'alldata')
    const triggerPayload = {
        connection: this,
        connectionId: this.id,
        supabase: this.supabase,
        message: messageContent,
        mediaType,
        mediaBuffer,
        mediaUrl: this.lastMediaUrl, // URL media yang sudah disimpan
        media: this.lastMediaDetails, // Detail media (url, filename, mimetype, size, timestamp)
        isfromMe: message.key.fromMe,
        alldata: message, // Trigger mendapatkan data lengkap
        simplifiedMessage: simplifiedAgentMessage, // Kirim juga pesan yang sudah disederhanakan
        user_id: this.ownerId,
    };
    
    const connectionInfo = {
      id: this.id,
      name: this.name,
      phoneNumber: this.phoneNumber,
      apiKey: this.apiKey,
    };

    // --- End of Payload Construction ---

    // 1. Kirim ke Webhook (jika ada)
    if (this.webhookConfig && this.webhookConfig.url) {
      // Buat payload standar untuk webhook
      const webhookPayload = {
        type: 'incoming_message',
        message: simplifiedAgentMessage,
        connection: connectionInfo,
        test : 'asd'
      };
      this.sendToWebhook(webhookPayload);
    }

    // 2. Jalankan Triggers
    await checkAndRunMessageTriggers(triggerPayload);

    // 3. Kirim ke AI Agent (jika ada)
    if (this.agent && this.agent.isReady()) {
      try {
        // Untuk pesan teks, gunakan agent.process biasa
        if (mediaType === 'text') {
          // Mengirim payload yang lebih terstruktur ke agent
          const agentResponse = await this.agent.process(simplifiedAgentMessage, connectionInfo);

          if (agentResponse && agentResponse.reply) {
            const recipient = message.key.remoteJid;
            await this.sendMessage(recipient, { text: agentResponse.reply });
          }
        } 
        // Untuk pesan media, kirim dengan format yang sama seperti webhook
        else if (mediaBuffer && this.messageProcessor) {
          if (!mimeType) {
            mimeType = this.messageProcessor.getDefaultMimeType(mediaType);
          }
          
          if (!filename) {
            filename = `file-${Date.now()}.${this.messageProcessor.getFileExtension(mimeType)}`;
          }
          
          this.logger.info('Sending media to agent with webhook format', {
            messageId: message.key.id,
            mediaType,
            mimeType,
            filename,
            bufferSize: `${(mediaBuffer.length/1024).toFixed(2)} KB`,
            agentUrl: this.agentUrl
          });

          // Buat payload untuk agent dengan format yang sama seperti webhook
          const agentPayload = {
            type: 'incoming_message',
            message: {
              ...simplifiedAgentMessage,
              mediaType: mediaType,
              mediaUrl: this.lastMediaUrl,
              media: this.lastMediaDetails
            },
            connection: connectionInfo,
            settings: this.agent?.settings || null
          };
          
          // Kirim ke agent menggunakan axios (format yang sama seperti webhook)
          try {
            const response = await axios.post(this.agentUrl, agentPayload, {
              headers: { 'Content-Type': 'application/json' },
              timeout: 30000, // 30 detik timeout untuk media
            });
            
            this.logger.info('Media sent to agent successfully', {
              messageId: message.key.id,
              status: response.status,
              agentUrl: this.agentUrl
            });
            
            // Jika agent mengembalikan response, kirim balik ke WhatsApp
            if (response.data && response.data.reply) {
              const recipient = message.key.remoteJid;
              await this.sendMessage(recipient, { text: response.data.reply });
            }
            
          } catch (agentError) {
            this.logger.error('Failed to send media to agent', {
              messageId: message.key.id,
              error: agentError.message,
              agentUrl: this.agentUrl
            });
          }
        }
      } catch (agentError) {
        errorHandler(agentError, {
          module: 'WhatsAppConnection.processIncomingMessage',
          operation: 'agent_processing',
          connectionId: this.id
        });
      }
    }
  }

  /**
   * Mendapatkan ekstensi file berdasarkan MIME type
   * @param {string} mimeType - MIME type
   * @returns {string} - Ekstensi file
   */
  getFileExtension(mimeType) {
    const extensions = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/mp4': 'm4a',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
    };
    
    return extensions[mimeType] || 'bin';
  }

  /**
   * Mengirim payload ke URL webhook yang terkonfigurasi.
   * @param {object} payload - Data yang akan dikirim sebagai body JSON.
   */
  async sendToWebhook(payload) {
    if (!this.webhookConfig || !this.webhookConfig.url) {
      return;
    }

    try {
      this.logger.debug({ event: 'send_to_webhook', url: this.webhookConfig.url }, 'Mengirim pesan ke webhook.');
      await axios.post(this.webhookConfig.url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000, // 15 detik timeout
      });
    } catch (error) {
      errorHandler(error, {
        module: 'WhatsAppConnection.sendToWebhook',
        operation: 'webhook_dispatch',
        connectionId: this.id,
        url: this.webhookConfig.url
      });
    }
  }
  
  /**
   * Mengirim pesan
   * @param {string} recipient - Penerima pesan
   * @param {string|Object} content - Konten pesan
   * @param {Object} options - Opsi tambahan
   */
  async sendMessage(recipient, content, options = {}) {
    if (!this.socket || !this.connected) {
      throw new Error('WhatsApp belum terhubung');
    }
    
    try {
      // Format nomor penerima dengan benar
      let formattedRecipient = recipient;
      
      // Jika tidak mengandung @, tambahkan suffix @s.whatsapp.net
      if (!formattedRecipient.includes('@')) {
        formattedRecipient = `${formattedRecipient}@s.whatsapp.net`;
      }
      
      // Get preferred JID (LID or PN) for better compatibility (Baileys v7)
      const preferredJID = await this.getPreferredJID(formattedRecipient);
      
      this.logger.debug('Sending message', {
        originalRecipient: recipient,
        formattedRecipient: formattedRecipient,
        preferredJID: preferredJID,
        isLID: this.isLIDFormat(preferredJID)
      });
      
      return await this.socket.sendMessage(preferredJID, content, options);
    } catch (error) {
      console.error(`Error mengirim pesan ke ${recipient}:`, error);
      throw error;
    }
  }
  
  /**
   * Memuat konfigurasi agen dari database
   */
  async loadAgentConfig() {
    loggerUtils.debug({ event: 'load_agent_config_start' }, 'Memulai memuat konfigurasi agent.');
    const connectionId = this.id;
    
    try {
      // 1. Ambil data koneksi untuk mendapatkan ai_agent_id
      const { data: connectionData, error: connectionError } = await this.supabase
            .from('connections')
        .select('ai_agent_id')
        .eq('id', connectionId)
        .single();
            
      if (connectionError || !connectionData) {
        this.agent = null; // Set agent ke null jika tidak ada konfigurasi
        if (connectionError && connectionError.code !== 'PGRST116') { // Abaikan error 'not found'
          this.logger.error({ error: connectionError }, 'Gagal mengambil data koneksi untuk agent.');
        } else {
          this.logger.debug('Tidak ada ai_agent_id yang terkonfigurasi untuk koneksi ini.');
        }
        return;
      }
      
      const agentId = connectionData.ai_agent_id;
      if (!agentId) {
        this.logger.debug('ai_agent_id adalah null, tidak ada agent yang dimuat.');
        this.agent = null;
        return;
      }
      
      // 2. Ambil detail agent dari tabel ai_agents menggunakan agentId
        const { data: agentData, error: agentError } = await this.supabase
          .from('ai_agents')
        .select('agent_url, settings')
        .eq('id', agentId)
        .single();
          
      if (agentError || !agentData) {
        this.agent = null; // Set agent ke null jika tidak ada data agent
        if (agentError) {
          this.logger.error({ error: agentError }, `Gagal mengambil detail agent untuk ID: ${agentId}`);
        } else {
          this.logger.warn(`Tidak ditemukan agent dengan ID: ${agentId}`);
        }
          return;
        }

      // Log agent URL untuk debugging
      this.logger.info({
        event: 'agent_url_loaded',
        agent_id: agentId,
        agent_url: agentData.agent_url
      }, `Agent URL loaded: ${agentData.agent_url}`);
        
      // 3. Gunakan AgentFactory untuk membuat instance agent
      this.agent = AgentFactory.createAgent(agentData);
      
      // 4. Update agentUrl di koneksi untuk digunakan oleh MessageProcessor
      if (agentData.agent_url) {
        this.agentUrl = agentData.agent_url;
        this.logger.debug({
          event: 'agent_url_updated',
          connection_id: this.id,
          agent_url: this.agentUrl
        }, `Connection agentUrl updated to: ${this.agentUrl}`);
        
        // Tambahan: Verifikasi URL agent
        try {
          const parsedUrl = new URL(this.agentUrl);
          this.logger.info({
            event: 'agent_url_verified',
            protocol: parsedUrl.protocol,
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            pathname: parsedUrl.pathname,
            full_url: this.agentUrl
          }, `Agent URL verified and parsed successfully: ${this.agentUrl}`);
        } catch (urlError) {
          this.logger.error({
            event: 'agent_url_invalid',
            agent_url: this.agentUrl,
            error: urlError.message
          }, `Invalid agent URL format: ${this.agentUrl}`);
        }
      }
  
      if (this.agent && this.agent.isReady()) {
        this.logger.info({ 
          event: 'agent_loaded', 
          agent_type: this.agent.constructor.name,
          agent_url: this.agentUrl
        }, 'Instance agent berhasil dibuat dan dimuat.');
        
        // Update message processor dengan agentUrl yang baru
        if (this.messageProcessor) {
          this.messageProcessor.updateConfig(this.webhookConfig, this.agentUrl);
          this.logger.debug('Message processor updated with new agent URL');
        }
      } else {
        this.logger.warn({ event: 'agent_not_loaded' }, 'Gagal membuat instance agent dari factory, atau agent tidak siap.');
        this.agent = null;
      }
  
    } catch (error) {
      this.agent = null; // Pastikan agent null jika ada error
      errorHandler(error, {
        module: 'WhatsAppConnection.loadAgentConfig',
        connectionId: this.id
      });
    } finally {
      this.logger.debug({ 
        event: 'load_agent_config_end',
        has_agent: !!this.agent,
        agent_url: this.agentUrl
      }, 'Selesai memuat konfigurasi agent.');
    }
  }
  
  /**
   * Memperbarui ai_agent_id dari database
   * @returns {Promise<string|null>} - ai_agent_id jika berhasil, null jika gagal
   */
  async updateAgentIdFromDatabase() {
    try {
      const timestamp = new Date().toISOString();
      this.logger.debug(`[${timestamp}] 🔄 Memulai updateAgentIdFromDatabase untuk koneksi ${this.id}`);
      
      // 1. Ambil data terbaru dari database
      const { data, error } = await this.supabase
        .from('connections')
        .select('ai_agent_id')
        .eq('id', this.id)
        .single();
        
      if (error) {
        logger.error(`[${timestamp}] ❌ Error mengambil data koneksi dari database:`, error);
        throw error;
      }
      
      if (!data) {
        this.logger.warn(`[${timestamp}] ⚠️ Koneksi tidak ditemukan di database: ${this.id}`);
        return null;
      }
      
      // 2. Update di memory
      this.aiAgentId = data.ai_agent_id;
      this.logger.debug(`[${timestamp}] ✅ Berhasil memperbarui ai_agent_id untuk koneksi ${this.id}: ${data.ai_agent_id}`);
      
      // 3. Update di Redis
      if (data.ai_agent_id) {
        // Ambil data agent terbaru dari database
        const { data: agentData, error: agentError } = await this.supabase
          .from('ai_agents')
          .select('*')
          .eq('id', data.ai_agent_id)
          .maybeSingle();
          
        if (agentError) {
          logger.error(`[${timestamp}] ❌ Error mengambil data agent dari database:`, agentError);
        } else if (!agentData) {
          logger.warn(`[${timestamp}] ⚠️ Agent dengan ID ${data.ai_agent_id} tidak ditemukan di database`);
        } else {
          // Update agent data di Redis
          await this.configManager.redis.set(
            `agent:${data.ai_agent_id}`,
            JSON.stringify({
              id: agentData.id,
              name: agentData.name,
              agent_url: agentData.agent_url
            }),
            'EX',
            3600 // 1 jam
          );
          this.logger.debug(`[${timestamp}] ✅ Data agent disimpan ke Redis`);
          
          // Update agent settings di Redis
          if (agentData.settings) {
            await this.configManager.redis.set(
              `agent:${data.ai_agent_id}:settings`,
              JSON.stringify(agentData),
              'EX',
              3600 // 1 jam
            );
            this.logger.debug(`[${timestamp}] ✅ Agent settings disimpan ke Redis`);
          }
          
          // Update agent URL di Redis
          if (agentData.agent_url) {
            await this.configManager.redis.set(
              `agent:${data.ai_agent_id}:url`,
              agentData.agent_url,
              'EX',
              3600 // 1 jam
            );
            this.logger.debug(`[${timestamp}] ✅ Agent URL disimpan ke Redis`);
          }
        }
      }
      
      // 4. Load agent config
      await this.loadAgentConfig();
      
      return this.aiAgentId;
    } catch (error) {
      logger.error(`[${timestamp}] ❌ Error dalam updateAgentIdFromDatabase:`, error);
      throw error;
    }
  }
  
  /**
   * Emit status ke client melalui Socket.IO
   * @param {string} status - Status koneksi
   * @param {string} message - Pesan status
   * @param {Object} data - Data tambahan
   */
  emitStatus(status, message, data = {}) {
    if (!this.io) {
      errorHandler(new Error('Socket.IO instance not available'), {
        module: 'WhatsAppConnection.emitStatus',
        connectionId: this.id
      });
      return;
    }

    const eventData = {
      status,
      message,
      connectionId: this.id,
      ...data
    };

    // Emit ke room spesifik berdasarkan connectionId
    this.io.to(this.id).emit('connection_status', eventData);
    
    // Log event socket
    whatsappConnection(this.id, `status_${status}`, eventData);
  }
  
  /**
   * Memutuskan koneksi WhatsApp
   */
  async disconnect() {
    if (this.socket) {
      // Stop heartbeat monitoring
      this.stopHeartbeat();
      
      await this.socket.logout();
      this.connected = false;
      this.emitStatus('logged_out', 'Logout dari WhatsApp');
      await this.updateConnectionStatus(false);
      
      // Hapus state dari Redis saat disconnect manual
      if (this.clearAuthState) {
        this.logger.info('Manual disconnect. Clearing auth state from Redis.');
        await this.clearAuthState();
      }
    }
  }

  /**
   * Start heartbeat monitoring untuk mendeteksi koneksi yang mati
   */
  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.lastHeartbeat = Date.now();
    
    this.heartbeatInterval = setInterval(async () => {
      try {
        if (!this.socket || !this.connected) {
          return;
        }

        // Cek apakah koneksi masih hidup
        const now = Date.now();
        const timeSinceLastHeartbeat = now - this.lastHeartbeat;
        
        if (timeSinceLastHeartbeat > this.heartbeatTimeout) {
          this.logger.warn('Heartbeat timeout detected. Attempting to reconnect...');
          
          // Stop heartbeat
          this.stopHeartbeat();
          
          // Force reconnect
          this.connected = false;
          await this.updateConnectionStatus(false);
          
          // Trigger reconnection
          this.handleConnectionUpdate({ connection: 'close', lastDisconnect: { error: { message: 'Heartbeat timeout' } } });
          return;
        }

        // Update last heartbeat time
        this.lastHeartbeat = now;
        
        // Update status di Redis
        await this.updateRedisStatus('connected', {
          last_heartbeat: new Date().toISOString(),
          uptime: Math.floor((now - this.lastHeartbeat) / 1000)
        });
        
      } catch (error) {
        this.logger.error('Heartbeat monitoring error:', error);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop heartbeat monitoring
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Get LID for phone number (Baileys v7 feature)
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<string|null>} - LID or null if not found
   */
  async getLIDForPhoneNumber(phoneNumber) {
    try {
      if (!this.socket || !this.socket.signalRepository) {
        return null;
      }

      const store = this.socket.signalRepository.lidMapping;
      if (store && store.getLIDForPN) {
        return await store.getLIDForPN(phoneNumber);
      }
      
      return null;
    } catch (error) {
      this.logger.error('Error getting LID for phone number', {
        error: error.message,
        phoneNumber
      });
      return null;
    }
  }

  /**
   * Get phone number for LID (Baileys v7 feature)
   * @param {string} lid - Local Identifier
   * @returns {Promise<string|null>} - Phone number or null if not found
   */
  async getPhoneNumberForLID(lid) {
    try {
      if (!this.socket || !this.socket.signalRepository) {
        return null;
      }

      const store = this.socket.signalRepository.lidMapping;
      if (store && store.getPNForLID) {
        return await store.getPNForLID(lid);
      }
      
      return null;
    } catch (error) {
      this.logger.error('Error getting phone number for LID', {
        error: error.message,
        lid
      });
      return null;
    }
  }

  /**
   * Check if JID is LID format (Baileys v7 feature)
   * @param {string} jid - JID to check
   * @returns {boolean} - True if LID format
   */
  isLIDFormat(jid) {
    // LID format: 120363123456789012@s.whatsapp.net
    // PN format: 6281234567890@s.whatsapp.net
    if (!jid || !jid.includes('@s.whatsapp.net')) {
      return false;
    }
    
    const id = jid.split('@')[0];
    // LID typically starts with 1 and is longer than phone numbers
    return id.startsWith('1') && id.length > 10;
  }

  /**
   * Get preferred JID (LID or PN) for messaging (Baileys v7 feature)
   * @param {string} jid - Original JID
   * @returns {Promise<string>} - Preferred JID for messaging
   */
  async getPreferredJID(jid) {
    try {
      if (!jid) return jid;
      
      // If it's already LID format, use it
      if (this.isLIDFormat(jid)) {
        return jid;
      }
      
      // Try to get LID for phone number
      const phoneNumber = jid.split('@')[0];
      const lid = await this.getLIDForPhoneNumber(phoneNumber);
      
      if (lid) {
        this.logger.debug('Using LID for messaging', {
          originalJid: jid,
          lid: lid
        });
        return lid;
      }
      
      // Fallback to original JID
      return jid;
    } catch (error) {
      this.logger.error('Error getting preferred JID', {
        error: error.message,
        jid
      });
      return jid;
    }
  }

  async setupConfigUpdateListener() {
    try {
      // Get initial config
      await this.loadConfig();

      // Listen for config updates
      this.configManager.on('configUpdate', async (connectionId, config) => {
        if (connectionId === this.id) {
          this.logger.debug('Config update received', {
            connectionId: this.id,
            configKeys: Object.keys(config || {})
          });
          await this.updateConfig(config);
        }
      });
    } catch (error) {
      errorHandler(error, {
        module: 'WhatsAppConnection.setupConfigUpdateListener',
        operation: 'setup_listener',
        connectionId: this.id
      });
    }
  }

  async loadConfig() {
    try {
      const config = await this.configManager.getConfig(this.id);
      
      if (config) {
        // Update webhook configuration
        if (config.webhookConfig) {
          this.webhookConfig = {
            url: config.webhookConfig.url || '',
            triggers: config.webhookConfig.triggers || {
              group: false,
              private: false,
              broadcast: false,
              newsletter: false
            }
          };
          this.logger.debug('Webhook config loaded', {
            connectionId: this.id,
            hasUrl: !!this.webhookConfig.url,
            triggers: this.webhookConfig.triggers
          });
        }

        // Update agent configuration
        if (config.agentConfig) {
          this.aiAgentId = config.agentConfig.aiAgentId;
          this.agentUrl = config.agentConfig.agentUrl;
          this.logger.debug('Agent config loaded', {
            connectionId: this.id,
            agentId: this.aiAgentId,
            agentUrl: this.agentUrl
          });
        }
      }

      return config;
    } catch (error) {
      logger.error('Error loading config', {
        error: error.message,
        connectionId: this.id
      });
      return null;
    }
  }

  async updateConfig(config) {
    try {
      const timestamp = new Date().toISOString();
      this.logger.debug(`[${timestamp}] 🔄 Memulai updateConfig untuk koneksi: ${this.id}`);
      this.logger.debug(`[${timestamp}] 📋 Konfigurasi yang diterima:`, JSON.stringify(config, null, 2));

      // Update webhook config
      if (config.webhook_config) {
        // Update di database
        const { data: updateData, error: updateError } = await this.supabase
          .from('connections')
          .update({
            webhook_config: config.webhook_config,
            updated_at: new Date().toISOString()
          })
          .eq('id', this.id)
          .select()
          .single();

        if (updateError) {
          logger.error(`[${timestamp}] ❌ Error update webhook config di database:`, updateError);
          throw updateError;
        }

        // Update di memory
        this.webhookConfig = {
          ...this.webhookConfig,
          ...config.webhook_config
        };

        // Update di Redis jika tersedia
        if (this.configManager.redis) {
          try {
            await this.configManager.redis.set(
              `connection:${this.id}:webhook_config`,
              JSON.stringify(this.webhookConfig),
              'EX',
              3600 // Expire after 1 hour
            );
            this.logger.debug(`[${timestamp}] ✅ Webhook config disimpan ke Redis`);
          } catch (redisError) {
            logger.error(`[${timestamp}] ❌ Error menyimpan webhook config ke Redis:`, redisError);
          }
        }

        this.logger.debug(`[${timestamp}] ✅ Webhook config diperbarui:`, JSON.stringify(this.webhookConfig, null, 2));
      }

      // Update agent config
      if (config.agent_config) {
        // Update di database
        const { data: updateData, error: updateError } = await this.supabase
          .from('connections')
          .update({
            ai_agent_id: config.agent_config.ai_agent_id,
            updated_at: new Date().toISOString()
          })
          .eq('id', this.id)
          .select()
          .single();

        if (updateError) {
          logger.error(`[${timestamp}] ❌ Error update agent config di database:`, updateError);
          throw updateError;
        }

        // Ambil URL agent dari database berdasarkan ai_agent_id
        if (config.agent_config.ai_agent_id) {
          const { data: agentData, error: agentError } = await this.supabase
            .from('ai_agents')
            .select('agent_url')
            .eq('id', config.agent_config.ai_agent_id)
            .single();
            
          if (agentError) {
            logger.error(`[${timestamp}] ❌ Error mengambil agent_url dari database:`, agentError);
          } else if (agentData && agentData.agent_url) {
            // Update agentUrl dari database, bukan dari config
            this.agentUrl = agentData.agent_url;
            logger.info(`[${timestamp}] ✅ Agent URL diambil dari database: ${this.agentUrl}`);
          } else {
            logger.warn(`[${timestamp}] ⚠️ Tidak dapat menemukan agent_url di database untuk agent ID: ${config.agent_config.ai_agent_id}`);
          }
        } else {
          // Reset agentUrl jika ai_agent_id null
          this.agentUrl = null;
          logger.info(`[${timestamp}] ✅ Agent URL direset ke null karena ai_agent_id null`);
        }
        
        // Update ai_agent_id di memory
        this.aiAgentId = config.agent_config.ai_agent_id;

        // Update di Redis jika tersedia
        if (this.configManager.redis) {
          try {
            await this.configManager.redis.set(
              `connection:${this.id}:ai_agent_id`,
              this.aiAgentId,
              'EX',
              3600 // Expire after 1 hour
            );
            this.logger.debug(`[${timestamp}] ✅ AI Agent ID disimpan ke Redis: ${this.aiAgentId}`);
            
            // Simpan juga agent URL ke Redis
            if (this.agentUrl) {
              await this.configManager.redis.set(
                `connection:${this.id}:agent_url`,
                this.agentUrl,
                'EX',
                3600 // Expire after 1 hour
              );
              this.logger.debug(`[${timestamp}] ✅ Agent URL disimpan ke Redis: ${this.agentUrl}`);
            }
          } catch (redisError) {
            logger.error(`[${timestamp}] ❌ Error menyimpan data agent ke Redis:`, redisError);
          }
        }

        this.logger.debug(`[${timestamp}] ✅ Agent config diperbarui:`, {
          agentUrl: this.agentUrl,
          aiAgentId: this.aiAgentId
        });

        // Load ulang konfigurasi agent
        await this.loadAgentConfig();
      }

      // Update message processor jika ada
      if (this.messageProcessor) {
        this.messageProcessor.updateConfig(this.webhookConfig, this.agentUrl);
        this.logger.debug(`[${timestamp}] ✅ Message processor diperbarui dengan konfigurasi baru:`, {
          hasWebhookUrl: !!this.webhookConfig?.url,
          agentUrl: this.agentUrl
        });
      }

      this.logger.debug(`[${timestamp}] ✅ Proses updateConfig selesai`);
    } catch (error) {
      const timestamp = new Date().toISOString();
      logger.error(`[${timestamp}] ❌ Error dalam updateConfig:`, error);
      throw error;
    }
  }

  /**
   * Update status koneksi di Redis
   * @param {string} status - Status koneksi (connected, disconnected, qr_ready, dll)
   * @param {Object} additionalData - Data tambahan untuk disimpan
   */
  async updateRedisStatus(status, additionalData = {}) {
    try {
      const redisKey = `connection:${this.id}`;
      
      // Coba dapatkan data dari Redis
      let currentData = null;
      try {
        currentData = await get(redisKey);
      } catch (redisGetError) {
        this.logger.warn(`Error getting Redis data for ${redisKey}: ${redisGetError.message}`);
        // Lanjutkan dengan data kosong jika tidak ada data sebelumnya
      }
      
      let connectionData = {};
      
      // Parse data yang ada jika tersedia
      if (currentData) {
        try {
          // Pastikan currentData adalah string JSON yang valid
          if (typeof currentData === 'string') {
            connectionData = JSON.parse(currentData);
          } else {
            this.logger.warn(`Redis data for ${redisKey} is not a string: ${typeof currentData}`);
            // Gunakan objek kosong jika data bukan string
          }
        } catch (parseError) {
          this.logger.warn(`Error parsing Redis data for ${redisKey}: ${parseError.message}`);
          // Lanjutkan dengan objek kosong jika parsing gagal
        }
      }
        
        // Update status dan tambahkan data lainnya
        const updatedData = {
          ...connectionData,
          status,
          connected: status === 'connected',
          phoneNumber: this.phoneNumber,
          updated_at: new Date().toISOString(),
      };
      
      // Tambahkan additional data dengan aman
      if (additionalData && typeof additionalData === 'object') {
        // Pastikan setiap nilai dalam additionalData dapat di-serialisasi
        Object.keys(additionalData).forEach(key => {
          try {
            // Cek apakah nilai dapat di-serialisasi
            const testSerialize = JSON.stringify(additionalData[key]);
            updatedData[key] = additionalData[key];
          } catch (serializeError) {
            this.logger.warn(`Cannot serialize additionalData[${key}], converting to string`);
            // Konversi ke string jika tidak bisa di-serialisasi
            updatedData[key] = String(additionalData[key]);
          }
        });
      }
      
      // Pastikan data dapat di-serialisasi
      let serializedData;
      try {
        serializedData = JSON.stringify(updatedData);
      } catch (stringifyError) {
        this.logger.error(`Error stringifying Redis data: ${stringifyError.message}`);
        // Fallback: Simpan hanya informasi status dasar
        serializedData = JSON.stringify({
          status,
          connected: status === 'connected',
          updated_at: new Date().toISOString()
        });
      }
      
      // Simpan ke Redis
      await set(redisKey, serializedData, 'EX', 3600);
        
        this.logger.debug(`Redis status updated to ${status} for connection ${this.id}`);
    } catch (error) {
      errorHandler(error, {
        module: 'WhatsAppConnection.updateRedisStatus',
        connectionId: this.id,
        operation: 'update_redis_status'
      });
    }
  }
}

export { WhatsAppConnection }; 