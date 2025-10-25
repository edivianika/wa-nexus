import { Queue, Worker } from 'bullmq';
import path from 'path';
import dotenv from 'dotenv';
import redisConfig from '../utils/redisConfig.js';
dotenv.config();

/**
 * Antrian pesan drip campaign dengan sistem prioritas
 * 
 * Prioritas:
 * - 1: Prioritas tinggi (misalnya: pesan penting, konfirmasi)
 * - 2: Prioritas normal (default untuk sebagian besar pesan)
 * - 3: Prioritas rendah (misalnya: pesan promosi atau bulk)
 */

// Set up Redis connection
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0')
};

// TTL konfigurasi untuk mencegah memory leak
const TTL_CONFIG = {
  // Berapa lama job disimpan setelah selesai (3 hari)
  removeOnComplete: { 
    age: 3 * 24 * 60 * 60 * 1000, // 3 hari dalam ms
    count: 1000 // Atau batasi jumlah maksimal job
  },
  // Berapa lama job disimpan setelah gagal (7 hari)
  removeOnFail: { 
    age: 7 * 24 * 60 * 60 * 1000, // 7 hari dalam ms
    count: 500 // Atau batasi jumlah maksimal job
  }
};

const dripQueue = new Queue('drip-campaigns', {
  connection,
  ...TTL_CONFIG
});

// Konstanta untuk prioritas pesan
const PRIORITY = {
  HIGH: 1,   // Prioritas tinggi
  NORMAL: 2, // Prioritas normal
  LOW: 3     // Prioritas rendah
};

/**
 * Fungsi helper untuk menambahkan job ke antrian dengan prioritas
 * @param {Object} data - Data job
 * @param {Object} options - Opsi job
 * @param {Number} priority - Prioritas job (1 = tinggi, 3 = rendah)
 */
async function addDripJob(data, options = {}, priority = PRIORITY.NORMAL) {
  // PERBAIKAN: Tambahkan retry dan stabilitas
  const jobId = options.jobId || `drip-${data.subscriberId}-${data.campaignId}-${data.messageOrder}-${Date.now()}`;
  
  try {
    // Cek apakah job dengan ID yang sama sudah ada
    const existingJob = await dripQueue.getJob(jobId);
    if (existingJob) {
      console.log(`Job dengan ID ${jobId} sudah ada, tidak perlu ditambahkan lagi`);
      return existingJob;
    }

    // Tambahkan job baru dengan opsi yang lebih stabil
    return await dripQueue.add('send-drip-message', data, {
      ...options,
      jobId: jobId,
      priority: priority,
      // PERBAIKAN: Selalu tentukan timeout dan attempts
      timeout: options.timeout || 60000,
      attempts: options.attempts || 10,
      // Tambahkan informasi connectionId untuk rate limiting per koneksi
      limiter: {
        groupKey: data.connectionId || 'default',
        max: 10,
        duration: 60000
      }
    });
  } catch (error) {
    // PERBAIKAN: Tangani error dan coba dengan ID alternatif jika duplikat
    if (error.message && error.message.includes('duplicate')) {
      console.log(`Duplikasi job ID ${jobId}, mencoba dengan ID alternatif`);
      const alternativeJobId = `${jobId}-${Math.floor(Math.random() * 10000)}`;
      return await dripQueue.add('send-drip-message', data, {
        ...options,
        jobId: alternativeJobId,
        priority: priority,
        timeout: options.timeout || 60000,
        attempts: options.attempts || 10,
        limiter: {
          groupKey: data.connectionId || 'default',
          max: 10,
          duration: 60000
        }
      });
    }
    throw error;
  }
}

export { 
  dripQueue,
  addDripJob,
  PRIORITY
}; 