import { client as redis, ensureConnection } from './redis.js';
import { loggerUtils } from './logger.js';

/**
 * Middleware untuk autentikasi Bearer Token
 * @param {Object} supabase - Instance Supabase
 * @returns {Function} - Express middleware
 */
const authenticateApiKey = (supabase) => {
  
  return async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        error: 'Bearer Token diperlukan' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      // Ensure Redis connection with timeout
      try {
        const connectionPromise = ensureConnection();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
        );
        
        await Promise.race([connectionPromise, timeoutPromise]);
      } catch (connectionError) {
        loggerUtils.error('Redis connection failed:', connectionError);
        // Fallback to database authentication
        console.log('Falling back to database authentication');
      }
      
      // Cek token di Redis terlebih dahulu dengan error handling
      const cacheKey = `auth:${token}`;
      let cachedConnection;
      try {
        const getPromise = redis.get(cacheKey);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis get timeout')), 3000)
        );
        
        cachedConnection = await Promise.race([getPromise, timeoutPromise]);
      } catch (redisError) {
        loggerUtils.error('Redis get error:', redisError);
        // Fallback to database if Redis fails
        cachedConnection = null;
      }
      
      if (cachedConnection) {
        // Gunakan data dari cache (parse JSON string)
        req.connection = JSON.parse(cachedConnection);
        loggerUtils.info('Using cached connection data', {
          connectionId: req.connection.id,
          token: token.substring(0, 10) + '...'
        });
        return next();
      }
      
      // Jika tidak ada di cache, cek di database
      const { data: connection, error } = await supabase
        .from('connections')
        .select('*')
        .eq('api_key', token)
        .maybeSingle();
          
      if (error) {
        loggerUtils.error('Database error during authentication', {
          error,
          token: token.substring(0, 10) + '...'
        });
        return res.status(500).json({ 
          success: false,
          error: 'Terjadi kesalahan saat memeriksa token' 
        });
      }
      
      if (!connection) {
        loggerUtils.warn('Invalid token attempted', {
          token: token.substring(0, 10) + '...'
        });
        return res.status(401).json({ 
          success: false,
          error: 'Token tidak valid' 
        });
      }
      
      // Simpan di cache untuk request berikutnya (TTL 1 jam)
      const cacheResult = await redis.set(cacheKey, JSON.stringify(connection), 'EX', 3600);
      loggerUtils.info('Token cached in Redis', {
        connectionId: connection.id,
        token: token.substring(0, 10) + '...',
        cacheResult
      });
      
      // Tambahkan connection ke request untuk digunakan di endpoint
      req.connection = connection;
      
      next();
    } catch (error) {
      loggerUtils.error('Error during authentication', {
        error: error.message,
        stack: error.stack,
        token: token.substring(0, 10) + '...'
      });
      
      // Tangani kasus jika Redis tidak tersedia
      if (error.code === 'ECONNREFUSED' || error.name === 'NR_CLOSED') {
        // Fallback ke database langsung
        try {
          const { data: connection, error: dbError } = await supabase
            .from('connections')
            .select('*')
            .eq('api_key', token)
            .maybeSingle();

          if (dbError) {
            loggerUtils.error('Database error during fallback authentication', {
              error: dbError,
              token: token.substring(0, 10) + '...'
            });
            return res.status(500).json({ 
              success: false,
              error: 'Terjadi kesalahan saat memeriksa token' 
            });
          }

          if (!connection) {
            loggerUtils.warn('Invalid token attempted during fallback', {
              token: token.substring(0, 10) + '...'
            });
            return res.status(401).json({ 
              success: false,
              error: 'Token tidak valid' 
            });
          }

          req.connection = connection;
          loggerUtils.info('Fallback authentication successful', {
            connectionId: connection.id,
            token: token.substring(0, 10) + '...'
          });
          return next();
        } catch (fallbackError) {
          loggerUtils.error('Fallback authentication error', {
            error: fallbackError.message,
            stack: fallbackError.stack,
            token: token.substring(0, 10) + '...'
          });
        }
      }
      
      res.status(500).json({ 
        success: false,
        error: 'Terjadi kesalahan saat autentikasi' 
      });
    }
  };
};

/**
 * Middleware untuk menangani CORS
 * @param {Object} options - Opsi CORS
 * @returns {Function} - Express middleware
 */
const corsMiddleware = (options = {}) => {
  const defaultOptions = {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-Requested-With', 
      'device_id', 
      'x-api-key',
      'Origin',
      'Accept',
      'Access-Control-Request-Method', 
      'Access-Control-Request-Headers'
    ],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    credentials: true,
    maxAge: 86400
  };

  const finalOptions = { ...defaultOptions, ...options };

  return (req, res, next) => {
    const origin = req.headers.origin;
    
    // Set CORS headers
    if (finalOptions.origin === '*') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (Array.isArray(finalOptions.origin) && origin) {
      // Jika origin ada dalam daftar yang diizinkan atau * diizinkan
      if (finalOptions.origin.includes(origin) || finalOptions.origin.includes('*')) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else {
        // Jika tidak dalam daftar yang diizinkan, gunakan nilai default pertama
        res.setHeader('Access-Control-Allow-Origin', finalOptions.origin[0]);
      }
    }
    
    res.setHeader('Access-Control-Allow-Methods', finalOptions.methods.join(','));
    res.setHeader('Access-Control-Allow-Headers', finalOptions.allowedHeaders.join(','));
    res.setHeader('Access-Control-Expose-Headers', finalOptions.exposedHeaders.join(','));
    
    if (finalOptions.credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    res.setHeader('Access-Control-Max-Age', finalOptions.maxAge.toString());
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    
    next();
  };
};

/**
 * Middleware untuk logging request
 * @returns {Function} - Express middleware
 */
const requestLogger = () => {
  return (req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url} dipanggil dari ${req.ip}`);
    
    // Catat waktu mulai request
    req.startTime = Date.now();
    
    // Override method end untuk mencatat waktu selesai dan status response
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
      res.end = originalEnd;
      res.end(chunk, encoding);
      
      const responseTime = Date.now() - req.startTime;
      console.log(`[${timestamp}] ${req.method} ${req.url} selesai dengan status ${res.statusCode} dalam ${responseTime}ms`);
    };
    
    next();
  };
};

/**
 * Middleware untuk memvalidasi device_id header
 * @returns {Function} - Express middleware
 */
const validateDeviceId = () => {
  return (req, res, next) => {
    // Skip validasi untuk OPTIONS request
    if (req.method === 'OPTIONS') {
      return next();
    }
    
    // Cek apakah endpoint memerlukan device_id
    const requiresDeviceId = ['/api/refreshconnection'].includes(req.path) ||
                           req.path.startsWith('/api/refreshconnection/');
    
    if (requiresDeviceId) {
      // Check both device_id and connection_id headers
      const deviceId = req.headers['device_id'] || req.headers['connection_id'];
      
      if (!deviceId) {
        return res.status(400).json({
          success: false,
          error: 'connection_id header diperlukan dan harus berisi ID koneksi yang valid'
        });
      }
      
      // Tambahkan device_id ke req untuk digunakan di endpoint
      req.deviceId = deviceId;
    }
    
    next();
  };
};

/**
 * Extracts the connection ID from the request headers.
 * It checks for 'connection_id' and 'id' headers.
 * @param {Object} req - The Express request object.
 * @returns {string|null} The connection ID or null if not found.
 */
function getConnectionIdFromRequest(req) {
  return req.headers['connection_id'] || req.headers['id'] || null;
}

/**
 * Utility functions
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export {
  authenticateApiKey,
  corsMiddleware,
  requestLogger,
  validateDeviceId,
  getConnectionIdFromRequest,
  delay
}; 