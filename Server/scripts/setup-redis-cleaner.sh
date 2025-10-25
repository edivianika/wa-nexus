#!/bin/bash

# Script untuk mengatur pembersihan Redis otomatis menggunakan crontab
# Untuk dijalankan pada server yang menjalankan aplikasi WhatsApp

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$APP_DIR/logs"
CRON_DIR="/tmp/whatsapp_redis_cron"

# Buat direktori untuk log jika belum ada
mkdir -p "$LOG_DIR"

# Buat direktori untuk konfigurasi cron sementara
mkdir -p "$CRON_DIR"

echo "======================================================"
echo "      PENGATURAN PEMBERSIHAN REDIS OTOMATIS"
echo "======================================================"

# Fungsi untuk menampilkan bantuan
show_help() {
  echo
  echo "Penggunaan: $0 [opsi]"
  echo
  echo "Opsi:"
  echo "  --daily      Setup pembersihan Redis harian (jam 3 pagi)"
  echo "  --weekly     Setup pembersihan Redis mingguan (Minggu jam 4 pagi)"
  echo "  --monthly    Setup pembersihan Redis bulanan (tanggal 1 jam 2 pagi)"
  echo "  --remove     Hapus semua jadwal pembersihan Redis"
  echo "  --status     Tampilkan status jadwal pembersihan Redis"
  echo "  --help       Tampilkan bantuan ini"
  echo
}

# Fungsi untuk memeriksa apakah cron sudah diatur
check_cron_exists() {
  crontab -l 2>/dev/null | grep -q "clean-redis.js" 
  return $?
}

# Fungsi untuk menampilkan status cron
show_cron_status() {
  echo "Status pembersihan Redis otomatis:"
  if check_cron_exists; then
    echo "✅ Pembersihan Redis otomatis sudah diatur"
    echo "Jadwal saat ini:"
    crontab -l | grep "clean-redis.js" | sed 's/^/  /'
  else
    echo "❌ Pembersihan Redis otomatis belum diatur"
  fi
}

# Fungsi untuk menghapus cron
remove_cron() {
  if check_cron_exists; then
    crontab -l 2>/dev/null | grep -v "clean-redis.js" > "$CRON_DIR/crontab.tmp"
    crontab "$CRON_DIR/crontab.tmp"
    echo "✅ Pembersihan Redis otomatis berhasil dihapus"
  else
    echo "ℹ️ Tidak ada jadwal pembersihan Redis yang perlu dihapus"
  fi
}

# Fungsi untuk menambahkan cron
add_cron() {
  local schedule="$1"
  local description="$2"
  
  # Hapus jadwal yang sudah ada terlebih dahulu
  if check_cron_exists; then
    crontab -l 2>/dev/null | grep -v "clean-redis.js" > "$CRON_DIR/crontab.tmp"
  else
    touch "$CRON_DIR/crontab.tmp"
  fi
  
  # Tambahkan jadwal baru
  echo "$schedule cd $APP_DIR && node clean-redis.js --non-interactive >> $LOG_DIR/redis-cleaner.log 2>&1" >> "$CRON_DIR/crontab.tmp"
  echo "$schedule cd $APP_DIR && node scripts/bullmq-config.js >> $LOG_DIR/redis-bullmq-config.log 2>&1" >> "$CRON_DIR/crontab.tmp"
  echo "$schedule cd $APP_DIR && node scripts/add-ttl-to-sessions.js --non-interactive >> $LOG_DIR/redis-add-ttl.log 2>&1" >> "$CRON_DIR/crontab.tmp"
  
  # Aktifkan crontab baru
  crontab "$CRON_DIR/crontab.tmp"
  
  echo "✅ Pembersihan Redis otomatis ($description) berhasil diatur"
}

# Proses opsi command line
case "$1" in
  --daily)
    # Jalankan setiap hari jam 3 pagi
    add_cron "0 3 * * *" "harian"
    ;;
  --weekly)
    # Jalankan setiap hari Minggu jam 4 pagi
    add_cron "0 4 * * 0" "mingguan"
    ;;
  --monthly)
    # Jalankan setiap tanggal 1 jam 2 pagi
    add_cron "0 2 1 * *" "bulanan"
    ;;
  --remove)
    remove_cron
    ;;
  --status)
    show_cron_status
    ;;
  --help|*)
    show_help
    ;;
esac

# Bersihkan direktori sementara
rm -f "$CRON_DIR/crontab.tmp"

echo
echo "Untuk memonitor penggunaan Redis, jalankan:"
echo "  npm run redis:monitor"
echo
echo "Untuk analisis manual penggunaan Redis, jalankan:"
echo "  npm run redis:analyze"
echo 