# Panduan Pengembangan API Upload File

Panduan ini berisi informasi untuk pengembangan aplikasi API upload file.

## Menjalankan Server dalam Mode Pengembangan

API ini menggunakan nodemon untuk memantau perubahan file selama pengembangan. Nodemon akan merestart server secara otomatis setiap kali ada perubahan pada file-file yang dipantau.

### Menjalankan Dengan Nodemon

Beberapa cara untuk menjalankan server dengan nodemon:

1. **Mode Standar**: Restart otomatis saat ada perubahan file
   ```bash
   npm run dev
   ```

2. **Mode Debug**: Menjalankan server dengan opsi inspeksi untuk debugging
   ```bash
   npm run dev:debug
   ```
   Setelah menjalankan perintah ini, Anda dapat membuka Chrome dan mengetikkan `chrome://inspect` untuk mengakses Node.js Debugger.

3. **Mode Konfigurasi**: Menggunakan file konfigurasi nodemon.json khusus
   ```bash
   npm run watch
   ```

### Konfigurasi Nodemon

File `nodemon.json` berisi konfigurasi untuk mengatur perilaku nodemon:

```json
{
  "verbose": true,
  "ignore": ["node_modules/*", "Files/*", ".git/*"],
  "watch": ["*.js", "*.json", ".env"],
  "ext": "js,json,env,html",
  "delay": "500",
  "env": {
    "NODE_ENV": "development"
  }
}
```

- **verbose**: Menampilkan log detail
- **ignore**: Folder/file yang akan diabaikan
- **watch**: Pola file yang akan dipantau
- **ext**: Ekstensi file yang akan dipantau
- **delay**: Waktu tunda sebelum restart (dalam ms)
- **env**: Variabel lingkungan tambahan

## Tips Pengembangan

1. Perubahan pada file JavaScript dan konfigurasi akan secara otomatis merestart server
2. Folder `Files/` (tempat upload) tidak dipantau untuk menghindari restart yang tidak diperlukan
3. Untuk mengubah konfigurasi nodemon, edit file `nodemon.json`
4. Gunakan `npm run dev:debug` untuk debug masalah yang kompleks

## Catatan Penting

- Port server diatur di file `.env` (1212)
- Saat menjalankan server development, akses API melalui `http://localhost:1212`
- Log error akan ditampilkan di konsol 