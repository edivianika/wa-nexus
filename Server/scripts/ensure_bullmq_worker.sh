#!/bin/bash

# Warna untuk output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Memastikan Scheduled Message Queue Worker berjalan...${NC}"

# Path untuk file PID
PID_FILE="./.scheduled-queue-worker.pid"

# Cek apakah proses worker sudah berjalan
if [ -f "$PID_FILE" ]; then
  PID=$(cat $PID_FILE)
  if ps -p $PID > /dev/null; then
    echo -e "${GREEN}Worker sudah berjalan dengan PID $PID${NC}"
    exit 0
  else
    echo -e "${YELLOW}Worker dengan PID $PID tidak ditemukan, menjalankan worker baru...${NC}"
    rm -f $PID_FILE
  fi
fi

# Jalankan worker
echo -e "${YELLOW}Menjalankan Scheduled Message Queue Worker...${NC}"

# Pastikan folder logs ada
mkdir -p logs

# Jalankan worker sebagai background process
node src/jobs/scheduledMessageQueueWorker.js > logs/scheduled-queue-worker.log 2>&1 &

# Simpan PID
echo $! > $PID_FILE

echo -e "${GREEN}Worker berhasil dijalankan dengan PID $(cat $PID_FILE)${NC}"
echo -e "${YELLOW}Log tersimpan di logs/scheduled-queue-worker.log${NC}" 