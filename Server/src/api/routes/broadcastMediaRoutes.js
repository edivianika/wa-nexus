import express from 'express';
const router = express.Router();
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Storage config for Broadcast Media
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Dapatkan UID dari body request (dikirim sebagai field form)
    // Pada multer, parameter formData tersedia di req.body tetapi hanya setelah parsing selesai
    // Untuk mendapatkan user_id saat ini, kita akan menggunakan variabel sementara 
    
    // Buat base upload directory
    const baseUploadDir = path.join(__dirname, '../../../public/Broadcast Media');
    if (!fs.existsSync(baseUploadDir)) {
      fs.mkdirSync(baseUploadDir, { recursive: true });
    }
    
    // Nilai uid akan diatur setelah upload selesai
    cb(null, baseUploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const allowedTypes = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'video/mp4', 'video/quicktime',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/x-m4a'
];

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('File type not allowed'));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB limit
  }
});

// Endpoint: POST /api/broadcast/upload-media
router.post('/api/broadcast/upload-media', upload.single('media'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  
  // Dapatkan campaign_id dan user_id yang dikirim dari client
  const campaignId = req.body.campaign_id || 'temp';
  const userId = req.body.user_id || 'default'; 
  
  // Buat directory berdasarkan campaign_id dan user_id
  const baseUploadDir = path.join(__dirname, '../../../public/Broadcast Media');
  const campaignUploadDir = path.join(baseUploadDir, campaignId);
  
  if (!fs.existsSync(campaignUploadDir)) {
    fs.mkdirSync(campaignUploadDir, { recursive: true });
  }
  
  // Pindahkan file ke folder campaign
  const originalPath = req.file.path;
  const targetFileName = path.basename(originalPath);
  const targetPath = path.join(campaignUploadDir, targetFileName);
  
  try {
    // Pastikan direktori exist
    if (!fs.existsSync(path.dirname(targetPath))) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    }
    
    // Pindahkan file ke folder campaign
    fs.renameSync(originalPath, targetPath);
    
    // Update path yang disimpan di req.file
    req.file.path = targetPath;
  
    // Return file info, public URL, and full path
    const fileUrl = `/Broadcast Media/${campaignId}/${targetFileName}`;
    const fullPath = path.resolve(targetPath);
    
    res.json({ 
      success: true, 
      file: targetFileName, 
      url: fileUrl, 
      fullPath,
      campaignId,
      userId 
    });
  } catch (error) {
    console.error("Error moving file to campaign directory:", error);
    // Tetap kembalikan response sukses tetapi dengan path original
    const fileUrl = `/Broadcast Media/${targetFileName}`;
    const fullPath = path.resolve(originalPath);
    
    res.json({ 
      success: true, 
      file: targetFileName, 
      url: fileUrl, 
      fullPath,
      campaignId,
      userId,
      warning: "File tidak dapat dipindahkan ke direktori campaign"
    });
  }
});

// Endpoint: GET /api/broadcast/media-proxy
// Mengambil file media berdasarkan path lengkap
router.get('/api/broadcast/media-proxy', (req, res) => {
  try {
    const { path: filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({ 
        success: false, 
        error: 'Path parameter is required' 
      });
    }
    
    // Validasi path untuk mencegah path traversal attack
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      return res.status(403).json({ 
        success: false, 
        error: 'Invalid file path' 
      });
    }
    
    // Cek apakah file ada
    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({ 
        success: false, 
        error: 'File not found' 
      });
    }
    
    // Dapatkan informasi file
    const filename = path.basename(normalizedPath);
    const fileStats = fs.statSync(normalizedPath);
    
    // Deteksi MIME type berdasarkan ekstensi file
    const ext = path.extname(normalizedPath).toLowerCase();
    let mimeType = 'application/octet-stream'; // Default
    
    // Map ekstensi ke MIME type
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.aac': 'audio/aac',
      '.flac': 'audio/flac',
      '.m4a': 'audio/x-m4a'
    };
    
    if (mimeTypes[ext]) {
      mimeType = mimeTypes[ext];
    }
    
    // Set header untuk download
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', fileStats.size);
    
    // Stream file ke response
    const fileStream = fs.createReadStream(normalizedPath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Error serving media file:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error serving media file: ' + error.message 
    });
  }
});

// Endpoint to delete a media file
router.post('/api/broadcast/delete-media', (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ success: false, message: 'File path is required.' });
    }

    // Security Check: Prevent directory traversal and ensure we only delete from the broadcast media folder.
    const uploadDir = path.resolve(__dirname, '../../../public/Broadcast Media');
    const resolvedPath = path.resolve(filePath);

    if (!resolvedPath.startsWith(uploadDir)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Cannot delete files outside the upload directory.' });
    }

    // Check if file exists before attempting to delete
    if (fs.existsSync(resolvedPath)) {
      fs.unlink(resolvedPath, (err) => {
        if (err) {
          console.error(`Failed to delete file: ${resolvedPath}`, err);
          return res.status(500).json({ success: false, message: 'Failed to delete file from server.' });
        }
        res.json({ success: true, message: 'File deleted successfully.' });
      });
    } else {
      // If the file doesn't exist, return a success response as the goal (deletion) is achieved.
      res.json({ success: true, message: 'File not found, but considered deleted.' });
    }
  } catch (error) {
    console.error('Error in delete-media endpoint:', error);
    res.status(500).json({ success: false, message: 'An internal server error occurred.' });
  }
});

export default router; 