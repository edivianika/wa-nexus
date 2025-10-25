import cron from 'node-cron';
import { loggerUtils } from '../utils/logger.js';
import leadScoreService from '../api/services/leadScoreService.js';

// Tambahkan penjadwalan untuk menurunkan skor kontak yang tidak aktif
// Jalankan setiap hari pada pukul 00:00
cron.schedule('0 0 * * *', async () => {
  try {
    logger.info('Running job: decrease inactive lead scores');
    const count = await leadScoreService.decreaseInactiveScores();
    logger.info(`Decreased lead scores for ${count} inactive contacts`);
  } catch (error) {
    logger.error('Error decreasing inactive lead scores', { error: error.message });
  }
}); 