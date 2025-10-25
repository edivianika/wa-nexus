import express from 'express';
import * as messageController from '../controllers/messageController.js';
import multer from 'multer';
const storage = multer.memoryStorage();
const upload = multer({ storage });
import { authenticateApiKey } from '../../utils/middleware.js';
import { validate } from '../../utils/validationMiddleware.js';
import { sendMessageSchema } from '../../utils/validationSchemas.js';
import { quotaGuard, incrementUsageAfterRequest, addWatermarkIfNeeded } from '../../middleware/quotaGuard.js';

// Log level control
const LOG_LEVEL = process.env.LOG_LEVEL || 'error'; // 'error', 'warn', 'info', 'debug'
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[LOG_LEVEL] || 0;

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

// Middleware untuk menambahkan user ID ke request
const addUserId = (req, res, next) => {
  if (req.connection && req.connection.user_id) {
    req.user = { id: req.connection.user_id };
  }
  next();
};

// Middleware untuk menangani error pada endpoint fallback
const fallbackErrorHandler = (err, req, res, next) => {
  log('[MessageRoutes] Error in fallback handler: ' + err.message, 'error');
  
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(500).json({
    success: false,
    error: `Fallback error: ${err.message}`,
    path: req.path,
    source: 'messageRoutes fallbackErrorHandler'
  });
};

export default function(authMiddleware) {
  const router = express.Router();

  // Endpoint utama untuk kirim pesan
  router.post('/sendbroadcast', 
    authMiddleware, 
    (req, res, next) => {
      if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
        upload.array('files')(req, res, next);
      } else {
        next();
      }
    }, 
    addUserId, 
    quotaGuard('messages_per_period'), 
    incrementUsageAfterRequest,
    messageController.sendMessage
  );

  // Endpoint alternatif untuk kirim pesan (alias, untuk backward compatibility)
  router.post('/messages', 
    authMiddleware, 
    validate(sendMessageSchema), 
    addUserId, 
    quotaGuard('messages_per_period'), 
    incrementUsageAfterRequest,
    messageController.sendMessage
  );
  
  // Endpoint untuk fallback dari whatsappMessageHandler
  router.post('/messages/send', 
    (req, res, next) => {
      try {
        // Jika ini adalah permintaan internal, izinkan tanpa autentikasi
        if (req.headers['x-internal-request'] === 'true') {
          // Log untuk debugging hanya jika level debug
          log(`[MessageRoutes] Internal fallback request for ${req.body.to || 'unknown'}`, 'debug');
          
          // Tambahkan informasi retry jika ada dan level debug
          if (req.headers['x-retry-count'] && CURRENT_LOG_LEVEL >= LOG_LEVELS.debug) {
            log(`[MessageRoutes] Retry attempt: ${req.headers['x-retry-count']}`, 'debug');
          }
          
          next();
        } else {
          // Jika bukan permintaan internal, gunakan autentikasi normal
          log('[MessageRoutes] External request to /messages/send', 'debug');
          authMiddleware(req, res, next);
        }
      } catch (error) {
        log('[MessageRoutes] Error in /messages/send auth middleware: ' + error.message, 'error');
        next(error);
      }
    },
    addUserId,
    messageController.sendMessage,
    fallbackErrorHandler
  );

  // Endpoint efek typing (konsisten dengan dokumentasi)
  router.post('/send-typing', messageController.sendTyping);

  // Endpoint kirim file via URL (multi-file, support API key)
  router.post('/send-files', authMiddleware, addUserId, messageController.sendFiles);

  // Endpoint efek bubble (typing)
  router.post('/sendbubble', messageController.sendBubble);

  return router;
}; 