const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { saveFileInfo, getFilesByUserId, getFilesByAgentId, getFiles, deleteFileById, deleteFilesByUserId, deleteFilesByAgentId, supabase, upsertContact } = require('./supabase');
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

// Menampilkan halaman form test langsung
app.get('/form-test', (req, res) => {
  res.sendFile(path.join(__dirname, 'form-test.html'));
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
    // Untuk multer dengan multipart/form-data, kita simpan dengan timestamp
    const timestamp = Date.now();
    cb(null, `temp_${timestamp}_${file.originalname}`);
  }
});

// Filter file yang diizinkan: pdf, doc, xls, txt, csv, docx, json, epub
const fileFilter = (req, file, cb) => {
  // Daftar MIME type yang diizinkan
  const allowedMimeTypes = [
    'application/pdf',                                                 // PDF
    'application/msword',                                              // DOC
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/vnd.ms-excel',                                        // XLS
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
    'text/plain',                                                      // TXT
    'text/csv',                                                        // CSV
    'application/json',                                                // JSON
    'application/epub+zip'                                             // EPUB
  ];
  
  // Daftar ekstensi yang diizinkan
  const allowedExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv', '.json', '.epub'];
  
  // Dapatkan ekstensi file dari nama file
  const originalName = file.originalname.toLowerCase();
  const ext = path.extname(originalName);
  
  console.log(`Memeriksa file: ${originalName}, MIME: ${file.mimetype}, Ekstensi: ${ext}`);
  
  // Pengecekan MIME type dan ekstensi file
  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    // File diterima
    cb(null, true);
  } else {
    // File ditolak
    const errorMsg = `Format file tidak didukung! Hanya PDF, DOC, DOCX, XLS, XLSX, TXT, CSV, JSON, dan EPUB yang diizinkan. Anda mengupload file dengan MIME type: ${file.mimetype} dan ekstensi: ${ext}`;
    console.error(errorMsg);
    cb(new Error(errorMsg), false);
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

// Konfigurasi Multer untuk upload internal (simpan di memori)
const internalUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024 // Batas lebih besar untuk internal, misal 25MB
  }
});

// Route untuk upload file
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    // Jika tidak ada file yang diupload
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada file yang diupload'
      });
    }
    
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

    // Data file yang diupload
    const fileData = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    };

    // Simpan informasi file ke Supabase
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
    
    // Panggil webhook jika diatur di .env
    let webhookResult = null;
    
    // Log sederhana tentang status UPLOAD_WEBHOOK
    console.log(`\n=== WEBHOOK INFO ===`);
    console.log(`URL Webhook: ${process.env.UPLOAD_WEBHOOK || 'Tidak dikonfigurasi'}`);
    
    if (process.env.UPLOAD_WEBHOOK) {
      try {
        // Buat URL download file
        const fileId = supabaseResult.data?.id || 'unknown';
        const fileDownloadUrl = `${req.protocol}://${req.get('host')}/download`;
        
        // Baca file untuk dikirim sebagai binary
        const filePath = path.join(__dirname, `Files/${fileData.filename}`);
        const fileBuffer = fs.readFileSync(filePath);
        
        // Log singkat tentang data yang dikirim
        console.log(`Mengirim file: ${fileData.originalName} (${fileBuffer.length} bytes)`);
        console.log(`- Agent ID: ${agentId}`);
        console.log(`- File ID: ${fileId}`);
        
        // Buat headers yang akan dikirim
        const webhookHeaders = {
          'Content-Type': fileData.mimetype,
          'agent-id': agentId,
          'file-id': fileId,
          'filename': fileData.originalName,  // Hanya gunakan satu header untuk filename
          'file-download-url': fileDownloadUrl
        };
        
        // Log detail headers untuk debug
        console.log('Headers webhook yang akan dikirim:');
        for (const [key, value] of Object.entries(webhookHeaders)) {
          console.log(`  ${key}: ${value}`);
        }
        
        // Tambahkan nama file asli ke URL sebagai parameter query
        const webhookURL = `${process.env.UPLOAD_WEBHOOK}?filename=${encodeURIComponent(fileData.originalName)}`;
        console.log(`URL webhook dengan parameter: ${webhookURL}`);
        
        /* 
        // Opsi lain: FormData tidak tersedia secara native di Node.js
        // Memerlukan package tambahan seperti 'form-data'
        // Jika ingin mencoba pendekatan ini, install dahulu:
        // npm install form-data
        */
        
        // Pendekatan Binary: Gunakan file binary langsung
        const webhookResponse = await axios.post(webhookURL, fileBuffer, {
          headers: webhookHeaders
        });
        
        // Log singkat tentang response webhook
        console.log(`Webhook berhasil dipanggil - Status: ${webhookResponse.status}`);
        
        webhookResult = {
          success: true,
          status: webhookResponse.status,
          message: 'Webhook berhasil dipanggil'
        };
      } catch (webhookError) {
        // Log error sederhana
        console.log(`Webhook gagal: ${webhookError.message || 'Error tidak diketahui'}`);
        if (webhookError.code) {
          console.log(`Kode error: ${webhookError.code}`);
        }
        
        webhookResult = {
          success: false,
          message: 'Gagal memanggil webhook',
          error: webhookError.message
        };
      }
      console.log(`=== AKHIR WEBHOOK ===\n`);
    }
    
    // Sukses upload dan simpan ke Supabase
    return res.status(200).json({
      success: true,
      message: 'File berhasil diupload',
      file: fileData,
      supabase: { 
        success: true, 
        message: 'Data berhasil disimpan ke Supabase' 
      },
      webhook: webhookResult
    });
  } catch (error) {
    console.error('Exception saat upload:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengupload file',
      error: error.message
    });
  }
});

// Endpoint BARU untuk upload internal dari server lain
app.post('/internal/upload', internalUpload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Tidak ada file yang di-upload.' });
  }

  try {
    const file = req.file;
    const originalName = file.originalname;
    const fileBuffer = file.buffer;
    const mimetype = file.mimetype;

    // Buat nama file unik untuk Supabase
    const fileName = `media/${Date.now()}-${originalName.replace(/\s/g, '_')}`;

    const { data, error } = await supabase.storage
      .from('files')
      .upload(fileName, fileBuffer, {
        contentType: mimetype,
        upsert: true,
      });

    if (error) {
      console.error('Supabase Storage Error:', error);
      throw new Error('Gagal mengunggah file ke Supabase Storage.');
    }

    // Dapatkan URL publik dari file yang baru diunggah
    const { data: publicUrlData } = supabase.storage
      .from('files')
      .getPublicUrl(fileName);
      
    if (!publicUrlData || !publicUrlData.publicUrl) {
        throw new Error('Gagal mendapatkan URL publik dari Supabase.');
    }

    const publicUrl = publicUrlData.publicUrl;

    // console.log(`[File-Api] File berhasil diunggah ke Supabase: ${publicUrl}`);

    res.status(200).json({
      success: true,
      message: 'File berhasil diunggah ke Supabase Storage.',
      url: publicUrl,
      path: data.path,
    });

  } catch (error) {
    console.error('[File-Api] Internal Upload Exception:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Terjadi kesalahan internal saat mengunggah file.',
    });
  }
});

// Route untuk get files berdasarkan parameter
app.get('/files', async (req, res) => {
  try {
    // Mengambil parameter dari header daripada dari query
    const userId = req.headers['user-id'];
    const agentId = req.headers['agent-id'];
    
    let result;
    
    if (userId) {
      console.log(`Mengambil file untuk user_id: ${userId}`);
      result = await getFilesByUserId(userId);
    } else if (agentId) {
      console.log(`Mengambil file untuk agent_id: ${agentId}`);
      result = await getFilesByAgentId(agentId);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Header user-id atau agent-id harus disediakan'
      });
    }
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Gagal mengambil data file',
        error: result.error
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Data file berhasil diambil',
      files: result.data
    });
  } catch (error) {
    console.error('Exception:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil data file',
      error: error.message
    });
  }
});

// Route untuk menghapus file berdasarkan file_id dari header
app.delete('/files', async (req, res) => {
  try {
    const fileId = req.headers['file-id'];
    
    if (!fileId) {
      return res.status(400).json({
        success: false,
        message: 'Header file-id harus disediakan'
      });
    }
    
    console.log(`Menghapus file dengan id (header): ${fileId}`);
    const result = await deleteFileById(fileId);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Gagal menghapus file',
        error: result.error
      });
    }
    
    // Cek jika ada file fisik yang perlu dihapus
    if (result.data && result.data.file_path) {
      const filePath = path.join(__dirname, result.data.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`File fisik dihapus: ${filePath}`);
      }
    }
    
    // Panggil DELETE_WEBHOOK jika diatur di .env
    let webhookResult = null;
    if (process.env.DELETE_WEBHOOK && result.data) {
      try {
        console.log(`\n=== DELETE WEBHOOK INFO ===`);
        console.log(`URL Webhook: ${process.env.DELETE_WEBHOOK}`);
        console.log(`Mengirim notifikasi penghapusan: ${result.data.original_filename}`);
        console.log(`- Agent ID: ${result.data.agent_id}`);
        
        // Panggil DELETE_WEBHOOK
        const webhookResponse = await axios.delete(process.env.DELETE_WEBHOOK, {
          headers: {
            'agent-id': result.data.agent_id,
            'filename': result.data.original_filename
          }
        });
        
        console.log(`DELETE Webhook berhasil dipanggil - Status: ${webhookResponse.status}`);
        console.log(`=== AKHIR DELETE WEBHOOK ===\n`);
        
        webhookResult = {
          success: true,
          status: webhookResponse.status,
          message: 'DELETE Webhook berhasil dipanggil'
        };
      } catch (webhookError) {
        console.log(`DELETE Webhook gagal: ${webhookError.message || 'Error tidak diketahui'}`);
        if (webhookError.code) {
          console.log(`Kode error: ${webhookError.code}`);
        }
        console.log(`=== AKHIR DELETE WEBHOOK ===\n`);
        
        webhookResult = {
          success: false,
          message: 'Gagal memanggil DELETE webhook',
          error: webhookError.message
        };
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'File berhasil dihapus',
      data: result.data,
      webhook: webhookResult
    });
  } catch (error) {
    console.error('Exception:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menghapus file',
      error: error.message
    });
  }
});

// Route untuk menghapus file berdasarkan user_id dari header
app.delete('/files/user', async (req, res) => {
  try {
    const userId = req.headers['user-id'];
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Header user-id harus disediakan'
      });
    }
    
    console.log(`Menghapus file berdasarkan user_id (header): ${userId}`);
    const result = await deleteFilesByUserId(userId);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Gagal menghapus file',
        error: result.error
      });
    }
    
    // Hapus file fisik jika ada
    if (result.data && result.data.length > 0) {
      result.data.forEach(file => {
        if (file.file_path) {
          const filePath = path.join(__dirname, file.file_path);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`File fisik dihapus: ${filePath}`);
          }
        }
      });
    }
    
    return res.status(200).json({
      success: true,
      message: `${result.data.length} file berhasil dihapus`,
      data: result.data
    });
  } catch (error) {
    console.error('Exception:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menghapus file',
      error: error.message
    });
  }
});

// Route untuk menghapus file berdasarkan agent_id (menggunakan header)
app.delete('/files/agent', async (req, res) => {
  try {
    const agentId = req.headers['agent-id'];
    
    if (!agentId) {
      return res.status(400).json({
        success: false,
        message: 'Header agent-id harus disediakan'
      });
    }
    
    console.log(`Menghapus file berdasarkan agent_id (header): ${agentId}`);
    const result = await deleteFilesByAgentId(agentId);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Gagal menghapus file',
        error: result.error
      });
    }
    
    // Hapus file fisik jika ada
    if (result.data && result.data.length > 0) {
      result.data.forEach(file => {
        if (file.file_path) {
          const filePath = path.join(__dirname, file.file_path);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`File fisik dihapus: ${filePath}`);
          }
        }
      });
    }
    
    // Panggil DELETE_WEBHOOK jika diatur di .env
    let webhookResult = null;
    if (process.env.DELETE_WEBHOOK) {
      try {
        console.log(`\n=== DELETE WEBHOOK INFO ===`);
        console.log(`URL Webhook: ${process.env.DELETE_WEBHOOK}`);
        console.log(`Mengirim notifikasi penghapusan semua file untuk agent ID: ${agentId}`);
        console.log(`Total file yang dihapus: ${result.data ? result.data.length : 0}`);
        
        // Panggil DELETE_WEBHOOK
        const webhookResponse = await axios.delete(process.env.DELETE_WEBHOOK, {
          headers: {
            'agent-id': agentId
          }
        });
        
        console.log(`DELETE Webhook berhasil dipanggil - Status: ${webhookResponse.status}`);
        console.log(`=== AKHIR DELETE WEBHOOK ===\n`);
        
        webhookResult = {
          success: true,
          status: webhookResponse.status,
          message: 'DELETE Webhook berhasil dipanggil'
        };
      } catch (webhookError) {
        console.log(`DELETE Webhook gagal: ${webhookError.message || 'Error tidak diketahui'}`);
        if (webhookError.code) {
          console.log(`Kode error: ${webhookError.code}`);
        }
        console.log(`=== AKHIR DELETE WEBHOOK ===\n`);
        
        webhookResult = {
          success: false,
          message: 'Gagal memanggil DELETE webhook',
          error: webhookError.message
        };
      }
    }
    
    return res.status(200).json({
      success: true,
      message: `${result.data.length} file berhasil dihapus`,
      data: result.data,
      webhook: webhookResult
    });
  } catch (error) {
    console.error('Exception:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menghapus file',
      error: error.message
    });
  }
});

// Route untuk download file berdasarkan file_id (menggunakan header)
app.get('/download', async (req, res) => {
  try {
    const fileId = req.headers['file-id'];
    
    if (!fileId) {
      return res.status(400).json({
        success: false,
        message: 'Header file-id harus disediakan'
      });
    }
    
    console.log(`Mengunduh file dengan id (header): ${fileId}`);
    
    // Ambil informasi file dari database
    const { data: fileInfo, error } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();
    
    if (error) {
      console.error('Error saat mengambil informasi file:', error);
      return res.status(400).json({
        success: false,
        message: 'Gagal mendapatkan informasi file',
        error: error.message
      });
    }
    
    if (!fileInfo) {
      return res.status(404).json({
        success: false,
        message: 'File tidak ditemukan'
      });
    }
    
    // Path file fisik
    const filePath = path.join(__dirname, fileInfo.file_path);
    
    // Periksa apakah file ada
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File fisik tidak ditemukan di server'
      });
    }
    
    // Set Content-Disposition header untuk mendorong browser mengunduh file
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.original_filename}"`);
    
    // Set Content-Type berdasarkan MIME type file
    res.setHeader('Content-Type', fileInfo.mimetype);
    
    // Kirim file sebagai response
    res.sendFile(filePath);
    
  } catch (error) {
    console.error('Exception saat download file:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengunduh file',
      error: error.message
    });
  }
});

// Endpoint untuk menambahkan atau memperbarui kontak
app.post('/addcontact', async (req, res) => {
  try {
    const { phone_number, contact_name, agent_id, owner_id } = req.body;

    // Validasi input
    if (!phone_number || !owner_id) {
      return res.status(400).json({
        success: false,
        message: 'phone_number dan owner_id harus diisi'
      });
    }

    // Validasi format phone_number (opsional)
    const phoneRegex = /^[0-9+\-\s()]{8,20}$/;
    if (!phoneRegex.test(phone_number)) {
      return res.status(400).json({
        success: false,
        message: 'Format nomor telepon tidak valid'
      });
    }

    // Proses upsert kontak
    const result = await upsertContact({
      phone_number,
      contact_name,
      agent_id,
      owner_id
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Gagal menambahkan/memperbarui kontak',
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Kontak berhasil ditambahkan/diperbarui',
      data: result.data
    });

  } catch (err) {
    console.error('Error in /addcontact endpoint:', err);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server',
      error: err.message
    });
  }
});

// Start server
app.listen(1212, () => {
  console.log(`Server berjalan di port 1212`);
});