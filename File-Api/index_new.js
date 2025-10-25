const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { saveFileInfo } = require('./supabase');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Menampilkan halaman pengujian
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-upload.html'));
});

// Menampilkan halaman dokumentasi
app.get('/doc', (req, res) => {
  res.sendFile(path.join(__dirname, 'documentation.html'));
});

// Setup folder untuk upload jika belum ada
const uploadDir = path.join(__dirname, 'Files');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Konfigurasi Multer untuk upload file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'Files/');
  },
  filename: function (req, file, cb) {
    // Ambil agent_id/AgenId dari request
    const agentId = req.body.agent_id || req.body.AgenId || 'unknown';
    // Rename file dengan format: agentId + Nama File
    cb(null, `${agentId}_${file.originalname}`);
  }
});

// Filter file yang diizinkan: pdf, doc, xls, txt
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format file tidak didukung! Hanya pdf, doc, xls, dan txt yang diizinkan.'), false);
  }
};

// Setup multer dengan batas ukuran 5MB
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: fileFilter
});

// Route untuk upload file
app.post('/upload', (req, res) => {
  // Mendukung baik agent_id maupun AgenId untuk kompatibilitas
  const agentId = req.body.agent_id || req.body.AgenId;
  if (!agentId) {
    return res.status(400).json({ 
      success: false, 
      message: 'agent_id atau AgenId harus disertakan dalam request' 
    });
  }
  
  // Mendukung baik user_id maupun UserID untuk kompatibilitas
  const userId = req.body.user_id || req.body.UserID;
  if (!userId) {
    return res.status(400).json({ 
      success: false, 
      message: 'user_id atau UserID harus disertakan dalam request' 
    });
  }
  
  upload.single('file')(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'Ukuran file melebihi batas maksimum 5MB'
        });
      }
      return res.status(400).json({
        success: false,
        message: `Multer error: ${err.message}`
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    // Jika tidak ada file yang diupload
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada file yang diupload'
      });
    }

    // Data file yang diupload
    const fileData = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    };

    // Simpan informasi file ke Supabase
    try {
      const supabaseResult = await saveFileInfo(fileData, agentId, userId);
      
      if (!supabaseResult.success) {
        console.error('Supabase error:', supabaseResult.error);
        
        // Status 200 agar client tahu file berhasil di-upload meskipun gagal disimpan ke Supabase
        return res.status(200).json({
          success: true,
          message: 'File berhasil diupload tetapi gagal menyimpan data ke Supabase',
          file: fileData,
          supabase: { 
            success: false, 
            message: 'Gagal menyimpan data ke Supabase',
            error: supabaseResult.error
          }
        });
      }
      
      // Sukses upload dan simpan ke Supabase
      return res.status(200).json({
        success: true,
        message: 'File berhasil diupload',
        file: fileData,
        supabase: { 
          success: true, 
          message: 'Data berhasil disimpan ke Supabase' 
        }
      });
    } catch (error) {
      console.error('Exception saat menyimpan ke Supabase:', error);
      
      // File berhasil diupload tetapi gagal menyimpan ke Supabase karena exception
      return res.status(200).json({
        success: true,
        message: 'File berhasil diupload tetapi gagal menyimpan data ke Supabase',
        file: fileData,
        supabase: { 
          success: false, 
          message: 'Terjadi kesalahan saat menyimpan data ke Supabase',
          error: error.message
        }
      });
    }
  });
});

// Handle error
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    success: false,
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
}); 