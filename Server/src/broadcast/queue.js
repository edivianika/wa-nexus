import { Queue, Worker } from 'bullmq';
import dotenv from 'dotenv';
dotenv.config();

// Set up Redis connection
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
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

// Set up broadcast queue
const broadcastQueue = new Queue('broadcast', { 
  connection,
  ...TTL_CONFIG
});

export { broadcastQueue }; 