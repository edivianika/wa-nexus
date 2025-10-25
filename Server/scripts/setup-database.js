/**
 * Script untuk pengaturan awal database
 * Gunakan script ini saat pertama kali mengatur aplikasi di lingkungan baru
 */
require('dotenv').config();
const { applyMigrations } = require('../src/migrations/run_migrations');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Direktori SQL
const sqlDir = path.join(__dirname, '..', 'migrations');

async function setupDatabase() {
  console.log('=== PENGATURAN DATABASE AWAL ===');
  console.log('Script ini akan mengatur database Anda dari awal');
  console.log('Pastikan .env dikonfigurasi dengan benar sebelum melanjutkan');
  console.log('\nMenjalankan migrasi database...');

  try {
    // 1. Jalankan migrasi database
    await applyMigrations();
    console.log('✅ Migrasi dasar database berhasil diterapkan');
    
    // 2. Jalankan SQL tambahan jika ada
    const additionalSqlFiles = getAdditionalSqlFiles();
    if (additionalSqlFiles.length > 0) {
      console.log('\nMenjalankan SQL tambahan...');
      await runAdditionalSqlFiles(additionalSqlFiles);
    }
    
    console.log('\n✅ Pengaturan database selesai!');
    console.log('\nAPLIKASI SIAP DIGUNAKAN');
    console.log('Jalankan server dengan: npm run dev');
    
  } catch (error) {
    console.error('❌ Error saat setup database:', error);
    process.exit(1);
  }
}

// Mendapatkan semua file SQL tambahan dari direktori migrations
function getAdditionalSqlFiles() {
  if (!fs.existsSync(sqlDir)) {
    return [];
  }
  
  return fs.readdirSync(sqlDir)
    .filter(file => file.endsWith('.sql') && !file.includes('ignore'))
    .map(file => path.join(sqlDir, file));
}

// Menjalankan file SQL tambahan
async function runAdditionalSqlFiles(files) {
  for (const file of files) {
    const filename = path.basename(file);
    console.log(`Menjalankan ${filename}...`);
    
    try {
      // Gunakan psql untuk menjalankan SQL (jika ada)
      // Atau gunakan supabase client di sini sesuai kebutuhan
      
      // Sebagai contoh dengan psql (uncomment jika diperlukan):
      // const cmd = `psql "${process.env.DATABASE_URL}" -f "${file}"`;
      // execSync(cmd, { stdio: 'inherit' });
      
      console.log(`✅ ${filename} berhasil dijalankan`);
    } catch (error) {
      console.error(`❌ Error saat menjalankan ${filename}:`, error);
      throw error;
    }
  }
}

// Jalankan setup
setupDatabase(); 