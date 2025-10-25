/**
 * Circuit Breaker Pattern Implementation
 * 
 * Modul ini mengimplementasikan Circuit Breaker Pattern untuk mencegah
 * kegagalan sistem secara keseluruhan saat terjadi masalah pada koneksi.
 */

import CircuitBreaker from 'opossum';
import { performance } from 'perf_hooks';

// Cache untuk circuit breakers
const circuitBreakers = new Map();

// Konfigurasi default
const DEFAULT_OPTIONS = {
  timeout: 30000,                // 30 detik timeout
  errorThresholdPercentage: 50,  // 50% error rate untuk membuka circuit
  resetTimeout: 30000,           // 30 detik sebelum mencoba lagi
  rollingCountTimeout: 60000,    // Window waktu untuk menghitung error rate
  rollingCountBuckets: 10,       // Jumlah bucket untuk rolling count
  capacity: 10,                  // Jumlah maksimum permintaan dalam antrian
  errorFilter: (err) => {
    // Filter error tertentu yang tidak dianggap sebagai kegagalan circuit
    return err.name === 'RateLimitError' || err.message.includes('quota');
  }
};

/**
 * Mendapatkan atau membuat circuit breaker untuk service tertentu
 * @param {string} serviceKey - Unique key untuk service (connectionId, endpoint, etc)
 * @param {Function} fn - Function yang akan diproteksi oleh circuit breaker
 * @param {Object} options - Opsi konfigurasi untuk circuit breaker
 * @returns {CircuitBreaker} - Instance circuit breaker
 */
function getBreaker(serviceKey, fn, options = {}) {
  if (!serviceKey) {
    throw new Error('serviceKey diperlukan untuk circuit breaker');
  }

  if (circuitBreakers.has(serviceKey)) {
    return circuitBreakers.get(serviceKey);
  }

  // Gabungkan opsi default dengan opsi yang diberikan
  const breakerOptions = { ...DEFAULT_OPTIONS, ...options };
  
  // Buat circuit breaker baru
  const breaker = new CircuitBreaker(fn, breakerOptions);
  
  // Event listeners untuk logging dan monitoring
  breaker.on('open', () => {
    console.warn(`[CircuitBreaker] Circuit untuk ${serviceKey} TERBUKA - terlalu banyak error`);
  });
  
  breaker.on('halfOpen', () => {
    console.info(`[CircuitBreaker] Circuit untuk ${serviceKey} HALF-OPEN - mencoba kembali`);
  });
  
  breaker.on('close', () => {
    console.info(`[CircuitBreaker] Circuit untuk ${serviceKey} TERTUTUP - kembali normal`);
  });
  
  breaker.on('fallback', (result) => {
    console.info(`[CircuitBreaker] Fallback untuk ${serviceKey} dijalankan`);
  });
  
  breaker.on('timeout', () => {
    console.warn(`[CircuitBreaker] Timeout untuk ${serviceKey}`);
  });
  
  breaker.on('reject', () => {
    console.warn(`[CircuitBreaker] Permintaan ditolak untuk ${serviceKey} - circuit terbuka`);
  });

  // Tambahkan metrics
  breaker.status.on('snapshot', (stats) => {
    // Metrics bisa ditambahkan di sini jika metrics collector tersedia
  });
  
  // Simpan ke cache
  circuitBreakers.set(serviceKey, breaker);
  
  return breaker;
}

/**
 * Eksekusi fungsi dengan circuit breaker
 * @param {string} serviceKey - Unique key untuk service
 * @param {Function} fn - Function yang akan dieksekusi
 * @param {Array} args - Arguments untuk function
 * @param {Function} fallbackFn - Function fallback jika circuit terbuka
 * @param {Object} options - Opsi konfigurasi untuk circuit breaker
 * @returns {Promise<any>} - Hasil eksekusi function
 */
async function executeWithBreaker(serviceKey, fn, args = [], fallbackFn = null, options = {}) {
  const breaker = getBreaker(serviceKey, fn, options);
  
  if (fallbackFn) {
    breaker.fallback(fallbackFn);
  }
  
  const startTime = performance.now();
  try {
    const result = await breaker.fire(...args);
    const duration = performance.now() - startTime;
    
    // Log success metrics
    if (duration > 1000) {
      console.warn(`[CircuitBreaker] Slow execution for ${serviceKey}: ${Math.round(duration)}ms`);
    }
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`[CircuitBreaker] Error for ${serviceKey} in ${Math.round(duration)}ms: ${error.message}`);
    throw error;
  }
}

/**
 * Reset circuit breaker untuk service tertentu
 * @param {string} serviceKey - Unique key untuk service
 */
function resetBreaker(serviceKey) {
  if (circuitBreakers.has(serviceKey)) {
    const breaker = circuitBreakers.get(serviceKey);
    breaker.close(); // Tutup circuit secara manual
    console.info(`[CircuitBreaker] Circuit untuk ${serviceKey} direset manual`);
  }
}

/**
 * Mendapatkan status untuk semua circuit breakers
 * @returns {Object} - Status semua circuit breakers
 */
function getBreakerStats() {
  const stats = {};
  
  for (const [key, breaker] of circuitBreakers.entries()) {
    stats[key] = {
      state: breaker.status.state,
      stats: {
        successes: breaker.status.stats.successes,
        failures: breaker.status.stats.failures,
        rejects: breaker.status.stats.rejects,
        timeouts: breaker.status.stats.timeouts,
        fallbacks: breaker.status.stats.fallbacks
      }
    };
  }
  
  return stats;
}

export {
  getBreaker,
  executeWithBreaker,
  resetBreaker,
  getBreakerStats
}; 