/**
 * Konfigurasi Performa untuk WhatsApp Connection
 * File ini mengatur parameter performa untuk koneksi WhatsApp
 */

// Load environment variables
import 'dotenv/config';

export default {
  // Timeout settings
  CONNECTION_TIMEOUT: parseInt(process.env.CONNECTION_TIMEOUT || '10000'), // 10 detik
  HTTP_TIMEOUT: parseInt(process.env.HTTP_TIMEOUT || '30000'), // 30 detik
  REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT || '15000'), // 15 detik
  
  // Retry settings
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '5'), // 5 kali retry
  RETRY_DELAY_BASE: parseInt(process.env.RETRY_DELAY_BASE || '1000'), // 1 detik base
  RETRY_JITTER_MAX: parseInt(process.env.RETRY_JITTER_MAX || '1000'), // 1 detik jitter maksimum
  
  // Cache settings
  CONNECTION_CACHE_TTL: parseInt(process.env.CONNECTION_CACHE_TTL || '3600'), // 1 jam
  DEDUP_LOCK_TTL: parseInt(process.env.DEDUP_LOCK_TTL || '300'), // 5 menit
  DEDUP_SENT_TTL: parseInt(process.env.DEDUP_SENT_TTL || '86400'), // 24 jam
  DEDUP_MEMORY_TTL: parseInt(process.env.DEDUP_MEMORY_TTL || '60000'), // 1 menit
  DEDUP_LOCK_WAIT: parseInt(process.env.DEDUP_LOCK_WAIT || '2000'), // 2 detik
  
  // Rate limiting
  MAX_PENDING_REQUESTS: parseInt(process.env.MAX_PENDING_REQUESTS || '100'), // Maksimum 100 request tertunda
  CONNECTION_FAILURE_TTL: parseInt(process.env.CONNECTION_FAILURE_TTL || '60000'), // 60 detik cooldown
  
  // Debug settings
  DEBUG_DRIP_WORKER: process.env.DEBUG_DRIP_WORKER === 'true',
  DEBUG_MEDIA_SERVICE: process.env.DEBUG_MEDIA_SERVICE === 'true',
  LOG_LEVEL: process.env.LOG_LEVEL || 'error', // 'error', 'warn', 'info', 'debug'
}; 