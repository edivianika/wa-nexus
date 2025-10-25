/**
 * Script untuk menambahkan TTL (Time-to-Live) ke semua session WhatsApp di Redis
 * Ini membantu mencegah memory leak dari session tidak aktif yang tidak pernah kadaluarsa
 */
require('dotenv').config();
const redis = require('../src/utils/redis');
const readline = require('readline');

// TTL default dalam detik
const DEFAULT_TTL = 30 * 24 * 60 * 60; // 30 hari

// Session pattern
const SESSION_KEY_PATTERN = 'session:*';

// Buat interface untuk interaksi command line
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function addTTLToSessions(ttl = DEFAULT_TTL, interactive = true) {
  try {
    console.log('Connecting to Redis...');
    
    // Test koneksi Redis
    const pingResult = await redis.ping();
    if (!pingResult) {
      console.error('Tidak dapat terhubung ke Redis.');
      process.exit(1);
    }
    
    console.log(`\nMencari session keys tanpa TTL...`);
    
    // Mendapatkan semua session keys
    const sessionKeys = await redis.keys(SESSION_KEY_PATTERN);
    
    if (!sessionKeys || sessionKeys.length === 0) {
      console.log('Tidak ada session keys ditemukan.');
      await closeAndExit();
      return;
    }
    
    console.log(`\nDitemukan ${sessionKeys.length} session keys.`);
    
    // Filter key tanpa TTL
    const keysWithoutTTL = [];
    for (const key of sessionKeys) {
      const keyTTL = await redis.ttl(key);
      if (keyTTL === -1) {
        keysWithoutTTL.push(key);
      }
    }
    
    console.log(`\nDitemukan ${keysWithoutTTL.length} session keys tanpa TTL (${Math.round((keysWithoutTTL.length / sessionKeys.length) * 100)}% dari total).`);
    
    if (keysWithoutTTL.length === 0) {
      console.log('\nSemua session keys sudah memiliki TTL. Tidak perlu tindakan lebih lanjut.');
      await closeAndExit();
      return;
    }
    
    // Tampilkan beberapa contoh key
    console.log('\nContoh session keys tanpa TTL:');
    keysWithoutTTL.slice(0, 5).forEach(key => console.log(`- ${key}`));
    
    if (keysWithoutTTL.length > 5) {
      console.log(`... dan ${keysWithoutTTL.length - 5} lainnya.`);
    }
    
    console.log(`\nAkan ditambahkan TTL ${formatTTL(ttl)} ke ${keysWithoutTTL.length} session keys.`);
    
    if (interactive) {
      rl.question('\nApakah Anda yakin ingin melanjutkan? (y/n) ', async (answer) => {
        if (answer.toLowerCase() === 'y') {
          await setTTLForKeys(keysWithoutTTL, ttl);
        } else {
          console.log('Operasi dibatalkan.');
          await closeAndExit();
        }
      });
    } else {
      await setTTLForKeys(keysWithoutTTL, ttl);
    }
    
  } catch (error) {
    console.error('Error:', error);
    await closeAndExit();
  }
}

async function setTTLForKeys(keys, ttl) {
  console.log('\nMenambahkan TTL ke session keys...');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      // Tambahkan TTL ke key
      await redis.client.expire(key, ttl);
      successCount++;
      
      // Log progress setiap 10 keys atau di akhir
      if (successCount % 10 === 0 || i === keys.length - 1) {
        console.log(`Progress: ${successCount + errorCount}/${keys.length} (${successCount} berhasil, ${errorCount} gagal)`);
      }
    } catch (error) {
      console.error(`Error setting TTL for key ${key}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\nProses selesai. ${successCount} keys berhasil diperbarui. ${errorCount} keys gagal.`);
  
  console.log('\nSaran untuk session WhatsApp yang lebih baik:');
  console.log('1. Perbarui kode redisAuthState.js untuk menambahkan TTL otomatis saat menyimpan session');
  console.log('2. Jalankan script pembersihan Redis secara berkala');
  console.log('3. Monitor penggunaan memori Redis dengan "monitor-redis-memory.sh"');
  
  await closeAndExit();
}

function formatTTL(ttl) {
  if (ttl < 60) return `${ttl} detik`;
  if (ttl < 3600) return `${Math.floor(ttl / 60)} menit`;
  if (ttl < 86400) return `${Math.floor(ttl / 3600)} jam`;
  return `${Math.floor(ttl / 86400)} hari`;
}

async function closeAndExit() {
  try {
    if (redis.client && typeof redis.client.quit === 'function') {
      await redis.client.quit();
    }
    rl.close();
  } catch (error) {
    console.error('Error saat menutup koneksi Redis:', error);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let ttl = DEFAULT_TTL;
let interactive = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ttl' && args[i + 1]) {
    const ttlValue = parseInt(args[i + 1], 10);
    if (!isNaN(ttlValue)) {
      ttl = ttlValue;
      i++; // Skip the next argument
    }
  } else if (args[i] === '--non-interactive' || args[i] === '-n') {
    interactive = false;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node add-ttl-to-sessions.js [OPTIONS]');
    console.log('');
    console.log('Options:');
    console.log('  --ttl VALUE          Time to live in seconds (default: 30 days)');
    console.log('  --non-interactive    Run without prompting for confirmation');
    console.log('  --help               Show this help message');
    process.exit(0);
  }
}

// Run the script
addTTLToSessions(ttl, interactive); 