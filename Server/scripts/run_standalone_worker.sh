#!/bin/bash

# Script untuk menjalankan worker standalone tanpa Supabase Realtime

echo "=== Menjalankan Scheduled Message Worker Standalone ==="
echo "Versi ini tidak menggunakan Supabase Realtime untuk menghindari error"

# Direktori saat ini
DIR="$(dirname "$0")/.."
cd "$DIR"

# Pastikan worker standalone ada
if [ ! -f "src/jobs/scheduledMessageWorkerStandalone.js" ]; then
  echo "ERROR: File src/jobs/scheduledMessageWorkerStandalone.js tidak ditemukan"
  exit 1
fi

# Jalankan worker standalone
echo "Menjalankan worker standalone..."
node src/jobs/scheduledMessageWorkerStandalone.js

# Script ini akan terus berjalan sampai dihentikan dengan Ctrl+C 