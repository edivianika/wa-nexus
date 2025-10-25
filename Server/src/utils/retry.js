import { loggerUtils as logger } from './logger.js';

/**
 * Fungsi utilitas untuk menjalankan sebuah operasi dengan mekanisme coba lagi (retry).
 * @param {Function} fn - Fungsi asynchronous yang akan dijalankan.
 * @param {string} operationName - Nama operasi untuk logging.
 * @param {number} retries - Jumlah maksimum percobaan ulang.
 * @param {number} delay - Jeda waktu awal dalam milidetik.
 * @returns {Promise<any>} - Hasil dari fungsi `fn` jika berhasil.
 * @throws {Error} - Melemparkan error jika semua percobaan gagal.
 */
async function withRetry(fn, operationName = 'unknown operation', retries = 3, delay = 1000) {
  let lastError;

  for (let i = 0; i <= retries; i++) {
    try {
      if (i > 0) {
        logger.warn(`[Retry] Mencoba lagi operasi '${operationName}' (${i}/${retries})...`);
      }
      return await fn();
    } catch (error) {
      lastError = error;
      // Hanya coba lagi jika error terkait jaringan/fetch
      if (error.message.includes('fetch failed') || (error.code && ['ECONNRESET', 'ETIMEDOUT'].includes(error.code))) {
        if (i < retries) {
          const backoffDelay = delay * Math.pow(2, i);
          logger.error(`[Retry] Operasi '${operationName}' gagal: ${error.message}. Akan mencoba lagi dalam ${backoffDelay}ms.`);
          await new Promise(res => setTimeout(res, backoffDelay));
        }
      } else {
        // Jika bukan error jaringan, langsung lempar error tanpa retry
        logger.error(`[Retry] Operasi '${operationName}' gagal dengan error yang tidak dapat di-retry: ${error.message}`);
        throw error;
      }
    }
  }

  logger.error(`[Retry] Operasi '${operationName}' gagal setelah ${retries} kali percobaan.`);
  throw lastError; // Lempar error terakhir setelah semua percobaan gagal
}

export { withRetry }; 