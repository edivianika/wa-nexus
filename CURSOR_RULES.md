# Cursor Development Rules for WhatsApp App Project

Dokumen ini berisi aturan dan panduan utama untuk pengembangan proyek WhatsApp App menggunakan Cursor. Selalu ikuti aturan ini untuk menjaga konsistensi, keamanan, dan kualitas kode.

---

## 1. Struktur & Referensi Utama
- **Selalu gunakan** `DATABASE_STRUCTURE.md` sebagai referensi utama struktur database.
- Untuk fitur broadcast, **wajib** mengacu pada `BROADCAST_MODULE.md`.
- Jika ada perubahan pada struktur database, **update juga dokumentasi** `.md` terkait.

## 2. Pengelolaan Agent & Connection
- Jika mengambil `agentConfig`, pastikan `agentUrl` dan `settings` diambil dari tabel `ai_agents` berdasarkan `ai_agent_id` dari tabel `connections`.
- Setiap refresh connection, **update juga cache memory** (`configCache`) dan Redis agar selalu sinkron dengan database.
- Jika menemukan bug atau inkonsistensi data antara cache dan database, **dokumentasikan dan diskusikan sebelum deploy**.

## 3. Pengembangan & Testing
- **Jangan mengubah alur utama aplikasi tanpa review dan testing.**
- Tambahkan komentar pada kode yang diubah untuk memudahkan pemeliharaan.
- Pastikan setiap perubahan pada cache, query database, atau endpoint **sudah dites dengan data agent dan webhook yang berubah**.
- Selalu lakukan testing pada:
  - Query database
  - Sinkronisasi cache
  - Endpoint webhook
  - Operasi file
  - Fitur real-time

## 4. Dokumentasi & Maintenance
- **Update dokumentasi** setiap ada perubahan signifikan pada kode, database, atau API.
- Tambahkan komentar pada bagian kode yang kompleks.
- Gunakan penamaan variabel dan fungsi yang jelas dan konsisten.
- Ikuti pola dan struktur kode yang sudah ada.

## 5. Keamanan
- Validasi semua request yang masuk.
- Implementasi autentikasi dan otorisasi yang benar.
- Amankan file upload (cek tipe dan ukuran file).
- Gunakan environment variable untuk data sensitif.
- Terapkan rate limiting pada endpoint penting.
- Enkripsi data sensitif dan amankan akses storage.

## 6. Workflow Pengembangan
- Untuk development, gunakan perintah:
  ```bash
  npm run install:all   # Install semua dependencies
  npm run dev           # Jalankan semua aplikasi secara bersamaan
  ```
- Untuk build production UI:
  ```bash
  npm run build
  ```
- Jalankan aplikasi secara individual jika perlu:
  ```bash
  npm run start:server
  npm run start:client
  npm run start:file-api
  ```

## 7. Troubleshooting
- Jika ada error, cek log masing-masing aplikasi.
- Pastikan port tidak bentrok dan .env sudah benar.
- Dokumentasikan setiap bug dan solusi yang ditemukan.

---

**Selalu diskusikan perubahan besar sebelum merge/deploy.**

_Referensi utama: PROJECT_STRUCTURE.md, DATABASE_STRUCTURE.md, BROADCAST_MODULE.md_ 