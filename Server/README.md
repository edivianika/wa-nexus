# WhatsApp API

WhatsApp API menggunakan Baileys dengan struktur kode berorientasi objek (OOP) untuk kemudahan pengembangan dan pemeliharaan.

## Instalasi

```bash
npm install
```

## Menjalankan Server

```bash
# Mode pengembangan (dengan auto-restart)
npm run dev

# Mode produksi
npm start
```

## Struktur Kode

Kode menggunakan pendekatan object-oriented programming (OOP) dengan struktur sebagai berikut:

```
src/
  ├── classes/
  │   ├── ApiServer.js       # Menangani server HTTP dan endpoint API
  │   ├── ConnectionManager.js   # Mengelola koneksi WhatsApp
  │   ├── MessageProcessor.js    # Memproses pesan dari WhatsApp
  │   └── WhatsAppConnection.js  # Mengelola koneksi WhatsApp individual
  ├── utils/
  │   └── middleware.js      # Middleware Express
  └── index.js               # Entry point
```

## API Endpoints

### QR Code

- **POST /api/qr/request** - Meminta QR Code untuk koneksi (memerlukan autentikasi)
- **GET /api/qr/:connectionId** - Mendapatkan QR Code (tanpa autentikasi, untuk kompatibilitas)

### Koneksi

- **POST /api/connection/create** - Membuat koneksi baru
- **GET /api/connections** - Mendapatkan daftar koneksi
- **GET /api/connections/:connectionId** - Mendapatkan detail koneksi
- **DELETE /api/connection/:connectionId** - Menghapus koneksi
- **POST /api/refreshconnection** - Refresh koneksi
- **POST /api/disconnect** - Memutuskan koneksi WhatsApp
  - Request Body:
    ```json
    {
      "connection_id": "string" // ID koneksi yang akan diputuskan
    }
    ```
  - Response:
    ```json
    {
      "success": true,
      "message": "WhatsApp berhasil disconnect"
    }
    ```
  - Error Response:
    ```json
    {
      "success": false,
      "error": "Error message"
    }
    ```

### Webhook

- **PUT /api/webhook/update** - Mengupdate konfigurasi webhook (memerlukan autentikasi)

### Pesan

- **POST /api/send** - Mengirim pesan (memerlukan autentikasi)

### Agen AI

- **POST /api/connections/:connectionId/agent** - Mengupdate Agen AI

## Autentikasi

Sebagian endpoint memerlukan autentikasi Bearer Token. Token ini dihasilkan saat membuat koneksi baru dan dapat digunakan untuk autentikasi.

## Environment Variables

Buat file `.env` di root proyek dengan konten berikut:

```
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Server Configuration
PORT=3000
HOST=localhost
BASE_URL=http://localhost:3000

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:8080,http://localhost:3000

# Rate Limiter Configuration
API_RATE_LIMIT=100                    # Jumlah maksimum request per window
API_RATE_WINDOW=60000                 # Window waktu dalam milidetik (1 menit)
RATE_LIMIT_WHITELIST=127.0.0.1,::1    # IP yang diizinkan tanpa batasan (comma-separated)
RATE_LIMIT_MESSAGE=Terlalu banyak permintaan, coba lagi nanti
RATE_LIMIT_STATUS_CODE=429            # HTTP status code untuk rate limit exceeded
```

## Versi Legacy

Untuk menggunakan versi lama yang menggunakan struktur kode prosedural:

```bash
# Mode pengembangan versi lama
npm run dev:legacy

# Mode produksi versi lama
npm run start:legacy
```

## Manajemen Database & Migrasi

Proses migrasi database telah dipisahkan dari startup aplikasi untuk meningkatkan kinerja startup dan menghindari operasi database yang tidak perlu setiap kali server dimulai.

### Command yang Tersedia

- **Periksa status migrasi**: Memeriksa apakah semua tabel, kolom, dan fungsi yang dibutuhkan sudah ada di database
  ```bash
  npm run db:check
  ```

- **Jalankan migrasi**: Menerapkan migrasi database jika diperlukan
  ```bash
  npm run db:migrate
  ```

- **Setup database awal**: Menjalankan setup database lengkap untuk instalasi baru
  ```bash
  npm run db:setup
  ```

### Kapan Menjalankan Migrasi?

- **Pertama kali deployment**: Gunakan `npm run db:setup`
- **Setelah update kode**: Gunakan `npm run db:check` untuk memeriksa apakah migrasi diperlukan
- **Jika terdapat perubahan struktur database**: Gunakan `npm run db:migrate`
- **Sebelum deployment**: Untuk memastikan database diperbarui, sertakan dalam script deployment

### Catatan Penting

Perubahan besar: Migrasi database tidak lagi otomatis berjalan saat aplikasi start. Hal ini meningkatkan kecepatan startup dan mencegah operasi database yang tidak perlu.

## Optimasi Redis & Pengelolaan Memori

Aplikasi ini menggunakan Redis untuk caching, antrian BullMQ, dan penyimpanan data sesi WhatsApp. Untuk menjaga penggunaan memori Redis tetap optimal, tersedia beberapa tools:

### Tools Redis

- **Analisis Penggunaan Redis**: Melihat keys yang disimpan, ukuran, dan TTL
  ```bash
  npm run redis:analyze
  ```

- **Membersihkan Redis**: Menghapus data yang sudah tidak digunakan (interactive)
  ```bash
  npm run redis:clean
  ```

- **Pembersihan Otomatis**: Untuk task scheduler/cron
  ```bash
  npm run redis:clean:auto
  ```

### Pengaturan Pembersihan Berkala

Untuk mengatur pembersihan Redis otomatis setiap hari:

```bash
sudo ./scripts/setup-redis-cleaner.sh
```

### Monitor Penggunaan Memori Redis

Pantau penggunaan memori Redis secara real-time:

```bash
./scripts/monitor-redis-memory.sh
```

Opsi yang tersedia:
- `--warning` atau `-w`: Threshold peringatan dalam MB (default: 500)
- `--critical` atau `-c`: Threshold kritis dalam MB (default: 800)
- `--interval` atau `-i`: Interval pemeriksaan dalam detik (default: 3600)

### Kategori Data di Redis

Redis digunakan untuk beberapa tipe data:

1. **Session WhatsApp**: Disimpan dengan awalan `session:`
2. **Connection Info**: Status koneksi dengan awalan `connection:`
3. **BullMQ Queues**: Data antrian dengan awalan `bull:`
4. **Cache**: Data cache berbagai fitur

### Rekomendasi Pengaturan Redis

Pada deployment production, rekomendasikan:

1. Aktifkan `maxmemory` dengan nilai sekitar 80% dari RAM yang dialokasikan
2. Gunakan `maxmemory-policy` `volatile-lru` (hapus keys dengan TTL berdasarkan LRU)
3. Aktifkan persistent storage dengan RDB atau AOF jika diperlukan
4. Pantau penggunaan memori secara berkala

## Dukungan

Jika Anda mengalami masalah, harap buat issue di repositori ini.
