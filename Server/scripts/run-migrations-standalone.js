/**
 * Script untuk menjalankan migrasi database secara terpisah
 */
require('dotenv').config();
const { applyMigrations } = require('../src/migrations/run_migrations');

async function runMigrations() {
  console.log('Menjalankan migrasi database...');

  try {
    await applyMigrations();
    console.log('\n✅ Migrasi berhasil diterapkan.');
    process.exit(0);
  } catch (error) {
    console.error('Error saat menjalankan migrasi:', error);
    process.exit(1);
  }
}

runMigrations(); 