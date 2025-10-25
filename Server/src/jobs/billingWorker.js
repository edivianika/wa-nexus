/**
 * Worker untuk mengelola job terkait billing
 */

import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { supabase, supabaseAdmin } from '../utils/supabaseClient.js';
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

/**
 * Job untuk mengecek subscription yang akan expired
 * @param {Object} job - Job data
 */
const checkExpiringSubscriptions = async (job) => {
    try {
        logger.info('Checking expiring subscriptions');
        
        // Dapatkan semua subscription yang akan expired dalam 3 hari
        const threeDaysFromNow = new Date();
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
        
        const { data: expiringSubscriptions, error } = await supabaseAdmin
            .from('subscriptions')
            .select('id, user_id, current_period_ends_at, plans(name)')
            .eq('status', 'active')
            .lt('current_period_ends_at', threeDaysFromNow.toISOString())
            .gt('current_period_ends_at', new Date().toISOString());
        
        if (error) {
            throw new Error(`Error fetching expiring subscriptions: ${error.message}`);
        }
        
        // Log jumlah subscription yang akan expired
        logger.info(`Found ${expiringSubscriptions?.length || 0} expiring subscriptions`);
        
        // TODO: Kirim notifikasi ke user
        // Ini bisa diimplementasikan dengan mengirim email atau notifikasi in-app
        
        return { processed: expiringSubscriptions?.length || 0 };
    } catch (error) {
        logger.error('Error checking expiring subscriptions', { error: error.message });
        throw error;
    }
};

/**
 * Job untuk mengecek subscription yang sudah expired
 * @param {Object} job - Job data
 */
const checkExpiredSubscriptions = async (job) => {
    try {
        logger.info('Checking expired subscriptions');
        
        // Dapatkan semua subscription yang sudah expired tapi masih aktif
        const { data: expiredSubscriptions, error } = await supabaseAdmin
            .from('subscriptions')
            .select('id, user_id, current_period_ends_at, plans(name)')
            .eq('status', 'active')
            .lt('current_period_ends_at', new Date().toISOString());
        
        if (error) {
            throw new Error(`Error fetching expired subscriptions: ${error.message}`);
        }
        
        // Log jumlah subscription yang sudah expired
        logger.info(`Found ${expiredSubscriptions?.length || 0} expired subscriptions`);
        
        // Update status subscription menjadi past_due
        for (const subscription of expiredSubscriptions || []) {
            const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update({ status: 'past_due' })
                .eq('id', subscription.id);
            
            if (updateError) {
                logger.error(`Error updating subscription ${subscription.id}`, { error: updateError.message });
                continue;
            }
            
            logger.info(`Updated subscription ${subscription.id} to past_due`);
            
            // TODO: Kirim notifikasi ke user
            // Ini bisa diimplementasikan dengan mengirim email atau notifikasi in-app
        }
        
        return { processed: expiredSubscriptions?.length || 0 };
    } catch (error) {
        logger.error('Error checking expired subscriptions', { error: error.message });
        throw error;
    }
};

/**
 * Job untuk mereset usage counter pada awal periode baru
 * @param {Object} job - Job data
 */
const resetUsageCounters = async (job) => {
    try {
        logger.info('Resetting usage counters for new period');
        
        // Dapatkan periode saat ini (awal bulan)
        const currentPeriod = new Date();
        currentPeriod.setDate(1); // Set ke awal bulan
        currentPeriod.setHours(0, 0, 0, 0);
        
        // Hapus semua usage counter yang periodenya bukan periode saat ini
        const { error } = await supabaseAdmin
            .from('usage_counters')
            .delete()
            .neq('period_starts_at', currentPeriod.toISOString());
        
        if (error) {
            throw new Error(`Error resetting usage counters: ${error.message}`);
        }
        
        logger.info('Usage counters reset successfully');
        
        return { success: true };
    } catch (error) {
        logger.error('Error resetting usage counters', { error: error.message });
        throw error;
    }
};

// Process jobs
const processJob = async (job) => {
    logger.info(`Processing ${job.name} job`, { id: job.id });
    
    switch (job.name) {
        case 'check-expiring-subscriptions':
            return await checkExpiringSubscriptions(job);
        
        case 'check-expired-subscriptions':
            return await checkExpiredSubscriptions(job);
        
        case 'reset-usage-counters':
            return await resetUsageCounters(job);
        
        default:
            throw new Error(`Unknown job name: ${job.name}`);
    }
};

// Create worker
const worker = new Worker('billing-queue', processJob, { connection });

// Handle events
worker.on('completed', (job, result) => {
    logger.info(`Job ${job.id} completed`, { name: job.name, result });
});

worker.on('failed', (job, error) => {
    logger.error(`Job ${job.id} failed`, { name: job.name, error: error.message });
});

logger.info('Billing worker started');

export default worker; 