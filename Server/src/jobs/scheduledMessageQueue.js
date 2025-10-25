import { Queue, Worker } from 'bullmq';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

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

const scheduledMessageQueue = new Queue('scheduled-messages', {
  connection,
  ...TTL_CONFIG
});

export { scheduledMessageQueue }; 