# Panduan Setup Environment Variables

File ini berisi panduan lengkap untuk mengatur environment variables agar aplikasi WhatsApp AI bisa berjalan di local.

## Langkah-langkah Setup

### 1. Server (Backend)

Buat file `.env` di direktori `Server/` dengan konten berikut:

```bash
# Supabase Configuration
SUPABASE_URL=https://ovscsiulvdgwamhlkwkq.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92c2NzaXVsdmRnd2FtaGxrd2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NjY4MjEsImV4cCI6MjA1ODE0MjgyMX0.1BpvEPUYrDETlHFomNO8EsZBmoSypu5GEsJwlIfNCxc
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Server Configuration
PORT=3000
HOST=0.0.0.0
BASE_URL=http://localhost:3000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:8080,http://localhost:3000,http://localhost:5173
CORS_ORIGIN=http://localhost:5173

# Rate Limiter Configuration
API_RATE_LIMIT=100
API_RATE_WINDOW=60000
RATE_LIMIT_WHITELIST=127.0.0.1,::1
RATE_LIMIT_MESSAGE=Terlalu banyak permintaan, coba lagi nanti
RATE_LIMIT_STATUS_CODE=429

# Logging Configuration
LOG_LEVEL=info
LOG_VERBOSE=false
DEBUG_MEDIA_SERVICE=false

# Media Cache Configuration
MEDIA_CACHE_DIR=./temp/media-cache

# Metrics Configuration
METRICS_PORT=9090

# BullMQ Configuration
BULLMQ_REDIS_HOST=localhost
BULLMQ_REDIS_PORT=6379
BULLMQ_REDIS_PASSWORD=
BULLMQ_REDIS_DB=1

# Development Configuration
NODE_ENV=development
```

### 2. Client-UI (Frontend)

Buat file `.env` di direktori `Client-UI/` dengan konten berikut:

```bash
# Supabase Configuration untuk Client-UI
VITE_SUPABASE_URL=https://ovscsiulvdgwamhlkwkq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92c2NzaXVsdmRnd2FtaGxrd2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NjY4MjEsImV4cCI6MjA1ODE0MjgyMX0.1BpvEPUYrDETlHFomNO8EsZBmoSypu5GEsJwlIfNCxc

# WebSocket Configuration
VITE_SOCKET_URL=ws://localhost:3000

# API Configuration
VITE_API_URL=http://localhost:3000/api

# Development Configuration
VITE_NODE_ENV=development
```

### 3. File-Api

Buat file `.env` di direktori `File-Api/` dengan konten berikut:

```bash
# Supabase Configuration untuk File-Api
VITE_SUPABASE_URL=https://ovscsiulvdgwamhlkwkq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92c2NzaXVsdmRnd2FtaGxrd2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NjY4MjEsImV4cCI6MjA1ODE0MjgyMX0.1BpvEPUYrDETlHFomNO8EsZBmoSypu5GEsJwlIfNCxc

# Server Configuration
PORT=3001

# Development Configuration
NODE_ENV=development
```

## Prerequisites

Sebelum menjalankan aplikasi, pastikan Anda telah menginstall:

1. **Node.js** (versi 16 atau lebih baru)
2. **Redis Server** - untuk caching dan session management
3. **npm** atau **yarn**

### Install Redis

**macOS (dengan Homebrew):**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

**Windows:**
Download dan install dari [Redis for Windows](https://github.com/microsoftarchive/redis/releases)

## Menjalankan Aplikasi

### 1. Install Dependencies

```bash
# Server
cd Server
npm install

# Client-UI
cd ../Client-UI
npm install

# File-Api
cd ../File-Api
npm install
```

### 2. Jalankan Server

```bash
# Terminal 1 - Server
cd Server
npm run dev

# Terminal 2 - Client-UI
cd Client-UI
npm run dev

# Terminal 3 - File-Api (opsional)
cd File-Api
npm start
```

### 3. Akses Aplikasi

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **File API**: http://localhost:3001
- **API Documentation**: http://localhost:3000/api-documentation.html

## Troubleshooting

### Redis Connection Error
Jika mengalami error koneksi Redis:
1. Pastikan Redis server berjalan: `redis-cli ping`
2. Periksa konfigurasi Redis di file `.env`
3. Restart Redis server

### Supabase Connection Error
Jika mengalami error koneksi Supabase:
1. Periksa SUPABASE_URL dan SUPABASE_ANON_KEY di file `.env`
2. Pastikan koneksi internet stabil
3. Verifikasi project ID Supabase

### CORS Error
Jika mengalami CORS error:
1. Periksa ALLOWED_ORIGINS di file `.env` Server
2. Pastikan port frontend (5173) ada dalam daftar allowed origins
3. Restart server setelah mengubah konfigurasi CORS

### Port Already in Use
Jika port sudah digunakan:
1. Ubah PORT di file `.env`
2. Atau hentikan proses yang menggunakan port tersebut:
   ```bash
   # Cari proses yang menggunakan port
   lsof -i :3000
   # Hentikan proses
   kill -9 <PID>
   ```

## Environment Variables Reference

### Server (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `SUPABASE_URL` | URL Supabase project | Required |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Optional |
| `PORT` | Server port | 3000 |
| `HOST` | Server host | 0.0.0.0 |
| `REDIS_HOST` | Redis host | localhost |
| `REDIS_PORT` | Redis port | 6379 |
| `REDIS_PASSWORD` | Redis password | (empty) |
| `REDIS_DB` | Redis database number | 0 |
| `ALLOWED_ORIGINS` | CORS allowed origins | localhost:5173 |
| `API_RATE_LIMIT` | API rate limit | 100 |
| `LOG_LEVEL` | Logging level | info |

### Client-UI (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Supabase URL for frontend | Required |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key for frontend | Required |
| `VITE_SOCKET_URL` | WebSocket URL | ws://localhost:3000 |
| `VITE_API_URL` | API URL | http://localhost:3000/api |

### File-Api (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Supabase URL | Required |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | Required |
| `PORT` | File API port | 3001 |

## Security Notes

1. **Jangan commit file `.env`** ke repository
2. **Gunakan SUPABASE_SERVICE_ROLE_KEY** hanya di server, jangan di frontend
3. **Batasi ALLOWED_ORIGINS** di production
4. **Gunakan HTTPS** di production
5. **Setel REDIS_PASSWORD** di production

## Production Deployment

Untuk deployment production:

1. Ganti `localhost` dengan domain production
2. Setel `NODE_ENV=production`
3. Gunakan Redis dengan password
4. Setel CORS origins yang tepat
5. Gunakan HTTPS untuk semua koneksi
6. Setel rate limiting yang sesuai dengan kebutuhan

