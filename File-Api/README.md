# API Upload File

API sederhana untuk upload file dengan NodeJS, Express, dan Multer yang terintegrasi dengan Supabase.

## Fitur

1. Upload file (PDF, DOC, XLS, TXT)
2. Maksimal ukuran file 5MB
3. Rename file dengan format: AgenId + Nama File
4. Menyimpan metadata file ke database Supabase
5. Pelacakan pengguna yang mengupload file (UserID)

## Instalasi

```bash
# Clone repository
git clone <repository-url>
cd wafile

# Install dependensi
npm install

# Setup konfigurasi
cp .env.example .env
# Edit file .env dengan kredensial Supabase Anda

# Jalankan server
npm start

# Jalankan server dengan nodemon (mode development)
npm run dev
```

## Penggunaan API

### Upload File

**Endpoint:** `POST /upload`

**Parameter:**
- `file` (Form Data) - File yang akan diupload (PDF, DOC, XLS, TXT)
- `AgenId` (Form Data) - ID Agen untuk penamaan file
- `UserID` (Form Data) - ID Pengguna yang melakukan upload

**Response Sukses:**
```json
{
  "success": true,
  "message": "File berhasil diupload",
  "file": {
    "filename": "AgenId_namafile.ext",
    "originalName": "namafile.ext",
    "size": 12345,
    "mimetype": "application/pdf"
  },
  "supabase": {
    "success": true,
    "message": "Data berhasil disimpan ke Supabase"
  }
}
```

**Response Error:**
```json
{
  "success": false,
  "message": "Pesan error"
}
```

## Contoh Penggunaan dengan cURL

```bash
curl -X POST \
  -F "file=@/path/to/yourfile.pdf" \
  -F "AgenId=AGN123" \
  -F "UserID=USR456" \
  http://localhost:1212/upload
```

## Integrasi Supabase

API ini menggunakan Supabase untuk menyimpan metadata file yang diupload. Data disimpan dalam tabel `uploaded_files` dengan struktur:

- `agen_id` - ID Agen yang mengupload file
- `user_id` - ID Pengguna yang melakukan upload
- `filename` - Nama file yang disimpan di server
- `original_name` - Nama asli file yang diupload
- `mimetype` - Tipe MIME file
- `size` - Ukuran file dalam bytes
- `upload_date` - Tanggal dan waktu upload

## Pengembangan

Untuk pengembangan dan fitur nodemon, lihat [README-dev.md](README-dev.md)

## Catatan

- File yang diupload akan disimpan di folder `Files/`
- Format file yang didukung: PDF, DOC, DOCX, XLS, XLSX, TXT
- Ukuran maksimal file: 5MB 