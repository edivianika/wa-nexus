#!/bin/bash

# Script untuk monitoring penggunaan memori Redis dan alert jika melewati batas

# Konfigurasi default
HOST=${REDIS_HOST:-"localhost"}
PORT=${REDIS_PORT:-6379}
PASSWORD=${REDIS_PASSWORD:-""}
WARNING_THRESHOLD=${WARNING_THRESHOLD:-70} # % dari maxmemory
CRITICAL_THRESHOLD=${CRITICAL_THRESHOLD:-85} # % dari maxmemory
CHECK_INTERVAL=${CHECK_INTERVAL:-60} # interval dalam detik
LOG_FILE="redis-memory-monitor.log"

# Fungsi untuk memeriksa dependensi
check_dependencies() {
  if ! command -v redis-cli &> /dev/null; then
    echo "Error: redis-cli tidak ditemukan."
    echo "Silakan install redis-tools:"
    echo "  Ubuntu/Debian: sudo apt-get install redis-tools"
    echo "  macOS: brew install redis"
    exit 1
  fi
  
  if ! command -v bc &> /dev/null; then
    echo "Error: bc tidak ditemukan."
    echo "Silakan install bc:"
    echo "  Ubuntu/Debian: sudo apt-get install bc"
    echo "  macOS: brew install bc"
    exit 1
  fi
}

# Fungsi untuk menampilkan bantuan
show_help() {
  echo "Monitoring Penggunaan Memori Redis"
  echo
  echo "Penggunaan: $0 [OPSI]"
  echo
  echo "Opsi:"
  echo "  -h, --host HOST             Host Redis (default: $HOST)"
  echo "  -p, --port PORT             Port Redis (default: $PORT)"
  echo "  -a, --password PASSWORD     Password Redis (default: empty)"
  echo "  -w, --warning PERCENT       Threshold peringatan (default: $WARNING_THRESHOLD%)"
  echo "  -c, --critical PERCENT      Threshold kritis (default: $CRITICAL_THRESHOLD%)"
  echo "  -i, --interval SECONDS      Interval pemeriksaan (default: $CHECK_INTERVAL detik)"
  echo "  --log FILE                  File log (default: $LOG_FILE)"
  echo "  --once                      Jalankan pemeriksaan sekali saja"
  echo "  --help                      Tampilkan bantuan ini"
  echo
  echo "Contoh:"
  echo "  $0 --host redis.example.com --port 6379 --warning 75 --critical 90"
  echo "  $0 --once"
  echo
}

# Fungsi untuk format bytes menjadi human-readable
format_bytes() {
  local bytes=$1
  
  # Pastikan bytes adalah angka
  if ! [[ "$bytes" =~ ^[0-9]+$ ]]; then
    echo "Unknown"
    return
  fi
  
  if [ $bytes -lt 1024 ]; then
    echo "${bytes}B"
  elif [ $bytes -lt 1048576 ]; then
    echo "$(echo "scale=2; $bytes/1024" | bc)KB"
  elif [ $bytes -lt 1073741824 ]; then
    echo "$(echo "scale=2; $bytes/1048576" | bc)MB"
  else
    echo "$(echo "scale=2; $bytes/1073741824" | bc)GB"
  fi
}

# Fungsi untuk mengirim notifikasi
send_notification() {
  local level=$1
  local message=$2
  
  # Log notifikasi
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" | tee -a $LOG_FILE
  
  # Di sini Anda bisa menambahkan logika untuk mengirim notifikasi
  # misalnya ke email, Slack, atau sistem monitoring lainnya
}

# Fungsi untuk memantau memori Redis
monitor_redis_memory() {
  local once=$1
  
  while true; do
    # Ambil informasi memori Redis
    local auth_option=""
    if [ ! -z "$PASSWORD" ]; then
      auth_option="-a $PASSWORD"
    fi
    
    echo -n "Memeriksa penggunaan memori Redis... "
    
    # Jalankan INFO MEMORY command
    local redis_info=$(redis-cli -h $HOST -p $PORT $auth_option INFO MEMORY 2>/dev/null)
    
    if [ $? -ne 0 ]; then
      echo "GAGAL"
      send_notification "ERROR" "Tidak dapat terhubung ke Redis di $HOST:$PORT"
      
      if [ "$once" = true ]; then
        exit 1
      else
        sleep $CHECK_INTERVAL
        continue
      fi
    fi
    
    echo "OK"
    
    # Parse output untuk nilai yang relevan
    local used_memory=$(echo "$redis_info" | grep "used_memory:" | cut -d ":" -f2 | tr -d '\r' | tr -d ' ')
    local used_memory_rss=$(echo "$redis_info" | grep "used_memory_rss:" | cut -d ":" -f2 | tr -d '\r' | tr -d ' ')
    local used_memory_peak=$(echo "$redis_info" | grep "used_memory_peak:" | cut -d ":" -f2 | tr -d '\r' | tr -d ' ')
    local used_memory_peak_perc=$(echo "$redis_info" | grep "used_memory_peak_perc:" | cut -d ":" -f2 | tr -d '%' | tr -d '\r' | tr -d ' ')
    local maxmemory=$(echo "$redis_info" | grep "maxmemory:" | cut -d ":" -f2 | tr -d '\r' | tr -d ' ')
    local maxmemory_policy=$(echo "$redis_info" | grep "maxmemory_policy:" | cut -d ":" -f2 | tr -d '\r' | tr -d ' ')
    
    # Jika maxmemory = 0, berarti tidak ada batasan
    if [ "$maxmemory" = "0" ]; then
      maxmemory=$(echo "$redis_info" | grep "total_system_memory:" | cut -d ":" -f2 | tr -d '\r' | tr -d ' ')
      if [ -z "$maxmemory" ] || [ "$maxmemory" = "0" ]; then
        # Jika total_system_memory tidak tersedia, gunakan used_memory sebagai referensi
        maxmemory=$used_memory
      fi
    fi
    
    # Konversi ke format human-readable
    local used_memory_human=$(format_bytes "$used_memory")
    local used_memory_rss_human=$(format_bytes "$used_memory_rss")
    local used_memory_peak_human=$(format_bytes "$used_memory_peak")
    local maxmemory_human=$(format_bytes "$maxmemory")
    
    # Hitung persentase penggunaan
    local usage_percent=0
    if [ -n "$maxmemory" ] && [ "$maxmemory" -gt 0 ]; then
      usage_percent=$(echo "scale=2; 100 * $used_memory / $maxmemory" | bc)
    fi
    local usage_percent_rounded=0
    if [ -n "$usage_percent" ]; then
      usage_percent_rounded=$(echo "scale=0; $usage_percent / 1" | bc)
    fi
    
    # Tampilkan informasi
    echo "=== Redis Memory Info ==="
    echo "Host: $HOST:$PORT"
    echo "Used Memory: $used_memory_human"
    echo "Used Memory RSS: $used_memory_rss_human"
    echo "Used Memory Peak: $used_memory_peak_human (${used_memory_peak_perc}%)"
    echo "Max Memory: $maxmemory_human"
    echo "Penggunaan: ${usage_percent}% (${usage_percent_rounded}%)"
    echo "Max Memory Policy: $maxmemory_policy"
    
    # Cek threshold
    if (( $(echo "$usage_percent >= $CRITICAL_THRESHOLD" | bc -l) )); then
      send_notification "KRITIS" "Penggunaan memori Redis mencapai $usage_percent% (threshold: $CRITICAL_THRESHOLD%)"
      echo "Status: KRITIS - Penggunaan memori terlalu tinggi!"
    elif (( $(echo "$usage_percent >= $WARNING_THRESHOLD" | bc -l) )); then
      send_notification "PERINGATAN" "Penggunaan memori Redis mencapai $usage_percent% (threshold: $WARNING_THRESHOLD%)"
      echo "Status: PERINGATAN - Memori hampir penuh"
    else
      echo "Status: OK"
    fi
    
    echo "=======================" 
    
    # Tambahkan rekomendasi jika memori tinggi
    if (( $(echo "$usage_percent >= $WARNING_THRESHOLD" | bc -l) )); then
      echo
      echo "Rekomendasi tindakan:"
      echo "1. Jalankan 'npm run redis:analyze' untuk melihat distribusi keys"
      echo "2. Jalankan 'npm run redis:clean' untuk membersihkan data yang tidak perlu"
      echo "3. Jalankan 'npm run redis:bullmq-config' untuk mengkonfigurasi ulang BullMQ"
      echo "4. Pertimbangkan untuk mengaktifkan maxmemory-policy jika belum (volatile-lru direkomendasikan)"
      echo
    fi
    
    # Jika run sekali, keluar
    if [ "$once" = true ]; then
      break
    fi
    
    # Tampilkan waktu pemeriksaan berikutnya
    echo "Pemeriksaan berikutnya dalam $CHECK_INTERVAL detik..."
    echo
    
    # Tunggu interval
    sleep $CHECK_INTERVAL
  done
}

# Parse argumen
RUN_ONCE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--host)
      HOST="$2"
      shift 2
      ;;
    -p|--port)
      PORT="$2"
      shift 2
      ;;
    -a|--password)
      PASSWORD="$2"
      shift 2
      ;;
    -w|--warning)
      WARNING_THRESHOLD="$2"
      shift 2
      ;;
    -c|--critical)
      CRITICAL_THRESHOLD="$2"
      shift 2
      ;;
    -i|--interval)
      CHECK_INTERVAL="$2"
      shift 2
      ;;
    --log)
      LOG_FILE="$2"
      shift 2
      ;;
    --once)
      RUN_ONCE=true
      shift
      ;;
    --help)
      show_help
      exit 0
      ;;
    *)
      echo "Error: Opsi tidak dikenal: $1"
      show_help
      exit 1
      ;;
  esac
done

# Periksa dependensi
check_dependencies

# Mulai monitoring
monitor_redis_memory $RUN_ONCE 