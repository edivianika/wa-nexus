import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './logger.js';

/**
 * Membersihkan file log lama berdasarkan konfigurasi
 * @param {string} logDir - Direktori log
 * @param {number} maxDays - Jumlah hari maksimum untuk menyimpan log
 * @param {number} maxSizeMB - Ukuran maksimum dalam MB untuk direktori log
 */
async function cleanupLogs(logDir, maxDays = 30, maxSizeMB = 1000) {
  try {
    // Dapatkan semua file di direktori log
    const files = await fs.readdir(logDir);
    
    // Filter hanya file log
    const logFiles = files.filter(file => file.endsWith('.log') || file.endsWith('.gz'));
    
    // Hitung total ukuran direktori log
    let totalSize = 0;
    for (const file of logFiles) {
      const stats = await fs.stat(path.join(logDir, file));
      totalSize += stats.size;
    }
    
    // Konversi ke MB
    const totalSizeMB = totalSize / (1024 * 1024);
    
    logger.info('Log cleanup started', {
      module: 'cleanup',
      event: 'start',
      logDir,
      fileCount: logFiles.length,
      totalSizeMB: totalSizeMB.toFixed(2),
      maxSizeMB
    });
    
    // Jika ukuran total melebihi batas, hapus file terlama
    if (totalSizeMB > maxSizeMB) {
      // Urutkan file berdasarkan tanggal modifikasi
      const sortedFiles = await Promise.all(
        logFiles.map(async file => {
          const stats = await fs.stat(path.join(logDir, file));
          return {
            name: file,
            path: path.join(logDir, file),
            mtime: stats.mtime,
            size: stats.size
          };
        })
      );
      
      sortedFiles.sort((a, b) => a.mtime - b.mtime);
      
      // Hapus file terlama sampai ukuran total di bawah batas
      let currentSize = totalSize;
      for (const file of sortedFiles) {
        if (currentSize / (1024 * 1024) <= maxSizeMB * 0.8) break; // Berhenti jika sudah di bawah 80% batas
        
        await fs.unlink(file.path);
        currentSize -= file.size;
        
        logger.info('Deleted old log file', {
          module: 'cleanup',
          event: 'delete',
          file: file.name,
          size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
          reason: 'size_limit'
        });
      }
    }
    
    // Hapus file yang lebih tua dari maxDays
    const now = new Date();
    const maxAge = maxDays * 24 * 60 * 60 * 1000; // Konversi hari ke milidetik
    
    for (const file of logFiles) {
      const filePath = path.join(logDir, file);
      const stats = await fs.stat(filePath);
      const age = now - stats.mtime;
      
      if (age > maxAge) {
        await fs.unlink(filePath);
        
        logger.info('Deleted old log file', {
          module: 'cleanup',
          event: 'delete',
          file,
          age: Math.floor(age / (24 * 60 * 60 * 1000)) + ' days',
          reason: 'age_limit'
        });
      }
    }
    
    logger.info('Log cleanup completed', {
      module: 'cleanup',
      event: 'complete',
      logDir
    });
  } catch (error) {
    logger.error('Error during log cleanup', error, {
      module: 'cleanup',
      event: 'error',
      logDir
    });
  }
}

// Jalankan cleanup jika file dijalankan langsung
if (require.main === module) {
  const logDir = path.join(process.cwd(), 'logs');
  const maxDays = parseInt(process.env.LOG_MAX_DAYS || '30');
  const maxSizeMB = parseInt(process.env.LOG_MAX_SIZE_MB || '1000');
  
  cleanupLogs(logDir, maxDays, maxSizeMB)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}

export { cleanupLogs }; 