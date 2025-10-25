#!/bin/bash

# Script untuk memperbaiki error pada scheduledMessageWorker.js

echo "=== Memperbaiki error pada scheduledMessageWorker.js ==="

# Direktori saat ini
DIR="$(dirname "$0")/.."
cd "$DIR"

echo "1. Membersihkan cache node_modules..."
rm -rf node_modules/.cache

echo "2. Menginstal dependensi yang diperbarui..."
npm install @supabase/supabase-js@2.39.8

echo "3. Memastikan perubahan kode telah diterapkan..."
# Perubahan kode seharusnya sudah diterapkan melalui edit file

echo "4. Memperbaiki file package-lock.json..."
# Hapus package-lock.json dan buat ulang
rm -f package-lock.json
npm install --package-lock-only

echo "5. Memastikan nodemon berjalan dengan benar..."
# Pastikan nodemon diinstal secara global jika diperlukan
npm install -g nodemon

echo "6. Membuat file test untuk memastikan Supabase berfungsi dengan benar..."
cat > test-supabase.js << 'EOL'
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testSupabase() {
  console.log('Testing Supabase connection...');
  
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
    
    // Test simple query
    const { data, error } = await supabase.from('connections').select('id').limit(1);
    
    if (error) {
      console.error('Error connecting to Supabase:', error);
      return false;
    }
    
    console.log('Successfully connected to Supabase!');
    console.log('Data:', data);
    return true;
  } catch (error) {
    console.error('Error testing Supabase:', error);
    return false;
  }
}

testSupabase().then(success => {
  if (!success) {
    console.log('Please check your Supabase credentials in .env file');
    process.exit(1);
  }
  process.exit(0);
});
EOL

echo "7. Menjalankan test Supabase..."
node test-supabase.js

if [ $? -ne 0 ]; then
  echo "ERROR: Test Supabase gagal. Periksa kredensial Supabase di file .env"
  exit 1
fi

echo "8. Restart layanan..."
echo "   Tekan Ctrl+C untuk menghentikan layanan yang sedang berjalan,"
echo "   lalu jalankan kembali dengan perintah: npm run dev"

echo "=== Selesai ==="
echo "Jika masih mengalami masalah, coba langkah-langkah berikut:"
echo "1. Hapus node_modules dan package-lock.json:"
echo "   rm -rf node_modules package-lock.json"
echo "2. Instal ulang semua dependensi:"
echo "   npm install"
echo "3. Restart aplikasi:"
echo "   npm run dev" 