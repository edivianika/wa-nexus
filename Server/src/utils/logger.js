import pino from 'pino';
import { promises as fs } from 'fs';
import path from 'path';

// Environment control for logging verbosity
const LOG_VERBOSE = process.env.LOG_VERBOSE === 'true';
// Set default log level to 'error' only
const LOG_LEVEL = process.env.LOG_LEVEL || 'error';

// Buat direktori logs jika belum ada
const logDir = path.join(process.cwd(), 'logs');
(async () => {
  try {
    await fs.access(logDir);
  } catch {
    await fs.mkdir(logDir, { recursive: true });
  }
})();

// Konfigurasi dasar untuk logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info', // Level log default: info
  transport: {
    target: 'pino-pretty', // Membuat output log lebih mudah dibaca
    options: {
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
});

// Inisialisasi logger untuk file
const fileLogger = pino({
  level: process.env.LOG_LEVEL || LOG_LEVEL,
  transport: {
    target: 'pino/file',
    options: {
      destination: path.join(logDir, 'app.log'),
      mkdir: true,
      sync: true
    }
  }
});

// Inisialisasi logger untuk error
const errorLogger = pino({
  level: 'error',
  transport: {
    target: 'pino/file',
    options: {
      destination: path.join(logDir, 'error.log'),
      mkdir: true,
      sync: true
    }
  }
});

// Inisialisasi logger untuk console
const consoleLogger = pino({
  // In production, only show warnings and errors by default
  level: process.env.NODE_ENV === 'development' ? 'info' : (LOG_VERBOSE ? 'info' : 'warn'),
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      levelFirst: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
      messageKey: 'msg'
    }
  }
});

// Child loggers untuk berbagai modul
const whatsappConnectionLogger = fileLogger.child({ module: 'whatsapp' });
const messageProcessorLogger = fileLogger.child({ module: 'message' });
const apiServerLogger = fileLogger.child({ module: 'api' });
const databaseLogger = fileLogger.child({ module: 'database' });
const webhookLogger = fileLogger.child({ module: 'webhook' });
const socketLogger = fileLogger.child({ module: 'socket' });

// Log startup - only if verbose
if (LOG_VERBOSE) {
fileLogger.info({
  module: 'logger',
  event: 'startup',
  logDir,
    logLevel: process.env.LOG_LEVEL || LOG_LEVEL,
  message: 'Logger initialized'
});
}

// Fungsi-fungsi logger
const info = (message, data = {}) => {
  // Skip info logs in non-verbose mode
  if (!LOG_VERBOSE && !fileLogger.isLevelEnabled('info')) return;
  
  const logData = { ...data, msg: message };
  fileLogger.info(logData);
  if (consoleLogger.isLevelEnabled('info')) {
    consoleLogger.info(logData);
  }
};

const error = (message, err, data = {}) => {
  const logData = { ...data, err, msg: message };
  errorLogger.error(logData);
  consoleLogger.error(logData);
};

const warn = (message, data = {}) => {
  const logData = { ...data, msg: message };
  fileLogger.warn(logData);
  consoleLogger.warn(logData);
};

const debug = (message, data = {}) => {
  // Skip debug logs in non-verbose mode
  if (!LOG_VERBOSE && !fileLogger.isLevelEnabled('debug')) return;
  
  const logData = { ...data, msg: message };
  fileLogger.debug(logData);
  if (consoleLogger.isLevelEnabled('debug')) {
      consoleLogger.debug(logData);
  }
};

// Specialized logging methods
const apiRequest = (req, res, responseTime) => {
  // Only log API requests if they're errors or we're in verbose mode
  if (res.statusCode >= 400) {
    warn(`${req.method} ${req.url} ${res.statusCode} ${responseTime}ms`, {
      module: 'api',
      event: 'request',
      method: req.method,
      url: req.url,
      status: res.statusCode,
      responseTime
    });
  } else if (LOG_VERBOSE) {
    info(`${req.method} ${req.url} ${res.statusCode} ${responseTime}ms`, {
      module: 'api',
      event: 'request',
      method: req.method,
      url: req.url,
      status: res.statusCode,
      responseTime
    });
  }
};

const whatsappConnection = (connectionId, event, data = {}) => {
  if (event === 'error' || event === 'disconnected') {
    warn(`WhatsApp Connection: ${event}`, {
      module: 'whatsapp',
      event,
      connectionId,
      ...data
    });
  } else if (LOG_VERBOSE) {
    info(`WhatsApp Connection: ${event}`, {
      module: 'whatsapp',
      event,
      connectionId,
      ...data
    });
  }
};

const messageEvent = (connectionId, event, messageData) => {
  if (event === 'error') {
    warn(`Message: ${event}`, {
      module: 'message',
      event,
      connectionId,
      messageId: messageData?.key?.id,
      from: messageData?.key?.remoteJid,
      type: messageData?.type
    });
  } else if (LOG_VERBOSE) {
    info(`Message: ${event}`, {
      module: 'message',
      event,
      connectionId,
      messageId: messageData?.key?.id,
      from: messageData?.key?.remoteJid,
      type: messageData?.type
    });
  }
};

const socketEvent = (event, data = {}) => {
  if (event === 'error' || event === 'disconnect') {
    warn(`Socket: ${event}`, {
      module: 'socket',
      event,
      ...data
    });
  } else if (LOG_VERBOSE) {
    info(`Socket: ${event}`, {
      module: 'socket',
      event,
      ...data
    });
  }
};

const databaseOperation = (operation, table, data = {}) => {
  // Skip debug logs about DB ops unless in verbose mode 
  if (!LOG_VERBOSE) return;
  
  debug(`Database: ${operation} on ${table}`, {
    module: 'database',
    event: operation,
    table,
    ...data
  });
};

const errorHandler = (err, context = {}) => {
  error(`Error in ${context.module || 'unknown'}`, err, {
    module: context.module || 'unknown',
    event: 'error',
    ...context
  });
};

// Export fungsi-fungsi logger
export const loggerUtils = {
  info,
  error,
  warn,
  debug,
  apiRequest,
  whatsappConnection,
  messageEvent,
  socketEvent,
  databaseOperation,
  errorHandler
};

// Export fungsi-fungsi terpisah untuk backward compatibility
export {
  errorHandler,
  whatsappConnection,
  messageEvent,
  socketEvent,
  databaseOperation,
  // Export child loggers
  whatsappConnectionLogger,
  messageProcessorLogger,
  apiServerLogger,
  databaseLogger,
  webhookLogger,
  socketLogger
}; 