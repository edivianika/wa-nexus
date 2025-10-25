import { WhatsAppConnection } from './WhatsAppConnection.js';
import qrcode from 'qrcode';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { client as redis } from '../utils/redis.js';
import { loggerUtils } from '../utils/logger.js';
import { supabase } from '../utils/supabaseClient.js';

/**
 * Class untuk mengelola koneksi WhatsApp
 */
class ConnectionManager {
  static instance = null;

  /**
   * Get singleton instance of ConnectionManager
   * @returns {ConnectionManager} - Singleton instance
   */
  static getInstance() {
    if (!ConnectionManager.instance) {
      throw new Error('ConnectionManager belum diinisialisasi. Gunakan initialize() terlebih dahulu.');
    }
    return ConnectionManager.instance;
  }

  /**
   * Initialize ConnectionManager dengan dependencies
   * @param {Object} supabase - Instans Supabase
   * @param {Object} socketIo - Instans Socket.IO
   */
  static initialize(supabase, socketIo) {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager(supabase, socketIo);
    }
    return ConnectionManager.instance;
  }

  /**
   * Konstruktor
   * @param {Object} supabase - Instans Supabase
   * @param {Object} socketIo - Instans Socket.IO
   */
  constructor(io) {
    if (!io) {
      throw new Error('Socket.IO instance is required');
    }
    this.connections = new Map();
    this.io = io;
    this.supabase = supabase;
    this.redis = redis; // Use imported redis client
  }

  /**
   * Mendapatkan koneksi berdasarkan ID
   * @param {string} connectionId - ID koneksi
   * @returns {Object|null} - Instans koneksi atau null jika tidak ditemukan
   */
  getConnection(connectionId) {
    return this.connections.get(connectionId) || null;
  }

  /**
   * Mendapatkan data koneksi dari cache Redis atau database
   * @param {string} connectionId - ID koneksi
   * @returns {Object|null} - Data koneksi atau null jika tidak ditemukan
   */
  async getConnectionData(connectionId) {
    try {
      const timestamp = new Date().toISOString();
      // Coba ambil dari Redis terlebih dahulu
      const cacheKey = `connection:${connectionId}`;
      const cachedData = await redis.get(cacheKey);
      
      if (cachedData) {
        console.log(`[${timestamp}] 📊 Data koneksi diambil dari Redis cache untuk ID: ${connectionId}`);
        return cachedData;
      }
      
      // Jika tidak ada di cache, ambil dari database
      console.log(`[${timestamp}] 📊 Ambil data koneksi dari database untuk ID: ${connectionId}`);
      const { data, error } = await this.supabase
        .from('connections')
        .select('*')
        .eq('id', connectionId)
        .single();
        
      if (error) {
        console.error(`[${timestamp}] ❌ Error mengambil data koneksi:`, error);
        return null;
      }
      
      if (!data) {
        console.log(`[${timestamp}] ⚠️ Koneksi dengan ID ${connectionId} tidak ditemukan di database`);
        return null;
      }
      
      // Simpan ke Redis untuk request berikutnya (TTL 2 Hari)
      await redis.setWithTTL(cacheKey, data, 172800);
      // await redis.set(
      //   cacheKey,
      //   JSON.stringify(connectionConfig)
      // );
      console.log(`[${timestamp}] 📊 Data koneksi disimpan ke Redis cache untuk ID: ${connectionId}`);
      
      return data;
    } catch (error) {
      console.error(`Error dalam getConnectionData:`, error);
      // Jika Redis error, coba langsung dari database
      if (error.code === 'ECONNREFUSED' || error.name === 'NR_CLOSED') {
        try {
          const { data, error } = await this.supabase
            .from('connections')
            .select('*')
            .eq('id', connectionId)
            .single();
            
          if (error || !data) {
            return null;
          }
          return data;
        } catch (dbError) {
          console.error(`Database fallback error:`, dbError);
          return null;
        }
      }
      return null;
    }
  }

  /**
   * Memastikan direktori session ada
   * @param {string} directory - Direktori yang akan dibuat
   */
  async ensureDirectoryExists(directory) {
    // Tidak diperlukan lagi karena session disimpan di Redis
    // Method tetap ada untuk backward compatibility
    return true;
  }

  /**
   * Membuat koneksi baru
   * @param {string} name - Nama koneksi
   * @param {string} [connectionId] - ID koneksi (opsional, akan dibuat jika tidak ada)
   * @param {string} [userId] - ID pengguna (opsional)
   * @param {Date} [expiredDate] - Tanggal kadaluwarsa (opsional)
   * @returns {Object} - Info koneksi baru
   */
  async createConnection(name, connectionId = null, userId = null, expiredDate = null) {
    try {
      const timestamp = new Date().toISOString();
      
      // Generate ID koneksi baru jika tidak disediakan
      if (!connectionId) {
        connectionId = crypto.createHash('md5').update(`${name}-${Date.now()}`).digest('hex');
      }
      
      // Generate API Key jika tidak ada di database
      let apiKey = null;
      
      // Cek apakah koneksi sudah ada di database
      const { data: existingConnection, error: existingError } = await this.supabase
        .from('connections')
        .select('api_key')
        .eq('id', connectionId)
        .maybeSingle();
        
      if (existingConnection) {
        apiKey = existingConnection.api_key;
      } else {
        // Generate API Key baru
        apiKey = crypto.randomBytes(32).toString('hex');
        
        // Tambahkan ke database
        const { error: insertError } = await this.supabase
          .from('connections')
          .insert({
            id: connectionId,
            name,
            user_id: userId,
            api_key: apiKey,
            connected: false,
            created_at: new Date().toISOString(),
            expired_date: expiredDate ? expiredDate.toISOString() : null
          });
          
        if (insertError) {
          console.error(`[${timestamp}] ❌ Error membuat koneksi di database:`, insertError);
          throw insertError;
        }
      }
      
      // Buat direktori session
      await this.ensureDirectoryExists(`session/${connectionId}`);
      
      // Buat instance koneksi baru, sekarang dengan apiKey
      const connection = new WhatsAppConnection(connectionId, name, null, apiKey, this.io, this.supabase, userId);
      
      // Simpan di memory
      this.connections.set(connectionId, connection);
      
      // Load agent config
      await connection.loadAgentConfig();
      
      console.log(`[${timestamp}] ✅ Koneksi baru dibuat dengan ID: ${connectionId}`);
      
      return {
        id: connectionId,
        name,
        userId,
        apiKey,
        expiredDate: expiredDate ? expiredDate.toISOString() : null
      };
    } catch (error) {
      console.error(`Error membuat koneksi baru:`, error);
      throw error;
    }
  }

  /**
   * Connect ke WhatsApp
   * @param {string} connectionId - ID koneksi
   */
  async connect(connectionId) {
    try {
      const timestamp = new Date().toISOString();
      const connection = this.getConnection(connectionId);
      
      if (!connection) {
        console.error(`[${timestamp}] ❌ Koneksi dengan ID ${connectionId} tidak ditemukan`);
        
        // Coba dapatkan dari database
        const { data, error } = await this.supabase
          .from('connections')
          .select('*')
          .eq('id', connectionId)
          .single();
          
        if (error || !data) {
          throw new Error(`Koneksi dengan ID ${connectionId} tidak ditemukan`);
        }
        
        // Buat koneksi baru
        const newConnection = new WhatsAppConnection(
          connectionId,
          data.name,
          data.phone_number,
          data.api_key, // Teruskan apiKey dari data
          this.io,
          this.supabase,
          data.user_id // Teruskan user_id sebagai ownerId
        );
        
        this.connections.set(connectionId, newConnection);
        
        // Load agent config sebelum connect
        await newConnection.loadAgentConfig();
        
        // Connect ke WhatsApp
        await newConnection.connect();
        
        // Simpan metadata koneksi ke Redis untuk broadcast worker
        await this.saveConnectionToRedis(connectionId, newConnection);
        
        console.log(`[${timestamp}] ✅ Berhasil membuat dan terhubung ke WhatsApp untuk koneksi: ${connectionId}`);
        
        return newConnection.socket;
      }
      
      // Jika koneksi sudah ada, cek apakah sudah connected
      if (connection.connected) {
        console.log(`[${timestamp}] ℹ️ Koneksi ${connectionId} sudah terhubung`);
        return connection.socket;
      }
      
      // Connect ke WhatsApp
      await connection.connect();

      // Update metadata koneksi di Redis
      await this.saveConnectionToRedis(connectionId, connection);
      
      console.log(`[${timestamp}] ✅ Berhasil terhubung ke WhatsApp untuk koneksi: ${connectionId}`);
      
      return connection.socket;
    } catch (error) {
      console.error(`Error menghubungkan ke WhatsApp:`, error);
      throw error;
    }
  }

  /**
   * Simpan metadata koneksi ke Redis untuk digunakan oleh broadcast worker
   * @param {string} connectionId - ID koneksi
   * @param {WhatsAppConnection} connection - Objek koneksi
   */
  async saveConnectionToRedis(connectionId, connection) {
    try {
      // Simpan hanya metadata yang diperlukan, bukan seluruh objek koneksi
      const connectionMetadata = {
        id: connectionId,
        name: connection.name,
        phone_number: connection.phoneNumber,
        api_key: connection.apiKey,
        webhook_config: connection.webhookConfig,
        ai_agent_id: connection.aiAgentId,
        agent_url: connection.agentUrl,
        connected: connection.connected,
        updated_at: new Date().toISOString()
      };

      // Simpan ke Redis dengan TTL 1 jam
      await this.redis.set(
        `connection:${connectionId}`,
        JSON.stringify(connectionMetadata),
        'EX',
        3600
      );

      console.log(`[ConnectionManager] Metadata koneksi ${connectionId} berhasil disimpan ke Redis`);
    } catch (error) {
      console.error(`[ConnectionManager] Error menyimpan metadata koneksi ke Redis:`, error);
    }
  }

  /**
   * Disconnect dari WhatsApp
   * @param {string} connectionId - ID koneksi
   */
  async disconnect(connectionId) {
    try {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Memulai proses disconnect untuk koneksi: ${connectionId}`);
      
      const connection = this.connections.get(connectionId);
      if (!connection) {
        console.log(`[${timestamp}] Koneksi tidak ditemukan saat mencoba disconnect: ${connectionId}`);
        return;
      }

      // Disconnect dari WhatsApp
      if (connection.socket) {
        try {
          await connection.socket.logout();
          connection.socket = null;
          console.log(`[${timestamp}] Berhasil logout dari WhatsApp: ${connectionId}`);
        } catch (error) {
          console.error(`[${timestamp}] Error saat logout:`, error);
        }
      }
      
      // Hapus session dari Redis
      try {
        // Hapus semua keys yang terkait dengan koneksi ini
        const sessionKeys = await redis.keys(`session:${connectionId}:*`);
        if (sessionKeys && sessionKeys.length > 0) {
          await Promise.all(sessionKeys.map(key => redis.del(key)));
        }
        console.log(`[${timestamp}] Berhasil menghapus session dari Redis: ${connectionId}`);
      } catch (error) {
        console.error(`[${timestamp}] Error saat menghapus session dari Redis:`, error);
      }
      
      // Hapus dari memory
      this.connections.delete(connectionId);
      await redis.del(`connection:${connectionId}`);
      
      console.log(`[${timestamp}] Berhasil memutuskan koneksi WhatsApp: ${connectionId}`);
      
      // Update status di database
      try {
        await this.supabase
          .from('connections')
          .update({ connected: false })
          .eq('id', connectionId);
        console.log(`[${timestamp}] Berhasil update status di database: ${connectionId}`);
      } catch (error) {
        console.error(`[${timestamp}] Error mengupdate status di database:`, error);
      }
      
      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error memutuskan koneksi WhatsApp:`, error);
      throw error;
    }
  }

  /**
   * Memuat semua koneksi dari database
   */
  async loadAllConnections() {
    try {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] 🔄 Memuat koneksi dari Supabase...`);
      
      // Dapatkan informasi server
      const serverBase = process.env.BASE_URL || 'http://localhost:3000';
      
      // Ambil semua koneksi yang belum expired dari database
      console.log(`[${timestamp}] 📊 Query tabel 'connections' untuk server=${serverBase} dan belum expired`);
      const { data, error, count } = await this.supabase
        .from('connections')
        .select('*', { count: 'exact' });
        
      if (error) {
        console.error(`[${timestamp}] ❌ Error mengambil data koneksi:`, error);
        throw error;
      }
      
      console.log(`[${timestamp}] 📋 Hasil query connections:`, { count: data.length });
      
      // Filter koneksi yang statusnya connected=true
      const activeConnections = data.filter(conn => conn.connected === true);
      console.log(`[${timestamp}] 🔍 Ditemukan ${activeConnections.length} koneksi aktif dari total ${data.length} koneksi`);
      
      // Hubungkan koneksi yang statusnya connected=true
      console.log(`[${timestamp}] 🔌 Menghubungkan koneksi yang statusnya connected=true...`);
      const connectPromises = data.map(async (connection) => {
        try {
          // Tambahkan koneksi ke memori terlebih dahulu
          const whatsappConnection = new WhatsAppConnection(
            connection.id,
            connection.name,
            connection.phone_number,
            connection.api_key,
            this.io,
            this.supabase,
            connection.user_id // Teruskan user_id sebagai ownerId
          );
          this.connections.set(connection.id, whatsappConnection);
          // Load agent config
          await whatsappConnection.loadAgentConfig();
          // Jika connected, hubungkan
          if (connection.connected === true) {
            // Hubungkan ke WhatsApp
            await whatsappConnection.connect();
          } else {
            // console.log(`[${timestamp}] ℹ️ Koneksi ${connection.id} (${connection.name}) tidak perlu dihubungkan (connected=false)`);
          }
        } catch (error) {
          console.error(`[${timestamp}] ❌ Error menghubungkan koneksi ${connection.id}:`, error);
        }
      });
      await Promise.all(connectPromises);
      console.log(`[${timestamp}] ✅ Proses memuat dan menghubungkan koneksi selesai`);
    } catch (error) {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] ❌ Error dalam loadAllConnections:`, error);
    }
  }

  /**
   * Mendapatkan QR Code untuk koneksi
   * @param {string} connectionId - ID koneksi
   * @returns {string} - QR Code sebagai data URL
   */
  async getQrCode(connectionId) {
    try {
      const connection = this.getConnection(connectionId);
      
      if (!connection) {
        throw new Error(`Koneksi dengan ID ${connectionId} tidak ditemukan`);
      }
      
      if (!connection.qrCode) {
        throw new Error('QR Code belum tersedia');
      }
      
      // QR code sudah dalam format Data URL, tidak perlu dikonversi lagi
      return {
        qrCode: connection.qrCode,
        connectionId
      };
    } catch (error) {
      console.error('Error mendapatkan QR Code:', error);
      throw error;
    }
  }

  /**
   * Refresh koneksi - reload config dan reconnect jika perlu
   * @param {string} connectionId - ID koneksi
   */
  async refreshConnection(connectionId) {
    try {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] 🔄 Refreshing connection: ${connectionId}`);
      
      const connection = this.getConnection(connectionId);
      if (!connection) {
        console.log(`[${timestamp}] ⚠️ Connection ${connectionId} not found in memory`);
        return false;
      }
      
      // Update agent config
      await connection.loadAgentConfig();
      
      // Update webhook config
      await connection.loadConfig();
      
      // Update di Redis
      await this.saveConnectionToRedis(connectionId, connection);
      
      console.log(`[${timestamp}] ✅ Connection ${connectionId} refreshed successfully`);
      return true;
    } catch (error) {
      console.error(`Error refreshing connection ${connectionId}:`, error);
      return false;
    }
  }

  /**
   * Mendapatkan statistik koneksi
   * @returns {Object} - Statistik koneksi
   */
  async getConnectionStats() {
    try {
      let connected = 0;
      let disconnected = 0;
      let connecting = 0;
      
      // Hitung koneksi dari memory
      for (const [_, connection] of this.connections.entries()) {
        if (connection.connected === true) {
          connected++;
        } else if (connection.connecting === true) {
          connecting++;
        } else {
          disconnected++;
        }
      }
      
      // Jika tidak ada koneksi di memory, coba ambil dari database
      if ((connected + disconnected + connecting) === 0) {
        const { data, error } = await this.supabase
          .from('connections')
          .select('connected');
          
        if (!error && data) {
          connected = data.filter(conn => conn.connected === true).length;
          disconnected = data.filter(conn => conn.connected === false).length;
        }
      }
      
      return {
        connected,
        disconnected,
        connecting,
        total: connected + disconnected + connecting
      };
    } catch (error) {
      console.error('Error getting connection stats:', error);
      return {
        connected: 0,
        disconnected: 0,
        connecting: 0,
        total: 0,
        error: error.message
      };
    }
  }
}

export default ConnectionManager;

// Export getConnectionManager function
export const getConnectionManager = () => ConnectionManager.getInstance(); 