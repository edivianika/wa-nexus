# Broadcast Module (Tahap 1)

## Deskripsi
Modul ini adalah layanan terpisah (standalone server, port 3004) untuk menangani broadcast WhatsApp secara efisien dan scalable. Modul ini terintegrasi dengan Redis queue dan dapat di-scale secara independen dari server utama.

## Tujuan
- Menghindari beban berat pada server utama saat broadcast.
- Memastikan pengiriman pesan massal tetap terkontrol, terjadwal, dan dapat dimonitor.
- Mendukung pengelolaan kontak dan antrian broadcast secara efisien.

---

## Fitur Tahap 1

### 1. **Queue Management (Manajemen Antrian)**
- Menambah job broadcast ke queue Redis (misal BullMQ)
- Mendukung prioritas job (high/normal/low)
- Penjadwalan broadcast (jadwalkan pengiriman di waktu tertentu)
- Pause/Resume/Cancel job (per batch atau per pesan)
- Monitoring status job (queued, processing, sent, failed, retry, completed)
- Retry otomatis jika gagal (limit & interval)

### 2. **Pengiriman Pesan**
- Kirim ke banyak nomor sekaligus (bulk send)
- Support pesan teks & media (gambar, dokumen, audio, video)
- Personalisasi pesan (template dengan variabel, misal: nama, kode unik)
- Throttling/Rate limit (atur berapa pesan per detik/menit)
- Parallel worker (multi-proses/cluster, tetap throttle per koneksi)
- Pengiriman bertahap (batching)

### 3. **Manajemen Daftar Kontak**
- Import kontak dari file (CSV, Excel)
- Ambil kontak dari database utama
- Validasi nomor WhatsApp aktif (opsional, jika API support)
- Blacklist/Opt-out (jangan kirim ke nomor tertentu)
- Group tagging (broadcast ke grup kontak tertentu)

---

## Arsitektur
- **Express.js** server berjalan di port 3004
- **Redis** sebagai queue & cache
- **BullMQ** (atau Bee-Queue) untuk manajemen job
- **Worker**: proses job dari queue, kirim pesan ke WhatsApp API
- **Database** (opsional, untuk log, kontak, dsb)

---

## Alur Kerja
1. Admin/API mengirim request broadcast ke server broadcast (port 3004)
2. Server broadcast menambah job ke Redis queue
3. Worker mengambil job dari queue, memproses dan mengirim pesan satu per satu (atau batch)
4. Status pengiriman disimpan di Redis/DB, bisa diakses via endpoint monitoring

---

## Endpoint Utama (Tahap 1)
- `POST /broadcast` — submit job broadcast (kontak, pesan, jadwal, dsb)
- `GET /broadcast/:jobId/status` — cek status job
- `GET /broadcast/jobs` — list semua job
- `POST /broadcast/pause/:jobId` — pause job
- `POST /broadcast/resume/:jobId` — resume job
- `POST /broadcast/cancel/:jobId` — cancel job
- `POST /contacts/import` — import kontak (CSV/Excel)
- `GET /contacts` — list kontak

---

## Catatan Pengembangan
- Semua pengiriman pesan dilakukan secara async (tidak blocking)
- Throttle dan retry diatur agar tidak melanggar limit WhatsApp
- Status job dan error dicatat di Redis/DB
- Modul ini dapat di-scale horizontal (beberapa worker)

---

## Next Step
- Implementasi worker & queue dasar
- Integrasi dengan WhatsApp API utama
- Penambahan dashboard monitoring (opsional) 