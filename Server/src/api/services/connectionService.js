import { loggerUtils } from '../../utils/logger.js';
import crypto from 'crypto';
import { getConnectionManager } from '../../utils/connectionManagerSingleton.js';
import { supabase, supabaseAdmin } from '../../utils/supabaseClient.js';
import { client as redis } from '../../utils/redis.js';
import billingService from './billingService.js';

export const createConnection = async (req, res) => {
  try {
    const { name, expired_date } = req.body;
    const userId = req.user?.id;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Nama koneksi diperlukan'
      });
    }

    // Check subscription limit
    const subscription = await billingService.getActiveSubscription(userId);
    const planLimits = subscription?.plans_new?.limits || { active_devices: 1 }; // Default to 1 if no plan
    const deviceLimit = planLimits.active_devices === -1 ? Infinity : (planLimits.active_devices || 1);

    const { count, error: countError } = await supabase
      .from('connections')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      loggerUtils.error('Error counting connections:', countError);
      throw new Error('Gagal memverifikasi batas perangkat.');
    }

    if (count >= deviceLimit) {
      return res.status(403).json({
        success: false,
        error: 'Batas perangkat untuk paket Anda telah tercapai. Silakan upgrade paket Anda untuk menambah perangkat.'
      });
    }

    // Generate connection ID
    const connectionId = crypto.createHash('md5').update(`${name}-${Date.now()}`).digest('hex');
    
    // Parse expired date jika ada
    let parsedExpiredDate = null;
    if (expired_date) {
      parsedExpiredDate = new Date(expired_date);
      if (isNaN(parsedExpiredDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Format tanggal kadaluwarsa tidak valid'
        });
      }
    }

    // Gunakan singleton ConnectionManager
    const connectionManager = getConnectionManager();
    if (!connectionManager) {
      throw new Error('ConnectionManager tidak tersedia');
    }

    await connectionManager.createConnection(name, connectionId, userId, parsedExpiredDate);
     
    res.json({
      success: true,
      message: 'Koneksi berhasil dibuat',
      data: {
        id: connectionId,
        name,
        userId,
        expiredDate: parsedExpiredDate
      }
    });
  } catch (error) {
    loggerUtils.error('Error saat membuat koneksi:', error);
    res.status(500).json({
      success: false,
      error: 'Gagal membuat koneksi: ' + error.message
    });
  }
};

export const getAllConnections = async (req, res) => {
  try {
    // Get user ID from req.user (set by extractUserId middleware)
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    loggerUtils.info(`Fetching connections for user: ${userId}`);

    let query = supabase
      .from('connections')
      .select('id, name, phone_number, connected, created_at, webhook_config, ai_agent_id, user_id, status, expired_date')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Filter by status if provided in query params
    if (req.query.status === 'connected') {
      query = query.eq('connected', true);
    }

    const { data, error } = await query;

    if (error) {
      loggerUtils.error('Error fetching connections:', error);
      throw error;
    }
    
    loggerUtils.info(`Successfully fetched ${data ? data.length : 0} connections for user ${userId}`);

    res.json({
      success: true,
      connections: data
    });
  } catch (error) {
    loggerUtils.error('Error getting connections list:', error);
    res.status(500).json({
      success: false,
      error: 'Gagal mendapatkan daftar koneksi: ' + error.message
    });
  }
};

export const getConnectionDetail = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { data, error } = await supabase
      .from('connections')
      .select('id, name, phone_number, connected, created_at, webhook_config, ai_agent_id, user_id, status, expired_date')
      .eq('id', connectionId)
      .single();
    if (error) throw error;
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
    loggerUtils.error('Error mendapatkan detail koneksi:', error);
    res.status(500).json({
      success: false,
      error: 'Gagal mendapatkan detail koneksi: ' + error.message
    });
  }
};

export const deleteConnection = async (req, res) => {
  const { connectionId } = req.params;
  
  try {
    // Hanya delete dari database
    const { error } = await supabase
      .from('connections')
      .delete()
      .eq('id', connectionId);

    if (error) {
      loggerUtils.error('Error delete connection:', error);
      return res.status(500).json({
        success: false,
        error: 'Gagal menghapus connection'
      });
    }

    return res.json({
      success: true,
      message: 'Connection berhasil dihapus'
    });

  } catch (error) {
    loggerUtils.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Terjadi kesalahan'
    });
  }
};

export const connectWhatsApp = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { getConnectionManager } = await import('../../utils/connectionManagerSingleton.js');
    const connectionManager = getConnectionManager();
    
    if (!connectionManager) {
      return res.status(500).json({
        success: false,
        error: 'Connection manager not available'
      });
    }

    const connection = connectionManager.getConnection(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found'
      });
    }

    if (connection.connected) {
      return res.json({
        success: true,
        message: 'Connection already connected',
        data: {
          id: connection.id,
          connected: connection.connected
        }
      });
    }

    // Start connection
    await connection.connect();
    
    res.json({
      success: true,
      message: 'Connection started',
      data: {
        id: connection.id,
        connected: connection.connected
      }
    });
  } catch (error) {
    loggerUtils.error('Error connecting WhatsApp:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to connect: ' + error.message
    });
  }
};

export const disconnectWhatsApp = async (req, res) => {
  try {
    const { connection_id } = req.body;
    
    if (!connection_id) {
      return res.status(400).json({
        success: false,
        error: 'Connection ID diperlukan'
      });
    }

    const connectionManager = getConnectionManager();
    const connection = connectionManager.getConnection(connection_id);

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Koneksi tidak ditemukan'
      });
    }

    // Disconnect WhatsApp
    await connection.disconnect();

    // Update status in database
    const { error } = await supabase
      .from('connections')
      .update({
        connected: false,
        status: 'disconnected',
        updated_at: new Date().toISOString()
      })
      .eq('id', connection_id);

    if (error) {
      loggerUtils.error('Error updating connection status:', error);
      throw error;
    }

    res.json({
      success: true,
      message: 'WhatsApp berhasil disconnect'
    });
  } catch (error) {
    loggerUtils.error('Error saat disconnect WhatsApp:', error);
    res.status(500).json({
      success: false,
      error: 'Gagal disconnect WhatsApp: ' + error.message
    });
  }
};

export const refreshConnection = async (req, res) => {
  try {
    const connectionId = req.headers['connection_id'];
    const { client: redis } = await import('../../utils/redis.js');
 

    if (!connectionId) {
      return res.status(400).json({
        success: false,
        error: 'Connection ID is required'
      });
    }

    // Delete existing Redis keys for connection
    await redis.client.del(`connection:${connectionId}`);

    // Get fresh data from database
    const { data: connectionData, error: connectionError } = await supabase
      .from('connections')
      .select('*')
      .eq('id', connectionId)
      .single();

    if (connectionError || !connectionData) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found'
      });
    }

    // Set new Redis data
    await redis.client.set(`connection:${connectionId}`, JSON.stringify(connectionData));

 

    if(connectionData.ai_agent_id){
        // Delete existing Redis keys for agent settings
        await redis.client.del(`agent:${connectionData.ai_agent_id}:settings`); 

        // Get fresh data from database
        const { data: connectionAgent, error: connectionAgentError } = await supabase
          .from('ai_agents')
          .select('*')
          .eq('id', connectionData.ai_agent_id)
          .single();

        if (connectionError || !connectionData) {
          return res.status(404).json({
            success: false,
            error: 'Connection not found'
          });
        }

        // Set new Redis data
        await redis.client.set(`agent:${connectionData.ai_agent_id}:settings`, JSON.stringify(connectionAgent)); 

    }

    

    return res.json({
      success: true,
      message: 'Connection data refreshed successfully', 
      connection_id: connectionId
    });

  } catch (error) {
    loggerUtils.error('Error refreshing connection:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to refresh connection: ' + error.message
    });
  }
}; 