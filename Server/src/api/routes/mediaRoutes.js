import express from 'express';
import path from 'path';
import fs from 'fs';
import { loggerUtils } from '../../utils/logger.js';

const router = express.Router();

// MIME type mapping
const mimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/x-m4a',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

/**
 * GET /api/media/:filename
 * Serve media files from temp/media-cache directory
 */
router.get('/api/media/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent path traversal attacks
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }
    
    // Search for file in all trigger directories
    const mediaCacheDir = path.join(process.cwd(), 'temp', 'media-cache');
    
    if (!fs.existsSync(mediaCacheDir)) {
      return res.status(404).json({
        success: false,
        error: 'Media cache directory not found'
      });
    }
    
    // Find file in trigger directories
    let filePath = null;
    const triggerDirs = fs.readdirSync(mediaCacheDir).filter(dir => 
      dir.startsWith('trigger_') && fs.statSync(path.join(mediaCacheDir, dir)).isDirectory()
    );
    
    for (const triggerDir of triggerDirs) {
      const potentialFilePath = path.join(mediaCacheDir, triggerDir, filename);
      if (fs.existsSync(potentialFilePath)) {
        filePath = potentialFilePath;
        break;
      }
    }
    
    if (!filePath) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
    
    // Get file stats
    const fileStats = fs.statSync(filePath);
    
    // Determine MIME type from file extension
    const ext = path.extname(filename).toLowerCase();
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    
    // Set headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', fileStats.size);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Stream file to response
    const fileStream = fs.createReadStream(filePath);
    
    fileStream.on('error', (error) => {
      loggerUtils.error('Error streaming media file:', {
        filename,
        error: error.message
      });
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Error reading file'
        });
      }
    });
    
    fileStream.pipe(res);
    
    loggerUtils.info('Media file served:', {
      filename,
      size: fileStats.size,
      mimeType
    });
    
  } catch (error) {
    loggerUtils.error('Error serving media file:', {
      filename: req.params.filename,
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
