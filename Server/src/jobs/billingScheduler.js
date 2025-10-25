/**
 * Scheduler untuk menjadwalkan job terkait billing
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import cron from 'node-cron';
import { loggerUtils as logger } from '../utils/logger.js';

// Setup Redis connection
const redisOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
};

const connection = new IORedis(redisOptions);

// Create queue
const billingQueue = new Queue('billing-queue', { connection });

/**
 * Jadwalkan job untuk mengecek subscription yang akan expired
 * Berjalan setiap hari pukul 09:00
 */
cron.schedule('0 9 * * *', async () => {
    try {
        logger.info('Scheduling check-expiring-subscriptions job');
        
        await billingQueue.add('check-expiring-subscriptions', {
            scheduledAt: new Date().toISOString()
        }, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 60000 // 1 menit
            },
            removeOnComplete: true,
            removeOnFail: 100 // Simpan 100 job yang gagal untuk debugging
        });
        
        logger.info('check-expiring-subscriptions job scheduled successfully');
    } catch (error) {
        logger.error('Error scheduling check-expiring-subscriptions job', { error: error.message });
    }
});

/**
 * Jadwalkan job untuk mengecek subscription yang sudah expired
 * Berjalan setiap hari pukul 00:05
 */
cron.schedule('5 0 * * *', async () => {
    try {
        logger.info('Scheduling check-expired-subscriptions job');
        
        await billingQueue.add('check-expired-subscriptions', {
            scheduledAt: new Date().toISOString()
        }, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 60000 // 1 menit
            },
            removeOnComplete: true,
            removeOnFail: 100 // Simpan 100 job yang gagal untuk debugging
        });
        
        logger.info('check-expired-subscriptions job scheduled successfully');
    } catch (error) {
        logger.error('Error scheduling check-expired-subscriptions job', { error: error.message });
    }
});

/**
 * Jadwalkan job untuk mereset usage counter pada awal bulan
 * Berjalan setiap tanggal 1 pukul 00:15
 */
cron.schedule('15 0 1 * *', async () => {
    try {
        logger.info('Scheduling reset-usage-counters job');
        
        await billingQueue.add('reset-usage-counters', {
            scheduledAt: new Date().toISOString()
        }, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 60000 // 1 menit
            },
            removeOnComplete: true,
            removeOnFail: 100 // Simpan 100 job yang gagal untuk debugging
        });
        
        logger.info('reset-usage-counters job scheduled successfully');
    } catch (error) {
        logger.error('Error scheduling reset-usage-counters job', { error: error.message });
    }
});

// Jalankan job saat startup (untuk development)
if (process.env.NODE_ENV === 'development') {
    setTimeout(async () => {
        try {
            logger.info('Running initial billing jobs (development mode)');
            
            // Jalankan job check-expiring-subscriptions
            await billingQueue.add('check-expiring-subscriptions', {
                scheduledAt: new Date().toISOString()
            }, {
                attempts: 3,
                removeOnComplete: true
            });
            
            // Jalankan job check-expired-subscriptions
            await billingQueue.add('check-expired-subscriptions', {
                scheduledAt: new Date().toISOString()
            }, {
                attempts: 3,
                removeOnComplete: true
            });
            
            logger.info('Initial billing jobs scheduled successfully');
        } catch (error) {
            logger.error('Error scheduling initial billing jobs', { error: error.message });
        }
    }, 5000); // Tunggu 5 detik setelah startup
}

logger.info('Billing scheduler started');

export {
    billingQueue
}; 