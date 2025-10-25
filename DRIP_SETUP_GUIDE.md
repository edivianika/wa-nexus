# Panduan Setup dan Perbaikan Sistem DRIP

## Masalah yang Diperbaiki

1. **URL API yang Salah di dripWorker.js**:
   - Error: `Cannot POST /api/sendbroadcast/api/send`
   - Penyebab: Environment variable `SEND_MESSAGE_API_URL` yang salah menyebabkan URL ganda
   - Solusi: Mengubah kode untuk menggunakan `BASE_URL` sebagai base

2. **Function Error di dripRoutes.js**: 
   - Error: `dripQueue.removeJobs is not a function`
   - Penyebab: BullMQ tidak memiliki method `removeJobs`
   - Solusi: Menggunakan `getJobs` dan `remove` untuk setiap job individual

## Konfigurasi .env yang Diperlukan

Pastikan file `.env` di folder Server memiliki konfigurasi berikut:

```
# Environment Configuration untuk Server
# -- APLIKASI --
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# -- SUPABASE --
SUPABASE_URL=https://YOUR_SUPABASE_URL.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY

# -- REDIS --
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# -- URL KONFIGURASI --
# Base URL untuk API - gunakan ini di dripWorker
BASE_URL=http://localhost:3000

# -- STORAGE --
FILE_STORAGE_PATH=./storage
MAX_UPLOAD_SIZE=10
```

## Cara Restart Service

Setelah menerapkan perubahan, restart service dengan:

```bash
# Restart aplikasi
npm run start:server

# Atau untuk development mode
npm run dev
```

## Verifikasi Konfigurasi

1. Pastikan Redis server berjalan
2. Pastikan Supabase credentials sudah benar
3. Pastikan port 3000 tersedia dan tidak digunakan aplikasi lain

## Cara Testing DRIP

1. Buat campaign baru
2. Tambahkan pesan dengan message_order=1
3. Tambahkan subscriber baru
4. Verifikasi di logs bahwa pesan berhasil dijadwalkan dan dikirim

## Troubleshooting

Jika masih mengalami masalah:

1. Periksa log server dengan perhatian khusus pada bagian `[DripWorker]`
2. Verifikasi koneksi Redis berfungsi
3. Periksa konfigurasi BullMQ di file dripQueue.js
4. Pastikan tabel database terkait DRIP (drip_campaigns, drip_messages, drip_subscribers, drip_logs) ada dan terstruktur dengan benar 