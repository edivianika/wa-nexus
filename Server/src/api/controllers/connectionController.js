import * as connectionService from '../services/connectionService.js';
import { loggerUtils } from '../../utils/logger.js';

export const createConnection = async (req, res) => {
  try {
    await connectionService.createConnection(req, res);
  } catch (error) {
    loggerUtils.error('Error in createConnection controller:', error);
    res.status(500).json({
      success: false,
      error: 'Gagal membuat koneksi: ' + error.message
    });
  }
};

export const getAllConnections = async (req, res) => {
  await connectionService.getAllConnections(req, res);
};

export const getConnectionDetail = async (req, res) => {
  await connectionService.getConnectionDetail(req, res);
};

export const deleteConnection = async (req, res) => {
  try {
    const { connectionId } = req.params;
    
    if (!connectionId) {
      return res.status(400).json({
        success: false,
        error: 'Connection ID diperlukan'
      });
    }

    loggerUtils.info('Controller: Memulai proses delete connection', { connectionId });
    
    await connectionService.deleteConnection(req, res);
    
  } catch (error) {
    loggerUtils.error('Controller: Error saat delete connection', { 
      error: error.message,
      stack: error.stack 
    });
    
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: 'Gagal menghapus connection: ' + error.message
      });
    }
  }
};

export const disconnectWhatsApp = async (req, res) => {
  try {
    await connectionService.disconnectWhatsApp(req, res);
  } catch (error) {
    loggerUtils.error('Error in disconnectWhatsApp controller:', error);
    res.status(500).json({
      success: false,
      error: 'Gagal disconnect WhatsApp: ' + error.message
    });
  }
}; 