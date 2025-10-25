/**
 * Distributed Rate Limiter dengan Redis
 * 
 * Modul ini mengimplementasikan rate limiting terdistribusi menggunakan Redis
 * untuk mencegah overload dan menangani kuota dengan lebih baik.
 */

import Redis from 'ioredis';
import { performance } from 'perf_hooks';

// Inisialisasi Redis client dengan konfigurasi dari environment
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  connectTimeout: 10000,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    return Math.min(times * 200, 3000); // Exponential backoff capped at 3s
  }
});

// Cache untuk rate limit data
const localCache = new Map();
const LOCAL_CACHE_TTL = 5000; // 5 detik

/**
 * Memeriksa apakah suatu key telah mencapai batas rate limit
 * @param {string} key - Key untuk rate limit (connectionId, userId, dll)
 * @param {number} limit - Jumlah maksimum request dalam window
 * @param {number} window - Window waktu dalam milidetik
 * @param {Object} options - Opsi tambahan
 * @returns {Promise<Object>} - Hasil rate limit check
 */
async function checkRateLimit(key, limit, window, options = {}) {
  const now = Date.now();
  const windowKey = `ratelimit:${key}:${Math.floor(now / window)}`;
  const localCacheKey = `${windowKey}:${limit}`;
  
  // Cek cache lokal dulu untuk performa
  if (localCache.has(localCacheKey)) {
    const cachedData = localCache.get(localCacheKey);
    if (now - cachedData.timestamp < LOCAL_CACHE_TTL) {
      // Jika masih dalam TTL dan sudah limited, return dari cache
      if (cachedData.limited) {
        return cachedData;
      }
      // Jika mendekati limit, skip cache untuk akurasi
      if (cachedData.remaining < 5) {
        // Lanjut ke Redis check
      } else {
        // Increment counter lokal dan return
        cachedData.current += 1;
        cachedData.remaining = Math.max(0, limit - cachedData.current);
        cachedData.limited = cachedData.current > limit;
        cachedData.timestamp = now;
        return cachedData;
      }
    }
  }
  
  try {
    // Atomic increment dan expire di Redis
    const results = await redis.multi()
      .incr(windowKey)
      .expire(windowKey, Math.ceil(window / 1000))
      .exec();
    
    if (!results || !results[0] || results[0][0]) {
      throw new Error('Redis error on rate limit check');
    }
    
    const currentCount = results[0][1];
    const isLimited = currentCount > limit;
    
    // Prepare result
    const result = {
      limited: isLimited,
      current: currentCount,
      limit: limit,
      remaining: Math.max(0, limit - currentCount),
      reset: Math.floor(now / window) * window + window,
      window: window,
      key: key,
      timestamp: now
    };
    
    // Update cache lokal
    localCache.set(localCacheKey, result);
    
    return result;
  } catch (error) {
    console.error(`[RateLimiter] Error checking rate limit for ${key}:`, error);
    
    // Fallback ke mode permisif jika Redis error
    return {
      limited: false,
      current: 0,
      limit: limit,
      remaining: limit,
      reset: Math.floor(now / window) * window + window,
      window: window,
      key: key,
      timestamp: now,
      error: error.message
    };
  }
}

/**
 * Middleware Express untuk rate limiting
 * @param {Object} options - Opsi konfigurasi
 * @returns {Function} - Express middleware
 */
function rateLimitMiddleware(options = {}) {
  const {
    keyGenerator = (req) => req.ip,
    limit = 100,
    window = 60000, // 1 menit default
    statusCode = 429,
    message = 'Too Many Requests',
    headers = true
  } = options;
  
  return async (req, res, next) => {
    try {
      const key = typeof keyGenerator === 'function' 
        ? keyGenerator(req) 
        : keyGenerator;
      
      const result = await checkRateLimit(key, limit, window);
      
      // Tambahkan headers
      if (headers) {
        res.setHeader('X-RateLimit-Limit', result.limit);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', Math.floor(result.reset / 1000));
      }
      
      // Tambahkan info rate limit ke request untuk digunakan di route handlers
      req.rateLimit = result;
      
      if (result.limited) {
        return res.status(statusCode).json({
          success: false,
          error: 'Rate Limit Exceeded',
          message: message,
          retryAfter: Math.ceil((result.reset - Date.now()) / 1000)
        });
      }
      
      next();
    } catch (error) {
      console.error('[RateLimiter] Middleware error:', error);
      next(); // Fallback ke permisif jika error
    }
  };
}

/**
 * Fungsi untuk menggunakan rate limiter dalam kode
 * @param {string} key - Key untuk rate limit
 * @param {number} limit - Jumlah maksimum request dalam window
 * @param {number} window - Window waktu dalam milidetik
 * @param {Function} fn - Function yang akan dieksekusi jika tidak rate limited
 * @param {Array} args - Arguments untuk function
 * @returns {Promise<any>} - Hasil eksekusi function atau throw error jika rate limited
 */
async function withRateLimit(key, limit, window, fn, ...args) {
  const startTime = performance.now();
  const result = await checkRateLimit(key, limit, window);
  
  if (result.limited) {
    const error = new Error(`Rate limit exceeded for ${key}`);
    error.name = 'RateLimitError';
    error.rateLimit = result;
    throw error;
  }
  
  try {
    const fnResult = await fn(...args);
    const duration = performance.now() - startTime;
    
    if (duration > 1000) {
      console.warn(`[RateLimiter] Slow execution for ${key}: ${Math.round(duration)}ms`);
    }
    
    return fnResult;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`[RateLimiter] Error for ${key} in ${Math.round(duration)}ms:`, error);
    throw error;
  }
}

/**
 * Membersihkan cache lokal secara periodik
 */
function cleanupLocalCache() {
  const now = Date.now();
  for (const [key, data] of localCache.entries()) {
    if (now - data.timestamp > LOCAL_CACHE_TTL) {
      localCache.delete(key);
    }
  }
}

// Jalankan cleanup setiap 30 detik
setInterval(cleanupLocalCache, 30000);

// Ekspor fungsi-fungsi
export {
  checkRateLimit,
  rateLimitMiddleware,
  withRateLimit,
  redis
}; 