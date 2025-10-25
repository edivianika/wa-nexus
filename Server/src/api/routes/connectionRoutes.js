import express from 'express';
import fs from 'fs';
import path from 'path';
const router = express.Router();
import * as connectionController from '../controllers/connectionController.js';
import { authenticateApiKey } from '../../utils/middleware.js';
import { supabase, supabaseAdmin } from '../../utils/supabaseClient.js';
import { 
  connectWhatsApp, 
  disconnectWhatsApp,
  refreshConnection 
} from '../services/connectionService.js';
import { validate } from '../../utils/validationMiddleware.js';
import { 
  createConnectionSchema, 
  disconnectSchema, 
  connectionIdParamSchema 
} from '../../utils/validationSchemas.js';
import { refreshTriggersCache } from '../controllers/triggerController.js';
import { loggerUtils } from '../../utils/logger.js';

// Middleware to extract user_id from a custom header
const extractUserId = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized', 
      message: "User identification is missing." 
    });
  }
  req.user = { id: userId }; // Attach user object to the request
  next();
};

// Create connection
router.post('/create', validate(createConnectionSchema), connectionController.createConnection);

// Get connections - using extractUserId only (no API key required)
router.get('/', extractUserId, connectionController.getAllConnections);

// Connect WhatsApp
router.post('/:connectionId/connect', authenticateApiKey, validate(connectionIdParamSchema), connectWhatsApp);

// Disconnect WhatsApp
router.post('/:connectionId/disconnect', authenticateApiKey, validate(disconnectSchema), disconnectWhatsApp);

// Refresh connection
router.post('/:connectionId/refresh', authenticateApiKey, validate(connectionIdParamSchema), refreshConnection);

// Get connection status
router.get('/:connectionId/status', authenticateApiKey, validate(connectionIdParamSchema), async (req, res) => {
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

    res.json({
      success: true,
      data: {
        id: connection.id,
        connected: connection.connected,
        status: connection.connected ? 'connected' : 'disconnected',
        lastSeen: connection.lastSeen,
        reconnectAttempts: connection.reconnectAttempts
      }
    });
  } catch (error) {
    loggerUtils.error('Error getting connection status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Refresh triggers
router.post('/:connectionId/triggers/refresh', authenticateApiKey, validate(connectionIdParamSchema), refreshTriggersCache);

// Refresh triggers without authentication (for testing)
router.post('/:connectionId/triggers/refresh-simple', validate(connectionIdParamSchema), refreshTriggersCache);

// Media endpoint untuk melayani file media yang sudah di-download
router.get('/media/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Cari file di semua direktori trigger
    const tempDir = path.join(process.cwd(), 'temp', 'media-cache');
    
    if (!fs.existsSync(tempDir)) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    // Cari file di semua subdirektori trigger
    const triggerDirs = fs.readdirSync(tempDir);
    let filePath = null;
    
    for (const triggerDir of triggerDirs) {
      const fullPath = path.join(tempDir, triggerDir, filename);
      if (fs.existsSync(fullPath)) {
        filePath = fullPath;
        break;
      }
    }
    
    if (!filePath) {
      return res.status(404).json({ error: 'Media file not found' });
    }
    
    // Set appropriate headers
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.pdf': 'application/pdf'
    };
    
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
    // Stream file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    loggerUtils.error('Error serving media file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;