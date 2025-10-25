import 'dotenv/config';
import { ApiServer } from './api/ApiServer.js';
import './jobs/mediaWorker.js';
// Import dan jalankan DRIP worker untuk memastikan sistem DRIP berfungsi
import './jobs/dripWorker.js';
// Import scheduledMessageService untuk memproses pesan terjadwal
import * as scheduledMessageService from './api/services/scheduledMessageService.js';
// Import cronJobs untuk menjalankan penjadwalan lead score
import './jobs/cronJobs.js';
// Import media cache cleanup job
import { initializeMediaCleanup } from './jobs/mediaCacheCleanup.js';
import { fork } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import migrations (tetap diimpor tapi tidak dijalankan otomatis)
import { applyMigrations } from './migrations/run_migrations.js';

// Periksa dan hapus direktori session lama jika masih ada
const sessionDir = path.join(__dirname, '..', 'session');
if (fs.existsSync(sessionDir)) {
  console.log('Menemukan direktori session lama. Redis sekarang digunakan untuk penyimpanan session.');
  console.log('Menghapus direktori session lama...');
  try {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    console.log('Direktori session berhasil dihapus.');
  } catch (error) {
    console.error('Gagal menghapus direktori session:', error);
  }
}

// Import WhatsApp message handler
import whatsappMessageHandler from './utils/whatsappMessageHandler.js';

// Dapatkan host dan port dari environment variable
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

// Buat server
const server = new ApiServer(port, host);

// HAPUS: dripScheduler sudah usang (deprecated)
// fork(path.join(__dirname, 'jobs', 'dripScheduler.js'));

// Mulai server
const startServer = async () => {
  try {
    // Migrasi database tidak lagi dijalankan secara otomatis saat startup
    // Untuk menjalankan migrasi, gunakan: `npm run migrate`
    
    server.start(); 

    console.log(`Server running at http://${host}:${port}/api-documentation.html`); 
    // Tambahkan log bahwa worker DRIP dijalankan
    console.log(`DRIP Worker telah dijalankan dan siap memproses pesan terjadwal.`);
    
    // Log that the Bull MQ Scheduled Message Worker is running
    console.log(`Bull MQ Scheduled Message Worker telah dijalankan dan siap memproses pesan terjadwal.`);
    
    // Proses pesan terjadwal yang tertunda
    try {
      await scheduledMessageService.processPendingMessages();
      console.log('[Server] Pesan terjadwal yang tertunda telah diproses');
    } catch (error) {
      console.error('[Server] Error memproses pesan terjadwal yang tertunda:', error);
    }

    // Start the WhatsApp message handler for broadcast requests
    whatsappMessageHandler.start();
    console.log('[Server] WhatsApp message handler started');
    
    // Initialize media cache cleanup job
    initializeMediaCleanup();
    console.log('[Server] Media cache cleanup job initialized');
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
};

startServer(); 