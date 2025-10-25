import { supabase, supabaseAdmin } from '../../utils/supabaseClient.js';
import { getConnectionManager } from '../../utils/connectionManagerSingleton.js';
import { loggerUtils as logger } from '../../utils/logger.js';
import { client as redis } from '../../utils/redis.js';

// Import refreshConnection function
import { refreshConnection } from './connectionService.js';

export const updateWebhook = async (req, res) => {
  try {
    const { url, triggers } = req.body;
    
    // Coba dapatkan connectionId dari berbagai sumber
    let connectionId = req.connection?.id;
    let debugLog = { initialConnectionId: connectionId };
    
    // Jika tidak ada di req.connection, coba dapatkan dari API key
    if (!connectionId && req.headers['authorization']) {
      const apiKey = req.headers['authorization'].replace('Bearer ', '').trim();
      debugLog.apiKey = apiKey;
      
      if (apiKey) {
        // Coba dapatkan dari Redis cache
        connectionId = await redis.get(`api_key:${apiKey}:connection_id`);
        debugLog.fromRedis = connectionId;
        
        // Jika tidak ada di Redis, coba dapatkan dari database
        if (!connectionId) {
          const { data, error } = await supabase
            .from('connections')
            .select('id')
            .eq('api_key', apiKey)
            .maybeSingle();
            
          debugLog.dbResult = data;
          
          if (!error && data && data.id) {
            connectionId = data.id;
            debugLog.fromDb = connectionId;
            // Simpan di Redis untuk penggunaan berikutnya
            await redis.set(`api_key:${apiKey}:connection_id`, connectionId);
          }
        }
      }
    }
    
    debugLog.finalConnectionId = connectionId;
    
    // Validasi connection ID
    if (!connectionId) {
      logger.error('Connection ID tidak tersedia', {
        headers: req.headers,
        connection: req.connection,
        debugLog
      });
      return res.status(400).json({
        success: false,
        error: 'Connection ID tidak tersedia. Pastikan token API valid.',
        debug: debugLog
      });
    }

    logger.info('Attempting to update webhook', {
      connectionId,
      url,
      triggers
    });

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

    logger.info('Updating webhook in database', {
      connectionId,
      webhookConfig
    });

    // Update di database
    const { data: updateData, error: updateError } = await supabase
      .from('connections')
      .update({
        webhook_config: webhookConfig,
        updated_at: new Date().toISOString()
      })
      .eq('id', connectionId)
      .select();

    if (updateError) {
      logger.error('Error update webhook di database', {
        error: updateError,
        connectionId,
        webhookConfig
      });
      return res.status(500).json({
        success: false,
        error: 'Gagal mengupdate webhook di database',
        details: updateError.message
      });
    }

    if (!updateData || updateData.length === 0) {
      logger.error('Tidak ada data yang diupdate', {
        connectionId,
        webhookConfig
      });
      return res.status(404).json({
        success: false,
        error: 'Connection tidak ditemukan',
        details: 'Tidak ada data yang diupdate'
      });
    }

    logger.info('Database update successful', {
      connectionId,
      updateData
    });

    // Refresh koneksi setelah update webhook config
    try {
      // Create a mock request object with the connection_id header
      const mockReq = {
        headers: {
          connection_id: connectionId
        }
      };
      const mockRes = {
        json: (data) => {
          logger.info('Connection refresh response:', data);
        },
        status: (code) => ({
          json: (data) => {
            logger.info('Connection refresh response:', { code, data });
          }
        })
      };

      await refreshConnection(mockReq, mockRes);
      logger.info('Connection refreshed successfully', { connectionId });
    } catch (refreshError) {
      logger.error('Error refreshing connection', {
        error: refreshError,
        connectionId
      });
      // Don't return error here, as the webhook was updated successfully
    }

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
    logger.error('Error update webhook', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: 'Terjadi kesalahan saat mengupdate webhook',
      details: error.message
    });
  }
}; 