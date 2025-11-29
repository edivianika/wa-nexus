import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { getConnectionManager } from '../utils/connectionManagerSingleton.js';
import { authenticateApiKey, corsMiddleware, requestLogger, validateDeviceId, delay } from '../utils/middleware.js';
import { rateLimitMiddleware } from '../utils/rateLimiter.js';
import { loggerUtils, errorHandler, socketEvent, databaseOperation } from '../utils/logger.js';
import { metricsMiddleware, startMetricsServer, updateConnectionMetrics } from '../utils/metrics.js';
import { getBreakerStats, resetBreaker } from '../utils/circuitBreaker.js';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { supabase } from '../utils/supabaseClient.js';
import billingService from './services/billingService.js';
import { checkTrialExpired } from '../middleware/checkTrialExpired.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Corrected and cleaned up route imports
import connectionRoutes from './routes/connectionRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import contactsRoutes from './routes/contactsRoutes.js';
import broadcastMediaRoutes from './routes/broadcastMediaRoutes.js';
import dripRoutes from './routes/dripRoutes.js';
import dripSegmentRoutes from './routes/dripSegmentRoutes.js';
import scheduledMessageRoutes from './routes/scheduledMessageRoutes.js';
import kanbanRoutes from './routes/kanbanRoutes.js';
import assetRoutes from './routes/assetRoutes.js';
import billingRoutes from './routes/billingRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import docsRoutes from './routes/docsRoutes.js';

/**
 * Class untuk menangani server dan endpoint API
 */
class ApiServer {
  /**
   * Konstruktor
   * @param {number} port - Port server
   * @param {string} host - Host server
   */
  constructor(port, host) {
    this.port = port || process.env.PORT || 3000;
    this.host = host || process.env.HOST || 'localhost';
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server, this.getCorsConfig());
    
    // Inisialisasi Supabase
    this.supabase = supabase;
    
    // Inisialisasi Connection Manager
    this.connectionManager = getConnectionManager(this.io);
    
    // Middleware authenticateApiKey
    this.authMiddleware = authenticateApiKey(this.supabase);

    // Setup socket event handlers
    this.setupSocketEvents();

    // Mulai metrics server
    this.startMetricsServer();

    // Log inisialisasi server
    loggerUtils.info('ApiServer initialized', {
      port: this.port,
      host: this.host
    });
  }

  /**
   * Setup socket event handlers
   */
  setupSocketEvents() {
    this.io.on('connection', (socket) => {
      socketEvent('connection', { socketId: socket.id });

      // Handle join room event
      socket.on('join', (data) => {
        if (data.connectionId) {
          socket.join(data.connectionId);
          socketEvent('join', { 
            socketId: socket.id,
            room: data.connectionId
          });
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        socketEvent('disconnection', { socketId: socket.id });
      });
    });
  }

  /**
   * Mendapatkan konfigurasi CORS untuk Socket.IO
   * @returns {Object} - Konfigurasi CORS
   */
  getCorsConfig() {
    return {
      cors: {
        origin: [
          'https://wa.bulumerak.com',
          'http://localhost:8080',
          'http://localhost:3000',
          ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : [])
        ],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'device_id', 'x-api-key'],
        credentials: true
      }
    };
  }

  /**
   * Setup middleware untuk Express
   */
  setupMiddleware() {
    // --- KONFIGURASI CORS BARU & SEDERHANA ---
    const allowedOrigins = [
      'https://wa.bulumerak.com',
      'http://localhost:8080', // Frontend
      'http://localhost:3000', // Server
      ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : [])
    ];
    
    this.app.use(cors({
      origin: function (origin, callback) {
        // Izinkan request tanpa origin (seperti dari Postman, curl, dll)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
          const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
          return callback(new Error(msg), false);
        }
        return callback(null, true);
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Requested-With', 
        'device_id',
        'connection_id', 
        'x-api-key',
        'x-user-id',
        'x-is-admin'
      ],
      credentials: true,
      maxAge: 86400
    }));

    // Tambahkan metrics middleware
    this.app.use(metricsMiddleware());

    // Tambahkan rate limiter
    const apiRateLimit = parseInt(process.env.API_RATE_LIMIT || '100');
    const apiRateWindow = parseInt(process.env.API_RATE_WINDOW || '60000');
    this.app.use(rateLimitMiddleware({
      limit: apiRateLimit,
      window: apiRateWindow,
      keyGenerator: (req) => {
        return req.headers['authorization'] 
          ? req.headers['authorization'].split(' ')[1]
          : req.ip;
      }
    }));

    // Middleware untuk validasi device_id header
    this.app.use(validateDeviceId());

    // Middleware untuk logging semua request API
    this.app.use((req, res, next) => {
      // Skip tracking API requests if we're not in verbose mode
      const LOG_VERBOSE = process.env.LOG_VERBOSE === 'true';
      
      // Always track the start time for potential error logging
      const startTime = Date.now();
      
      res.on('finish', () => {
        // Only log if it's an error or we're in verbose mode
        const isError = res.statusCode >= 400;
        if (isError || LOG_VERBOSE) {
        const duration = Date.now() - startTime;
          
          // Log errors as warnings, successful requests as info
          const logMethod = isError ? 'warn' : 'info';
          loggerUtils[logMethod]('API Request', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip
        });
        }
      });
      
      next();
    });

    // Parsing JSON
    this.app.use(express.json());
    
    // Serve static files
    this.app.use(express.static(path.join(process.cwd(), 'public')));
    
    // Khusus untuk media files dengan cache control
    this.app.use('/media', (req, res, next) => {
      // Set cache headers untuk media
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 jam
      next();
    }, express.static(path.join(process.cwd(), 'public/media')));
  }

  /**
   * Setup route untuk API
   */
  setupRoutes() {
    // Mengatur api-documentation.html sebagai halaman utama
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'public', 'api-documentation.html'));
    });

    // Corrected and cleaned up route mounting
    this.app.use('/api', messageRoutes(this.authMiddleware));
    this.app.use('/api', agentRoutes);
    this.app.use('/api', webhookRoutes);
    this.app.use('/api', broadcastMediaRoutes);
    this.app.use('/api/connections', connectionRoutes);
    this.app.use('/api/contacts', contactsRoutes);
    this.app.use('/api/drip', dripRoutes);
    this.app.use('/api/drip-segments', dripSegmentRoutes);
    this.app.use('/api/scheduled-messages', scheduledMessageRoutes);
    this.app.use('/api/kanban', kanbanRoutes);
    this.app.use('/api/assets', assetRoutes);
    this.app.use('/api/billing', billingRoutes);
    this.app.use('/api', mediaRoutes);
    this.app.use('/api/docs', docsRoutes);

    // Route khusus untuk dokumentasi n8n
    this.app.get('/docn8n', (req, res) => {
      res.redirect('/api/docs/n8n');
    });

    // Endpoint untuk meminta QR code
    this.app.post('/api/qr/request', this.authMiddleware, async (req, res) => {
      try {
        const connectionId = req.connection.id;
        loggerUtils.info('QR code request received', { connectionId });

        // Cek apakah koneksi sudah ada di memory
        let connection = this.connectionManager.getConnection(connectionId);
        
        // Jika koneksi sudah connected, disconnect dulu untuk force reconnect
        if (connection && connection.connected === true) {
          loggerUtils.info('Disconnecting existing connection to generate new QR', { connectionId });
          try {
            await this.connectionManager.disconnect(connectionId);
            // Tunggu sebentar untuk memastikan disconnect selesai
            await delay(1000);
          } catch (disconnectError) {
            loggerUtils.warn('Error during disconnect, continuing anyway', { connectionId, error: disconnectError.message });
          }
        }
        
        // Hapus session dari Redis untuk memastikan QR code baru dihasilkan
        try {
          const { client, keys, del } = await import('../utils/redis.js');
          const sessionKeys = await keys(`session:${connectionId}:*`);
          if (sessionKeys && sessionKeys.length > 0) {
            await Promise.all(sessionKeys.map(key => del(key)));
            loggerUtils.info('Session keys deleted from Redis', { connectionId, count: sessionKeys.length });
          }
        } catch (redisError) {
          loggerUtils.warn('Error deleting session from Redis, continuing anyway', { connectionId, error: redisError.message });
        }
        
        // Connect ke WhatsApp untuk mendapatkan QR code
        await this.connectionManager.connect(connectionId);
        
        // Tunggu hingga QR code tersedia
        let attempts = 0;
        const maxAttempts = 30; // Increase timeout to 15 seconds
        
        while (attempts < maxAttempts) {
          connection = this.connectionManager.getConnection(connectionId);
          if (connection && connection.qrCode) {
            loggerUtils.info('QR code generated', { connectionId });
            return res.json({
              success: true,
              qrCode: connection.qrCode
            });
          }
          await delay(500);
          attempts++;
        }
        
        loggerUtils.error('QR code timeout', { connectionId });
        return res.status(408).json({
          success: false,
          error: 'Timeout menunggu QR code. Silakan coba lagi.'
        });
      } catch (error) {
        errorHandler(error, { 
          module: 'ApiServer',
          operation: 'request_qr_code',
          connectionId: req.connection?.id
        });
        res.status(500).json({
          success: false,
          error: 'Terjadi kesalahan saat meminta QR code: ' + (error.message || 'Unknown error')
        });
      }
    });

    // Endpoint untuk mendapatkan QR code (tanpa autentikasi, untuk compatibility)
    this.app.get('/api/qr/:connectionId', async (req, res) => {
      try {
        const { connectionId } = req.params;
        
        if (!connectionId) {
          return res.status(400).json({
            success: false,
            error: 'Connection ID diperlukan'
          });
        }
        
        // Dapatkan QR code
        try {
          const result = await this.connectionManager.getQrCode(connectionId);
          
          // QR code sudah dalam format Data URL
          res.json({
            success: true,
            qrCode: result.qrCode
          });
        } catch (error) {
          // Jika QR code belum tersedia
          res.status(404).json({
            success: false,
            error: 'QR Code belum tersedia'
          });
        }
      } catch (error) {
        console.error('Error mendapatkan QR code:', error);
        res.status(500).json({
          success: false,
          error: 'Gagal mendapatkan QR code: ' + error.message
        });
      }
    });

    // Endpoint untuk membuat koneksi baru
    this.app.post('/api/connection/create', checkTrialExpired, async (req, res) => {
      try {
        const { userId, connectionName, expiredDate } = req.body;
        
        if (!userId || !connectionName) {
          return res.status(400).json({
            success: false,
            error: 'User ID dan Connection Name diperlukan'
          });
        }

        // Check device limit based on subscription
        const subscription = await billingService.getActiveSubscription(userId);
        const planLimits = subscription?.plans_new?.limits || { active_devices: 1 };
        const deviceLimit = planLimits.active_devices === -1 ? Infinity : (planLimits.active_devices || 1);

        // Count existing devices for this user
        const { count, error: countError } = await this.supabase
          .from('connections')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);

        if (countError) {
          loggerUtils.error('Error counting connections:', countError);
          return res.status(500).json({
            success: false,
            error: 'Gagal memverifikasi batas perangkat.'
          });
        }

        if (count >= deviceLimit) {
          return res.status(403).json({
            success: false,
            error: `Batas perangkat untuk paket Anda telah tercapai (${count}/${deviceLimit}). Silakan upgrade paket Anda untuk menambah perangkat.`
          });
        }

        // Generate connection ID unik
        const connectionId = crypto.randomBytes(16).toString('hex');
        
        // Generate API Key
        const apiKey = crypto.randomBytes(32).toString('hex');

        // Validasi expiredDate jika ada
        let parsedExpiredDate = null;
        if (expiredDate) {
          try {
            parsedExpiredDate = new Date(expiredDate);
            
            // Pastikan expiredDate valid dan di masa depan
            if (isNaN(parsedExpiredDate) || parsedExpiredDate <= new Date()) {
              return res.status(400).json({
                success: false,
                error: 'Expired date harus berupa tanggal valid di masa depan'
              });
            }
          } catch (e) {
            return res.status(400).json({
              success: false,
              error: 'Format expired date tidak valid'
            });
          }
        }

        // Simpan ke tabel connections di Supabase
        const BASE_URL = process.env.BASE_URL || `http://${this.host}:${this.port}`;
        const { data, error } = await this.supabase
          .from('connections')
          .insert([{
            id: connectionId,
            user_id: userId,
            name: connectionName,
            status: 'initialized',
            api_key: apiKey,
            connected: false,
            created_at: new Date().toISOString(),
            expired_date: parsedExpiredDate ? parsedExpiredDate.toISOString() : null,
            server: BASE_URL
          }])
          .select()
          .single();

        if (error) {
          loggerUtils.error('Error saving to database', error);
          return res.status(500).json({
            success: false,
            error: 'Gagal menyimpan koneksi ke database'
          });
        }

        // Buat instance koneksi baru
        const connection = await this.connectionManager.createConnection(connectionName, connectionId, userId, parsedExpiredDate);
        
        loggerUtils.info('Koneksi baru dibuat', {
          id: connectionId,
          name: connectionName,
          userId: userId,
          expiredDate: parsedExpiredDate ? parsedExpiredDate.toISOString() : 'Tidak ada'
        });

        res.json({
          success: true,
          connection: {
            id: data.id,
            userId: data.user_id,
            name: data.name,
            status: data.status,
            createdAt: data.created_at,
            expiredDate: data.expired_date,
            apiKey: apiKey
          }
        });
      } catch (error) {
        loggerUtils.error('Error creating connection', error);
        res.status(500).json({
          success: false,
          error: 'Terjadi kesalahan saat membuat koneksi'
        });
      }
    });

    // Endpoint untuk mendapatkan detail koneksi
    this.app.get('/api/connections/:connectionId', async (req, res) => {
      try {
        const { connectionId } = req.params;
        
        // Ambil detail koneksi dari database
        const { data, error } = await this.supabase
          .from('connections')
          .select('id, name, phone_number, connected, created_at, webhook_config, ai_agent_id, user_id, status, expired_date')
          .eq('id', connectionId)
          .single();
          
        if (error) {
          throw error;
        }
        
        if (!data) {
          return res.status(404).json({
            success: false,
            error: 'Koneksi tidak ditemukan'
          });
        }
        
        res.json({
          success: true,
          connection: data
        });
      } catch (error) {
        console.error('Error mendapatkan detail koneksi:', error);
        res.status(500).json({
          success: false,
          error: 'Gagal mendapatkan detail koneksi: ' + error.message
        });
      }
    });

    // Endpoint untuk mengupdate webhook configuration
    this.app.put('/api/webhook/update', this.authMiddleware, async (req, res) => {
      try {
        const { url, triggers } = req.body;
        const connectionId = req.connection.id;

        // Validasi input
        if (!url) {
          return res.status(400).json({
            success: false,
            error: 'URL webhook diperlukan'
          });
        }

        // Validasi triggers
        const validTriggers = {
          private: triggers?.private || false,
          group: triggers?.group || false,
          broadcast: triggers?.broadcast || false,
          newsletter: triggers?.newsletter || false
        };

        const webhookConfig = {
          url,
          triggers: validTriggers
        };

        // Update di database
        const { error: updateError } = await this.supabase
          .from('connections')
          .update({
            webhook_config: webhookConfig,
            updated_at: new Date().toISOString()
          })
          .eq('id', connectionId);

          

        if (updateError) {
          loggerUtils.error('Error update webhook di database', updateError);
          return res.status(500).json({
            success: false,
            error: 'Gagal mengupdate webhook di database'
          });
        }

        // Refresh koneksi setelah update webhook config
        await this.connectionManager.refreshConnection(connectionId);

        loggerUtils.info('Webhook berhasil diupdate', {
          connectionId,
          url,
          triggers: validTriggers
        });

        res.json({
          success: true,
          message: 'Webhook berhasil diupdate',
          data: {
            connectionId,
            webhook: webhookConfig,
            updatedAt: new Date().toISOString()
          }
        });
      } catch (error) {
        loggerUtils.error('Error update webhook', error);
        res.status(500).json({
          success: false,
          error: 'Terjadi kesalahan saat mengupdate webhook'
        });
      }
    });

    // Endpoint untuk mengupdate AI Agent (versi baru dari API)
    this.app.put('/api/connections/:connectionId/agent', async (req, res) => {
      try {
        const { connectionId } = req.params;
        const { ai_agent_id } = req.body;
        
        if (!ai_agent_id) {
          return res.status(400).json({
            success: false,
            error: 'AI Agent ID diperlukan'
          });
        }
        
        // Update di database
        const { data, error } = await this.supabase
          .from('connections')
          .update({ 
            ai_agent_id: ai_agent_id,
            updated_at: new Date().toISOString()
          })
          .eq('id', connectionId)
          .select()
          .single();
          
        if (error) {
          throw error;
        }
        
        // Log update
        const timestamp = new Date().toISOString();
        loggerUtils.info(`[${timestamp}] 🤖 AI Agent ID koneksi ${connectionId} diperbarui:`, {
          oldAgentId: data.ai_agent_id || 'Tidak ada',
          newAgentId: ai_agent_id
        });
        
        // Refresh koneksi untuk mendapatkan agent URL
        await this.connectionManager.refreshConnection(connectionId);
        
        res.json({
          success: true,
          message: 'AI Agent berhasil diupdate',
          data: {
            connectionId,
            ai_agent_id: ai_agent_id
          }
        });
      } catch (error) {
        const timestamp = new Date().toISOString();
        loggerUtils.error(`[${timestamp}] ❌ Error mengupdate AI Agent:`, error);
        res.status(500).json({
          success: false,
          error: 'Gagal mengupdate AI Agent: ' + error.message
        });
      }
    });

    // Endpoint untuk menghapus koneksi
    this.app.delete('/api/connection/:connectionId', this.authMiddleware, async (req, res) => {
      try {
        const { connectionId } = req.params;
        
        // Disconnect dan hapus koneksi
        await this.connectionManager.disconnect(connectionId);
        
        // Hapus dari database
        const { data, error } = await this.supabase
          .from('connections')
          .delete()
          .eq('id', connectionId)
          .select()
          .single();
          
        if (error) {
          console.error('Error menghapus dari database:', error);
        }
        
        res.json({
          success: true,
          message: 'Koneksi berhasil dihapus'
        });
      } catch (error) {
        console.error('Error saat menghapus koneksi:', error);
        res.status(500).json({
          success: false,
          error: 'Gagal menghapus koneksi: ' + error.message
        });
      }
    });

    // Endpoint untuk logout (bentuk lain dari delete, untuk compatibility)
    this.app.post('/api/logout/:connectionId', async (req, res) => {
      try {
        const { connectionId } = req.params;
        
        // Logout dari WhatsApp
        await this.connectionManager.disconnect(connectionId);
        
        res.json({
          success: true,
          message: 'Berhasil logout dari WhatsApp'
        });
      } catch (error) {
        console.error('Error logout:', error);
        res.status(500).json({
          success: false,
          error: 'Gagal logout: ' + error.message
        });
      }
    });

    // Endpoint untuk memeriksa status Redis
    this.app.get('/api/status/redis', async (req, res) => {
      try {
        const { client: redis } = await import('../utils/redis.js');
        const testKey = 'redis:test:' + Date.now();
        const testValue = { test: true, timestamp: Date.now() };
        
        // Simpan data test ke Redis
        const setResult = await redis.set(testKey, testValue);
        
        // Ambil data dari Redis
        const getValue = await redis.get(testKey);
        
        // Hapus data test
        await redis.del(testKey);
        
        // Periksa apakah operasi berhasil
        const isSuccess = setResult && getValue && getValue.test === true;
        
        res.json({
          success: true,
          status: isSuccess ? 'connected' : 'error',
          details: {
            setResult,
            getValue,
            testKey
          }
        });
      } catch (error) {
        console.error('Redis status check error:', error);
        res.status(500).json({
          success: false,
          status: 'error',
          error: error.message,
          code: error.code
        });
      }
    });

    // Endpoint untuk health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now()
      });
    });

    // Endpoint untuk monitoring koneksi
    this.app.get('/api/connections/status', async (req, res) => {
      try {
        const stats = await this.connectionManager.getConnectionStats();
        const connections = [];
        
        // Ambil detail setiap koneksi
        for (const [id, connection] of this.connectionManager.connections.entries()) {
          connections.push({
            id: connection.id,
            name: connection.name,
            phoneNumber: connection.phoneNumber,
            connected: connection.connected,
            reconnectAttempts: connection.reconnectAttempts,
            lastHeartbeat: connection.lastHeartbeat,
            agentId: connection.aiAgentId,
            agentUrl: connection.agentUrl
          });
        }
        
        res.json({
          success: true,
          stats,
          connections
        });
      } catch (error) {
        console.error('Error getting connection status:', error);
        res.status(500).json({
          success: false,
          error: 'Gagal mendapatkan status koneksi'
        });
      }
    });

    // Endpoint untuk force reconnect
    this.app.post('/api/connections/:connectionId/reconnect', this.authMiddleware, async (req, res) => {
      try {
        const { connectionId } = req.params;
        
        // Disconnect dulu
        await this.connectionManager.disconnect(connectionId);
        
        // Tunggu sebentar
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Connect kembali
        await this.connectionManager.connect(connectionId);
        
        res.json({
          success: true,
          message: 'Koneksi berhasil di-reconnect'
        });
      } catch (error) {
        console.error('Error reconnecting:', error);
        res.status(500).json({
          success: false,
          error: 'Gagal reconnect koneksi'
        });
      }
    });

    // Endpoint untuk circuit breaker stats dan reset
    this.app.get('/api/system/circuit-breakers', this.authMiddleware, (req, res) => {
      const stats = getBreakerStats();
      res.json({
        success: true,
        stats
      });
    });

    // Endpoint untuk reset circuit breaker
    this.app.post('/api/system/circuit-breakers/reset', this.authMiddleware, (req, res) => {
      const { serviceKey } = req.body;
      if (!serviceKey) {
        return res.status(400).json({
          success: false,
          error: 'serviceKey is required'
        });
      }
      
      resetBreaker(serviceKey);
      res.json({
        success: true,
        message: `Circuit breaker for ${serviceKey} has been reset`
      });
    });
  }

  /**
   * Start metrics server
   */
  startMetricsServer() {
    const metricsPort = parseInt(process.env.METRICS_PORT || '9090');
    startMetricsServer(metricsPort);
    
    // Update connection metrics setiap 30 detik
    setInterval(() => {
      try {
        // Gunakan metode getConnectionStats() yang baru ditambahkan
        const stats = this.connectionManager.getConnectionStats();
        updateConnectionMetrics({
          connected: stats.connected || 0,
          disconnected: stats.disconnected || 0,
          connecting: stats.connecting || 0
        });
      } catch (error) {
        console.error('Error updating connection metrics:', error.message);
      }
    }, 30000);
  }

  /**
   * Memulai server
   */
  start() {
    this.setupMiddleware();
    this.setupRoutes();
    
    this.server.listen(this.port, this.host, () => {
      loggerUtils.info('Server started', {
        port: this.port,
        host: this.host,
        baseUrl: process.env.BASE_URL || `http://${this.host}:${this.port}`
      });
      
      // Muat semua koneksi dari database
      this.connectionManager.loadAllConnections();
    });
  }
}

export { ApiServer }; 