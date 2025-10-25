/**
 * Script untuk mengkonfigurasi ulang opsi BullMQ
 * agar menambahkan TTL ke semua job data
 */
require('dotenv').config();
const { Queue, Worker } = require('bullmq');
const redis = require('../src/utils/redis');

// Konfigurasi umum untuk semua queue
const DEFAULT_REDIS_CONFIG = {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0,
  }
};

// TTL default dalam detik
const DEFAULT_TTL_CONFIG = {
  // Berapa lama job disimpan setelah selesai (3 hari)
  removeOnComplete: { 
    age: 3 * 24 * 60 * 60 * 1000,
    count: 1000 // Atau batasi jumlah maksimal job
  },
  // Berapa lama job disimpan setelah gagal (7 hari)
  removeOnFail: { 
    age: 7 * 24 * 60 * 60 * 1000,
    count: 500 // Atau batasi jumlah maksimal job
  },
  // Berapa lama job disimpan dalam status delayed setelah TTL berakhir (30 hari)
  stalledInterval: 30 * 24 * 60 * 60 * 1000
};

// Daftar nama queue yang digunakan dalam aplikasi
const QUEUE_NAMES = [
  'drip-campaigns',
  'broadcast',
  'scheduled-messages'
];

/**
 * Mengambil semua job dari queue
 */
async function getAllJobs(queue) {
  try {
    const waitingJobs = await queue.getJobs(['waiting']);
    const activeJobs = await queue.getJobs(['active']);
    const delayedJobs = await queue.getJobs(['delayed']);
    const failedJobs = await queue.getJobs(['failed']);
    const completedJobs = await queue.getJobs(['completed']);
    
    return [
      ...waitingJobs, 
      ...activeJobs, 
      ...delayedJobs, 
      ...failedJobs,
      ...completedJobs
    ];
  } catch (error) {
    console.error(`Error saat mengambil job dari queue ${queue.name}:`, error.message);
    return [];
  }
}

/**
 * Mengkonfigurasi ulang BullMQ queue dan menambahkan TTL
 */
async function configureBullMQQueues() {
  console.log('Mengkonfigurasi ulang BullMQ queues dengan TTL...');
  
  for (const queueName of QUEUE_NAMES) {
    try {
      console.log(`\nPemeriksaan queue: ${queueName}`);
      
      // Ambil queue dengan konfigurasi baru
      const queue = new Queue(queueName, {
        ...DEFAULT_REDIS_CONFIG,
        ...DEFAULT_TTL_CONFIG
      });
      
      // Ambil info queue
      const count = await queue.count();
      const delayedCount = await queue.getDelayedCount();
      const waitingCount = await queue.getWaitingCount();
      const activeCount = await queue.getActiveCount();
      const completedCount = await queue.getCompletedCount();
      const failedCount = await queue.getFailedCount();
      
      console.log(`Queue ${queueName} info:`);
      console.log(`- Total: ${count} jobs`);
      console.log(`- Delayed: ${delayedCount} jobs`);
      console.log(`- Waiting: ${waitingCount} jobs`);
      console.log(`- Active: ${activeCount} jobs`);
      console.log(`- Completed: ${completedCount} jobs`);
      console.log(`- Failed: ${failedCount} jobs`);
      
      // Dapatkan semua job untuk diperiksa
      const jobs = await getAllJobs(queue);
      console.log(`- Jobs ditemukan: ${jobs.length} jobs`);
      
      // Update konfigurasi queue
      console.log(`\nMengupdate konfigurasi queue ${queueName}...`);
      await queue.obliterate({ force: false });
      console.log(`Queue ${queueName} dikonfigurasi ulang dengan TTL.`);
      
      // Tutup koneksi queue
      await queue.close();
    } catch (error) {
      console.error(`Error saat memproses queue ${queueName}:`, error);
    }
  }
  
  console.log('\nProses konfigurasi ulang queue BullMQ selesai.');
}

/**
 * Membersihkan data BullMQ yang sangat lama (lebih dari 30 hari)
 */
async function cleanupOldBullMQJobs() {
  console.log('\nMembersihkan job BullMQ yang sangat lama (>30 hari)...');
  
  // Dapatkan semua key BullMQ
  const bullMQKeys = await redis.keys('bull:*-*');
  
  // Filter key berdasarkan timestamp
  const currentTime = Date.now();
  const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
  let removedCount = 0;
  
  for (const key of bullMQKeys) {
    try {
      // Ambil timestamp dari key (format: bull:<queue>:<jobId>-<timestamp>)
      const match = key.match(/-(\d+)$/);
      if (match) {
        const timestamp = parseInt(match[1], 10);
        // Hapus job yang lebih dari 30 hari
        if ((currentTime - timestamp) > thirtyDaysInMs) {
          await redis.del(key);
          removedCount++;
          
          if (removedCount % 10 === 0) {
            console.log(`Dihapus ${removedCount} job lama...`);
          }
        }
      }
    } catch (error) {
      console.error(`Error saat memproses key ${key}:`, error.message);
    }
  }
  
  console.log(`Selesai membersihkan job lama. Total ${removedCount} job dihapus.`);
}

/**
 * Fungsi utama
 */
async function main() {
  try {
    // Konfigurasi ulang queue BullMQ
    await configureBullMQQueues();
    
    // Bersihkan job lama
    await cleanupOldBullMQJobs();
    
    console.log('\nProses selesai. BullMQ dikonfigurasi ulang dengan TTL.');
    process.exit(0);
  } catch (error) {
    console.error('Error saat menjalankan script:', error);
    process.exit(1);
  }
}

// Jalankan script
main(); 