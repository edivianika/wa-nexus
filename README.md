# WhatsApp Messaging Platform

A comprehensive WhatsApp messaging platform with advanced features for businesses and marketers.

## Features

- **Multiple Device Management**: Connect and manage multiple WhatsApp devices
- **Contact Management**: Organize contacts with labels and groups
- **Broadcasting**: Send messages to multiple contacts at once
- **Drip Campaigns**: Create automated message sequences
- **Scheduled Messages**: Schedule messages for future delivery
- **Kanban Boards**: Manage contacts through a visual workflow
- **Media Management**: Centralized system for storing and reusing media assets

## Media Management System

The platform includes a comprehensive media management system that allows users to:

- Upload and organize images, videos, audio, and documents
- Reuse media across different message types
- Track media usage statistics
- Filter and search media by type, name, and custom tags

### Technical Implementation

The media management system is built on:

- **Supabase Storage**: For secure file storage
- **React Components**: Modular UI for selecting and managing media
- **Asset Tracking**: Database schema for tracking media usage

For detailed implementation information, see [MEDIA_MANAGEMENT_IMPLEMENTATION.md](MEDIA_MANAGEMENT_IMPLEMENTATION.md).

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm or yarn
- Supabase account

### Installation

1. Clone the repository
   ```
   git clone https://github.com/your-org/whatsapp-app.git
   cd whatsapp-app
   ```

2. Install dependencies
   ```
   # Server
   cd Server
   npm install

   # Client
   cd ../Client-UI
   npm install
   ```

3. Configure environment variables
   ```
   cp .env.example .env
   # Edit .env with your Supabase credentials
   ```

4. Run the application
   ```
   # Server
   npm run dev

   # Client (in a separate terminal)
   cd ../Client-UI
   npm run dev
   ```

## Architecture

- **Backend**: Node.js Express server
- **Frontend**: React with TypeScript
- **Database**: PostgreSQL via Supabase
- **Storage**: Supabase Storage
- **Authentication**: Supabase Auth

# WhatsApp API

API untuk berinteraksi dengan WhatsApp Web/Mobile menggunakan library Baileys.

## Fitur

- Multi-device (MD) WhatsApp API
- Dukungan untuk broadcast pesan
- Pengelolaan kontak dan grup
- Pengiriman media, stiker, dan file
- Penjadwalan pesan
- Kampanye drip marketing

## Instalasi

1. Clone repositori
2. Install dependencies: `npm install`
3. Salin `.env.example` ke `.env` dan atur sesuai kebutuhan
4. Jalankan server: `npm start`

## Pengembangan

- `npm run dev`: Mode pengembangan dengan hot reload
- `npm run dev:main`: Menjalankan server utama saja
- `npm run dev:broadcast`: Menjalankan server broadcast
- `npm run dev:worker`: Menjalankan worker broadcast
- `npm run dev:scheduled`: Menjalankan worker penjadwalan

## Manajemen Redis

Redis digunakan untuk menyimpan session WhatsApp, data cache dan antrian tugas. Berikut adalah tools untuk mengoptimalkan penggunaan Redis:

### Analisis Penggunaan Redis

Untuk menganalisis penggunaan Redis, jalankan:

```bash
npm run redis:analyze
```

Ini akan menampilkan:
- Distribusi keys berdasarkan kategori (session, auth, BullMQ, dll)
- Keys tanpa TTL yang berpotensi menyebabkan kebocoran memori
- Total ukuran data Redis
- Rekomendasi untuk optimasi

### Pembersihan Redis

Untuk membersihkan data Redis yang tidak digunakan:

```bash
npm run redis:clean
```

Atau untuk pembersihan otomatis tanpa konfirmasi (misalnya untuk cronjob):

```bash
npm run redis:clean:auto
```

### Menambahkan TTL ke Session

Session WhatsApp disimpan di Redis tanpa TTL secara default. Untuk menambahkan TTL ke semua session:

```bash
npm run redis:add-ttl
```

Opsi tambahan:
- `--ttl <seconds>`: Setel TTL kustom (default: 30 hari)
- `--non-interactive`: Jalankan tanpa konfirmasi interaktif

### Konfigurasi BullMQ

BullMQ digunakan untuk job queue (broadcast, drip campaigns, scheduled messages). Untuk mengkonfigurasi ulang queue dengan TTL yang optimal:

```bash
npm run redis:bullmq-config
```

### Monitoring Penggunaan Redis

Untuk memantau penggunaan memori Redis secara real-time:

```bash
npm run redis:monitor
```

Opsi tambahan:
- `--warning <percent>`: Threshold peringatan (default: 70%)
- `--critical <percent>`: Threshold kritis (default: 85%)
- `--interval <seconds>`: Interval pemeriksaan (default: 60s)
- `--once`: Jalankan pemeriksaan sekali saja

### Setup Pembersihan Otomatis

Untuk mengatur pembersihan Redis otomatis menggunakan cron:

```bash
./scripts/setup-redis-cleaner.sh --daily   # Pembersihan harian (jam 3 pagi)
./scripts/setup-redis-cleaner.sh --weekly   # Pembersihan mingguan (Minggu jam 4 pagi)
./scripts/setup-redis-cleaner.sh --monthly  # Pembersihan bulanan (tanggal 1 jam 2 pagi)
```

## Praktik Terbaik Redis

1. **Tambahkan TTL ke semua keys**: Selalu tambahkan TTL yang sesuai untuk mencegah penumpukan data
2. **Monitor penggunaan memori**: Gunakan `npm run redis:monitor` secara berkala
3. **Bersihkan secara terjadwal**: Setup cronjob untuk membersihkan Redis secara berkala
4. **Konfigurasi maxmemory**: Atur `maxmemory` dan `maxmemory-policy` Redis ke `volatile-lru`
5. **Batasi ukuran cache**: Gunakan LRU cache dengan ukuran maksimum yang masuk akal

## Struktur Proyek

- `/src`: Kode sumber utama
  - `/connections`: Manajemen koneksi WhatsApp
  - `/controllers`: Controller API
  - `/routes`: Routes API
  - `/utils`: Utilitas umum
  - `/broadcast`: Fitur broadcast
  - `/jobs`: Penjadwalan pesan
- `/scripts`: Script utilitas
- `/logs`: File log

## License

MIT 