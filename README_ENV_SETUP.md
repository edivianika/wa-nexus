# 🚀 Quick Setup Environment Variables

Panduan cepat untuk mengatur environment variables agar aplikasi WhatsApp AI bisa berjalan di local.

## ⚡ Quick Start

### 1. Jalankan Script Setup Otomatis

```bash
# Jalankan script setup
./setup-env.sh
```

Script ini akan:
- ✅ Membuat file `.env` di semua direktori yang diperlukan
- ✅ Menggunakan konfigurasi default untuk development
- ✅ Mengatur Supabase credentials yang sudah ada

### 2. Install Dependencies

```bash
# Server
cd Server
npm install

# Client-UI  
cd ../Client-UI
npm install

# File-Api (opsional)
cd ../File-Api
npm install
```

### 3. Install & Start Redis

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt install redis-server
sudo systemctl start redis-server
```

**Windows:**
Download dari [Redis for Windows](https://github.com/microsoftarchive/redis/releases)

### 4. Jalankan Aplikasi

```bash
# Terminal 1 - Server
cd Server
npm run dev

# Terminal 2 - Client-UI
cd Client-UI  
npm run dev
```

### 5. Akses Aplikasi

- 🌐 **Frontend**: http://localhost:5173
- 🔧 **Backend API**: http://localhost:3000
- 📚 **API Docs**: http://localhost:3000/api-documentation.html

## 🔧 Manual Setup (Jika Script Gagal)

Jika script otomatis tidak berfungsi, Anda bisa membuat file `.env` secara manual:

### Server/.env
```bash
SUPABASE_URL=https://ovscsiulvdgwamhlkwkq.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92c2NzaXVsdmRnd2FtaGxrd2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NjY4MjEsImV4cCI6MjA1ODE0MjgyMX0.1BpvEPUYrDETlHFomNO8EsZBmoSypu5GEsJwlIfNCxc
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
PORT=3000
HOST=0.0.0.0
BASE_URL=http://localhost:3000
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
ALLOWED_ORIGINS=http://localhost:8080,http://localhost:3000,http://localhost:5173
CORS_ORIGIN=http://localhost:5173
API_RATE_LIMIT=100
API_RATE_WINDOW=60000
LOG_LEVEL=info
LOG_VERBOSE=false
DEBUG_MEDIA_SERVICE=false
MEDIA_CACHE_DIR=./temp/media-cache
METRICS_PORT=9090
BULLMQ_REDIS_HOST=localhost
BULLMQ_REDIS_PORT=6379
BULLMQ_REDIS_PASSWORD=
BULLMQ_REDIS_DB=1
NODE_ENV=development
```

### Client-UI/.env
```bash
VITE_SUPABASE_URL=https://ovscsiulvdgwamhlkwkq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92c2NzaXVsdmRnd2FtaGxrd2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NjY4MjEsImV4cCI6MjA1ODE0MjgyMX0.1BpvEPUYrDETlHFomNO8EsZBmoSypu5GEsJwlIfNCxc
VITE_SOCKET_URL=ws://localhost:3000
VITE_API_URL=http://localhost:3000/api
VITE_NODE_ENV=development
```

### File-Api/.env
```bash
VITE_SUPABASE_URL=https://ovscsiulvdgwamhlkwkq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92c2NzaXVsdmRnd2FtaGxrd2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NjY4MjEsImV4cCI6MjA1ODE0MjgyMX0.1BpvEPUYrDETlHFomNO8EsZBmoSypu5GEsJwlIfNCxc
PORT=3001
NODE_ENV=development
```

## 🐛 Troubleshooting

### Redis Connection Error
```bash
# Test Redis connection
redis-cli ping
# Should return: PONG
```

### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000
# Kill process
kill -9 <PID>
```

### CORS Error
- Pastikan `ALLOWED_ORIGINS` di Server/.env mencakup port frontend (5173)
- Restart server setelah mengubah konfigurasi

### Supabase Connection Error
- Periksa koneksi internet
- Verifikasi SUPABASE_URL dan SUPABASE_ANON_KEY

## 📚 Dokumentasi Lengkap

Untuk informasi lebih detail, lihat:
- 📖 [ENV_SETUP_GUIDE.md](ENV_SETUP_GUIDE.md) - Panduan lengkap
- 📋 [README.md](README.md) - Dokumentasi utama proyek

## 🆘 Butuh Bantuan?

Jika mengalami masalah:
1. Periksa log error di terminal
2. Pastikan semua dependencies terinstall
3. Verifikasi Redis server berjalan
4. Cek konfigurasi environment variables

---

**Happy Coding! 🎉**
