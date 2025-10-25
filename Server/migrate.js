#!/usr/bin/env node
require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Buat direktori scripts jika belum ada
if (!fs.existsSync('./scripts')) {
  fs.mkdirSync('./scripts');
}

console.log('Menjalankan migrasi get_first_drip_message...');

try {
  // Jalankan npm script
  execSync('npm run migrate', { stdio: 'inherit' });
} catch (error) {
  console.error('Error saat menjalankan migrasi:', error.message);
} 