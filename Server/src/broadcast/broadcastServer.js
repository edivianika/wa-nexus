import 'dotenv/config';
import express from 'express';
import { broadcastQueue } from './queue.js';
import { QueueEvents, Job } from 'bullmq';
import bodyParser from 'body-parser';
import Redis from 'ioredis';
import cors from 'cors';
import { broadcastJobs, messages, contacts } from './supabaseClient.js';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { supabase } from './supabaseClient.js';
import { createClient } from '@supabase/supabase-js';
import { Parser } from 'json2csv';

const app = express();
app.use(bodyParser.json());

// Add CORS middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'device_id', 'x-api-key'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  credentials: true,
  maxAge: 86400
}));

// Handle OPTIONS preflight requests
app.options('*', cors());

// Manual CORS middleware to ensure headers are always set (for Cloudflare Tunnel compatibility)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['*'];
  
  // Check if origin is allowed
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  } else {
    // Fallback to wa.bulumerak.com for compatibility
    res.header('Access-Control-Allow-Origin', 'https://wa.bulumerak.com');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,device_id,x-api-key');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0')
});

// Middleware untuk mengambil user dari Supabase Auth (JWT)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function injectSupabaseUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    console.log('[injectSupabaseUser] Authorization header:', authHeader);
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }
    const token = authHeader.split(' ')[1];
    console.log('[injectSupabaseUser] Token:', token);
    // Verifikasi JWT dan ambil user
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    console.log('[injectSupabaseUser] Supabase getUser result:', { data, error });
    if (error || !data || !data.user) {
      req.user = null;
      return next();
    }
    req.user = data.user;
    next();
  } catch (err) {
    console.log('[injectSupabaseUser] Exception:', err);
    req.user = null;
    next();
  }
}

// Middleware untuk autentikasi API key
const authenticateApiKey = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'API key required' });
  }
  const apiKey = authHeader.split(' ')[1];
  req.apiKey = apiKey;
  next();
};

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== 'text/csv') {
      return cb(new Error('Only CSV files are allowed'));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Example payloads (lihat di bawah)
// POST /broadcast
// {
//   "contacts": ["6281234567890", "6289876543210"],
//   "message": "Promo terbaru!",
//   "groupTag": "customer-premium"
// }
//
// POST /broadcast with single media (legacy)
// {
//   "contacts": ["6281234567890"],
//   "message": "Caption untuk media",
//   "type": "media",
//   "mediaUrl": "https://example.com/image.jpg"
// }
//
// POST /broadcast with multiple media (new)
// {
//   "contacts": ["6281234567890"],
//   "message": "Caption untuk semua media",
//   "type": "media",
//   "media": [
//     {
//       "url": "https://example.com/image1.jpg",
//       "filename": "image1.jpg",
//       "mimetype": "image/jpeg"
//     },
//     {
//       "url": "https://example.com/doc.pdf",
//       "filename": "document.pdf",
//       "mimetype": "application/pdf"
//     }
//   ]
// }
//
// POST /contacts/import
// {
//   "contacts": ["6281234567890", "6289876543210"]
// }

// Submit job broadcast
app.post('/broadcast', authenticateApiKey, async (req, res) => {
  try {
    let { 
      contacts, 
      message, 
      schedule, 
      priority, 
      groupTag, 
      connectionId, 
      connection_id, // Add support for snake_case version
      type, 
      mediaUrl, 
      mediaFullPath, 
      caption, 
      speed, 
      isPrivateMessage = false, 
      contact_id = null, 
      broadcast_name = null, 
      isBroadcast = true,
      // Tambahkan parameter untuk multiple media
      media = [],
      // Parameter untuk mencegah duplikasi
      deduplicationId = null,
      asset_id = null
    } = req.body;
    
    const apiKey = req.apiKey;
    
    // Use either connectionId or connection_id
    const effectiveConnectionId = connectionId || connection_id;
    
    // Validate required parameters
    if (!effectiveConnectionId) {
      console.error('[POST /broadcast] Missing required parameter: connectionId or connection_id');
      return res.status(400).json({ error: 'connection_id is required for broadcast jobs' });
    }

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'contacts array is required and must not be empty' });
    }

    // IMPROVED: Enhanced deduplication logic
    // Generate a deduplication ID if none was provided
    if (!deduplicationId) {
      // Create a unique hash based on the request parameters
      const crypto = await import('crypto');
      const dataToHash = JSON.stringify({
        connectionId: effectiveConnectionId,
        message: message || '',
        contacts: contacts ? contacts.map(c => typeof c === 'object' ? c.phone_number : c).sort() : [],
        type,
        mediaUrl,
        schedule,
        timestamp: new Date().toISOString().split('T')[0] // Include date for daily uniqueness
      });
      deduplicationId = `auto-${crypto.createHash('md5').update(dataToHash).digest('hex')}`;
      console.log(`[POST /broadcast] Auto-generated deduplicationId: ${deduplicationId}`);
    }
    
    // Deduplication disabled: skip duplicate-job check
    const existingJobKey = null; // placeholder, not used

    // Selalu ambil userId dari Redis berdasarkan apiKey
    let userId = null;
    if (apiKey) {
      try {
        const redisKey = `auth:${apiKey}`;
        const redisData = await redis.get(redisKey);
        if (redisData) {
          const parsed = JSON.parse(redisData);
          if (parsed && parsed.user_id) {
            userId = parsed.user_id;
          }
        }
      } catch (err) {
        console.log('[POST /broadcast] Error mengambil user_id dari Redis:', err);
      }
    }
    console.log('[POST /broadcast] userId for broadcastJobs.create:', userId);

    // Validasi required fields
    if (!message && type !== 'media' && media.length === 0 && !mediaUrl && !mediaFullPath) {
      return res.status(400).json({ error: 'message required for non-media broadcasts' });
    }

    // KONVERSI: Jika contacts berupa array of string, ubah ke array of object
    if (typeof contacts[0] === 'string') {
      contacts = contacts.map(num => ({ phone_number: num }));
    }

    // VALIDASI: Pastikan setiap kontak punya phone_number
    for (const c of contacts) {
      if (!c.phone_number) {
        return res.status(400).json({ error: 'Setiap kontak wajib punya key phone_number' });
      }
      // Normalisasi nomor (hapus spasi, dsb)
      c.phone_number = c.phone_number.replace(/\s+/g, '');
    }

    // Deduplikasi kontak berdasarkan nomor telepon untuk mencegah pengiriman duplikat
    const uniqueContacts = [];
    const phoneNumbers = new Set();
    
    for (const contact of contacts) {
      const phoneNumber = contact.phone_number;
      if (!phoneNumbers.has(phoneNumber)) {
        phoneNumbers.add(phoneNumber);
        uniqueContacts.push(contact);
      }
    }
    
    contacts = uniqueContacts;
    console.log(`[POST /broadcast] Deduplicated contacts: ${contacts.length} unique contacts from ${contacts.length} total`);

    // Validasi schedule jika ada
    let delay = 0;
    if (schedule) {
      const scheduleDate = new Date(schedule);
      if (isNaN(scheduleDate.getTime())) {
        return res.status(400).json({ error: 'Invalid schedule date format' });
      }
      delay = Math.max(0, scheduleDate.getTime() - Date.now());
    }

    // Validasi connectionId jika ada
    if (effectiveConnectionId && (typeof effectiveConnectionId !== 'string' || effectiveConnectionId.trim() === '')) {
      return res.status(400).json({ error: 'Invalid connectionId format' });
    }

    // Validasi speed
    const speedValue = typeof speed === 'string' ? speed.toLowerCase() : 'normal';
    const allowedSpeeds = ['fast', 'normal', 'slow'];
    const speedParam = allowedSpeeds.includes(speedValue) ? speedValue : 'normal';

    // Backward compatibility: Konversi mediaUrl/mediaFullPath ke format media array
    let mediaArray = [];
    
    // Validasi asset_id jika ada
    if (asset_id) {
      try {
        // Periksa apakah asset_id valid dan ada di database
        const { data: assetExists, error: assetError } = await supabase
          .from('asset_library')
          .select('id, filename, mime_type')
          .eq('id', asset_id)
          .single();
          
        if (assetError || !assetExists) {
          console.error(`[POST /broadcast] Asset ID ${asset_id} not found or invalid: ${assetError?.message || 'No data'}`);
          return res.status(400).json({ 
            error: 'Invalid asset_id provided. The asset does not exist in the asset library.',
            details: assetError?.message
          });
        }
        
        console.log(`[POST /broadcast] Asset verified: ${asset_id} (${assetExists.filename}, ${assetExists.mime_type})`);
      } catch (assetCheckErr) {
        console.error(`[POST /broadcast] Error checking asset_id: ${assetCheckErr.message}`);
        // Non-blocking, akan mencoba mengirimkan broadcast meskipun validasi gagal
      }
    }
    
    // Jika ada parameter media[] yang dikirim, gunakan itu
    if (Array.isArray(media) && media.length > 0) {
      // Validasi format media array
      mediaArray = media.map((item, index) => {
        // Validasi item
        if (!item.url && !item.fullPath) {
          throw new Error(`Media item #${index+1} missing url or fullPath`);
        }
        
        // Jika mimetype atau filename tidak ada, coba ekstrak dari URL
        const url = item.url || item.fullPath;
        let filename = item.filename;
        let mimetype = item.mimetype;
        
        if (!filename && url) {
          // Extract filename from URL
          const urlParts = url.split('/');
          filename = urlParts[urlParts.length - 1].split('?')[0] || `file-${index+1}`;
        }
        
        if (!mimetype && filename) {
          // Guess mimetype from extension
          const ext = filename.split('.').pop().toLowerCase();
          if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            mimetype = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          } else if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) {
            mimetype = `video/${ext}`;
          } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
            mimetype = `audio/${ext}`;
          } else if (ext === 'pdf') {
            mimetype = 'application/pdf';
          } else {
            mimetype = 'application/octet-stream';
          }
        }
        
        return {
          url: item.url,
          fullPath: item.fullPath,
          filename: filename || `file-${index+1}`,
          mimetype: mimetype || 'application/octet-stream',
          caption: item.caption
        };
      });
    }
    // Jika tidak ada media[] tapi ada mediaUrl atau mediaFullPath (format lama), konversi ke format baru
    else if ((mediaUrl || mediaFullPath) && type === 'media') {
      // Pilih media path yang akan digunakan
      let finalMediaUrl = mediaUrl;
      let finalMediaFullPath = mediaFullPath;
      
      if (mediaFullPath) {
        // Jika mediaFullPath dikirim, gunakan ini dan abaikan mediaUrl
        finalMediaUrl = undefined;
      }
      
      // Ekstrak filename dan mimetype dari URL jika memungkinkan
      let filename;
      let mimetype;
      
      const url = finalMediaUrl || finalMediaFullPath;
      if (url) {
        // Extract filename from URL
        const urlParts = url.split('/');
        filename = urlParts[urlParts.length - 1].split('?')[0] || 'file';
        
        // Guess mimetype from extension
        const ext = filename.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
          mimetype = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        } else if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) {
          mimetype = `video/${ext}`;
        } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
          mimetype = `audio/${ext}`;
        } else if (ext === 'pdf') {
          mimetype = 'application/pdf';
        } else {
          mimetype = 'application/octet-stream';
        }
      }
      
      mediaArray = [{
        url: finalMediaUrl,
        fullPath: finalMediaFullPath,
        filename: filename || 'file',
        mimetype: mimetype || 'application/octet-stream',
        caption: caption || message
      }];
    }
    
    // Jika tipe media tapi tidak ada media, error
    if (type === 'media' && mediaArray.length === 0 && !asset_id) {
      return res.status(400).json({ error: 'Media broadcast requires media content. Please provide either media[] array or mediaUrl/mediaFullPath, or an asset_id.' });
    }

    const jobData = {
      contacts,
      message, // message is the caption for multi-media
      caption: message, // Also set caption for the worker
      type: mediaArray.length > 0 || mediaUrl || mediaFullPath ? 'media' : 'text',
      mediaUrl,
      mediaFullPath,
      groupTag,
      connectionId: effectiveConnectionId?.trim(),
      apiKey,
      schedule: schedule ? new Date(schedule).toISOString() : null,
      speed: speedParam,
      isprivatemessage: isPrivateMessage,
      contact_id,
      broadcast_name,
      isBroadcast,
      deduplicationId, // Simpan deduplicationId jika ada
      asset_id,
      ownerId: userId
    };

    // Split batch jika kontak > 500
    const batchSize = 500;
    if (contacts.length > batchSize) {
      const jobs = [];
      
      // IMPROVED: Create a parent job ID for all batches
      const parentJobId = `parent-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      
      for (let i = 0; i < contacts.length; i += batchSize) {
        const batchContacts = contacts.slice(i, i + batchSize);
        const batchDelay = delay + (i === 0 ? 0 : (i / batchSize) * 60000);
        const jobOpts = {
          priority: priority || 2,
          delay: batchDelay,
          removeOnComplete: true,
          removeOnFail: false
        };
        
        const batchJobOptions = {
          ...jobData,
          contacts: batchContacts,
          schedule: schedule ? new Date(Date.now() + batchDelay).toISOString() : null,
          parentJobId // Add parent job ID to track related batches
        };
        
        const batchJob = await broadcastJobs.create(effectiveConnectionId?.trim(), message, batchContacts, batchJobOptions, userId, isBroadcast);
        
        // Add batch-specific deduplication ID
        const batchDeduplicationId = `${deduplicationId}-batch-${i}`;
        
        const job = await broadcastQueue.add('broadcast', {
          contacts: batchContacts,
          message,
          groupTag,
          connectionId: effectiveConnectionId?.trim(),
          apiKey,
          type,
          media: mediaArray,
          asset_id,
          ownerId: userId,
          schedule: schedule ? new Date(Date.now() + batchDelay).toISOString() : undefined,
          speed: speedParam,
          dbJobId: batchJob.id,
          deduplicationId: batchDeduplicationId,
          parentJobId
        }, jobOpts);
        
        jobs.push({ 
          jobId: job.id, 
          dbJobId: batchJob.id, 
          batch: (i / batchSize) + 1, 
          contacts: batchContacts.length, 
          schedule: schedule ? new Date(Date.now() + batchDelay).toISOString() : undefined 
        });
        
        // Deduplication disabled: do not store Redis reference
      }
      
      // Save the parent deduplication ID with all batch job IDs
      await redis.set(existingJobKey, JSON.stringify(jobs.map(j => j.jobId)), 'EX', 86400);
      
      return res.json({
        status: 'queued-batch',
        totalContacts: contacts.length,
        batchSize,
        totalBatch: Math.ceil(contacts.length / batchSize),
        jobs,
        deduplicationId
      });
    }

    // Jika tidak perlu split
    const jobOpts = {
      priority: priority || 2,
      delay,
      removeOnComplete: true,
      removeOnFail: false
    };
    
    const dbJob = await broadcastJobs.create(effectiveConnectionId?.trim(), message, contacts, jobData, userId, isBroadcast);
    
    // Submit job ke queue
    const job = await broadcastQueue.add('broadcast', {
      contacts: uniqueContacts,
      message,
      connectionId: effectiveConnectionId,
      apiKey,
      type,
      mediaUrl,
      mediaFullPath,
      media,
      asset_id,
      caption,
      dbJobId: dbJob.id,
      speed: speedParam,
      deduplicationId,
      ownerId: userId,
      isTest: false,
      isPrivateMessage,
      contact_id,
      broadcast_name,
      isBroadcast
    }, jobOpts);
    
    // Deduplication disabled: do not store Redis reference
    
    res.json({ 
      status: 'queued', 
      jobId: job.id,
      dbJobId: dbJob.id,
      connectionId: effectiveConnectionId?.trim(),
      schedule: schedule ? new Date(schedule).toISOString() : undefined,
      estimatedStart: schedule ? new Date(Date.now() + delay).toISOString() : undefined,
      speed: speedParam,
      deduplicationId
    });
  } catch (err) {
    console.error('Broadcast error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cek status job
app.get('/broadcast/:jobId/status', authenticateApiKey, async (req, res) => {
  try {
    const job = await broadcastQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const state = await job.getState();
    
    // Get job details from Supabase if dbJobId exists
    let dbJobDetails = null;
    if (job.data.dbJobId) {
      try {
        dbJobDetails = await broadcastJobs.getJobDetails(job.data.dbJobId);
      } catch (dbErr) {
        console.error(`Error fetching job details from database: ${dbErr.message}`);
      }
    }
    
    res.json({ 
      jobId: job.id, 
      state, 
      progress: job.progress, 
      result: job.returnvalue,
      dbDetails: dbJobDetails
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List semua job (ringkas)
app.get('/broadcast/jobs', authenticateApiKey, async (req, res) => {
  try {
    const { connectionId } = req.query;
    
    // Get jobs from queue
    const queueJobs = await broadcastQueue.getJobs(['waiting','active','completed','failed','delayed'], 0, 50);
    
    // Get jobs from database if connectionId is provided
    let dbJobs = [];
    if (connectionId) {
      try {
        dbJobs = await broadcastJobs.getHistory(connectionId, 50);
      } catch (dbErr) {
        console.error(`Error fetching jobs from database: ${dbErr.message}`);
      }
    } else {
      // If no connectionId provided, get jobs by API key
      try {
        dbJobs = await broadcastJobs.getByApiKey(req.apiKey, 50);
      } catch (dbErr) {
        console.error(`Error fetching jobs from database by API key: ${dbErr.message}`);
      }
    }
    
    // Combine data
    const combinedJobs = queueJobs.map(j => {
      const dbJob = dbJobs.find(db => db.id === j.data.dbJobId);
      return {
        id: j.id,
        state: j.stateName,
        data: j.data,
        progress: j.progress,
        dbDetails: dbJob || null
      };
    });
    
    // Add database jobs that might not be in the queue anymore
    dbJobs.forEach(dbJob => {
      if (!combinedJobs.some(j => j.dbDetails && j.dbDetails.id === dbJob.id)) {
        combinedJobs.push({
          id: dbJob.id,
          state: dbJob.status,
          data: {
            message: dbJob.message,
            connectionId: dbJob.connection_id,
            type: dbJob.type,
            mediaUrl: dbJob.media_url,
            schedule: dbJob.schedule,
            speed: dbJob.speed
          },
          progress: dbJob.progress || 0,
          dbDetails: dbJob
        });
      }
    });
    
    res.json(combinedJobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint untuk mendapatkan daftar broadcast berdasarkan API key
app.get('/api/broadcasts', authenticateApiKey, async (req, res) => {
  try {
    const apiKey = req.apiKey;
    const { limit = 50, status } = req.query;
    
    // Get jobs from database by API key
    let broadcasts = [];
    try {
      broadcasts = await broadcastJobs.getByApiKey(apiKey, parseInt(limit));
      
      // Filter by status if provided
      if (status) {
        broadcasts = broadcasts.filter(job => job.status === status);
      }
      
    } catch (dbErr) {
      console.error(`Error fetching broadcasts from database by API key: ${dbErr.message}`);
      return res.status(500).json({ 
        success: false,
        error: 'Failed to fetch broadcasts',
        details: dbErr.message
      });
    }
    
    res.json({ 
      success: true,
      broadcasts: broadcasts.map(job => ({
        id: job.id,
        connectionId: job.connection_id,
        message: job.message,
        type: job.type,
        mediaUrl: job.media_url,
        schedule: job.schedule,
        status: job.status,
        progress: job.progress || 0,
        totalContacts: job.total_contacts,
        sentCount: job.sent_count || 0,
        failedCount: job.failed_count || 0,
        skippedCount: job.skipped_count || 0,
        createdAt: job.created_at,
        completedAt: job.completed_at
      }))
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// Endpoint untuk mendapatkan daftar scheduled broadcasts berdasarkan API key
app.get('/api/broadcasts/scheduled', authenticateApiKey, async (req, res) => {
  try {
    const apiKey = req.apiKey;
    
    // Get scheduled jobs from database by API key
    let scheduledBroadcasts = [];
    try {
      scheduledBroadcasts = await broadcastJobs.getScheduledByApiKey(apiKey);
    } catch (dbErr) {
      console.error(`Error fetching scheduled broadcasts from database by API key: ${dbErr.message}`);
      return res.status(500).json({ 
        success: false,
        error: 'Failed to fetch scheduled broadcasts',
        details: dbErr.message
      });
    }
    
    res.json({ 
      success: true,
      broadcasts: scheduledBroadcasts.map(job => ({
        id: job.id,
        connectionId: job.connection_id,
        message: job.message,
        type: job.type,
        mediaUrl: job.media_url,
        schedule: job.schedule,
        status: job.status,
        totalContacts: job.total_contacts,
        createdAt: job.created_at
      }))
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// Ambil status per nomor dari Redis
app.get('/broadcast/:jobId/results', authenticateApiKey, async (req, res) => {
  try {
    const job = await broadcastQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    
    const connectionId = job.data.connectionId;
    const redisKey = connectionId 
      ? `broadcast:${connectionId}:status:${req.params.jobId}`
      : `broadcast:status:${req.params.jobId}`;
      
    const results = await redis.hgetall(redisKey);
    // Parse JSON values
    Object.keys(results).forEach(k => { results[k] = JSON.parse(results[k]); });
    
    // Get messages from database if dbJobId exists
    let dbMessages = [];
    if (job.data.dbJobId) {
      try {
        dbMessages = await messages.getByJobId(job.data.dbJobId);
      } catch (dbErr) {
        console.error(`Error fetching messages from database: ${dbErr.message}`);
      }
    }
    
    res.json({ 
      jobId: req.params.jobId, 
      results,
      dbMessages: dbMessages.length > 0 ? dbMessages : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import kontak nyata ke Redis
app.post('/contacts/import', authenticateApiKey, async (req, res) => {
  try {
    const { contacts: contactsList, connectionId } = req.body;
    if (!contactsList || !Array.isArray(contactsList) || contactsList.length === 0) {
      return res.status(400).json({ error: 'contacts array required' });
    }

    const redisKey = connectionId 
      ? `contacts:${connectionId}:global`
      : 'contacts:global';
      
    await redis.sadd(redisKey, ...contactsList);
    
    // Store contacts in database
    if (connectionId) {
      try {
        await contacts.import(connectionId, contactsList);
      } catch (dbErr) {
        console.error(`Error importing contacts to database: ${dbErr.message}`);
      }
    }
    
    res.json({ status: 'imported', count: contactsList.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List kontak nyata dari Redis
app.get('/contacts', authenticateApiKey, async (req, res) => {
  try {
    const { connectionId } = req.query;
    
    // Get contacts from Redis
    const redisKey = connectionId 
      ? `contacts:${connectionId}:global`
      : 'contacts:global';
    const redisContacts = await redis.smembers(redisKey);
    
    // Get contacts from database if connectionId is provided
    let dbContacts = [];
    if (connectionId) {
      try {
        dbContacts = await contacts.getAll(connectionId);
      } catch (dbErr) {
        console.error(`Error fetching contacts from database: ${dbErr.message}`);
      }
    }
    
    res.json({ 
      contacts: redisContacts,
      dbContacts: dbContacts.length > 0 ? dbContacts : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tambah ke blacklist
app.post('/contacts/blacklist', authenticateApiKey, async (req, res) => {
  try {
    const { contacts: contactsList, connectionId } = req.body;
    if (!contactsList || !Array.isArray(contactsList) || contactsList.length === 0) {
      return res.status(400).json({ error: 'contacts array required' });
    }

    const redisKey = connectionId 
      ? `contacts:${connectionId}:blacklist`
      : 'contacts:blacklist';
      
    await redis.sadd(redisKey, ...contactsList);
    
    // Blacklist contacts in database
    if (connectionId) {
      try {
        await contacts.blacklist(connectionId, contactsList);
      } catch (dbErr) {
        console.error(`Error blacklisting contacts in database: ${dbErr.message}`);
      }
    }
    
    res.json({ status: 'blacklisted', count: contactsList.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tambah kontak ke grup
app.post('/contacts/group/:groupTag', authenticateApiKey, async (req, res) => {
  try {
    const { contacts: contactsList, connectionId } = req.body;
    const { groupTag } = req.params;
    if (!contactsList || !Array.isArray(contactsList) || contactsList.length === 0) {
      return res.status(400).json({ error: 'contacts array required' });
    }

    const redisKey = connectionId 
      ? `contacts:${connectionId}:group:${groupTag}`
      : `contacts:group:${groupTag}`;
      
    await redis.sadd(redisKey, ...contactsList);
    res.json({ status: 'grouped', groupTag, count: contactsList.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint untuk melihat semua job yang statusnya 'delayed' (debug scheduling)
app.get('/broadcast/jobs/delayed', authenticateApiKey, async (req, res) => {
  try {
    const jobs = await broadcastQueue.getJobs(['delayed'], 0, 50);
    res.json(jobs.map(j => ({
      id: j.id,
      state: j.stateName,
      data: j.data,
      timestamp: j.timestamp,
      delay: j.opts.delay,
      processedOn: j.processedOn,
      schedule: j.data.schedule,
      estimatedRun: j.timestamp ? new Date(j.timestamp + (j.opts.delay || 0)).toISOString() : null
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Halaman utama: contoh broadcaster terintegrasi
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/broadcast.html'));
});

// Import contacts from CSV
app.post('/contacts/import/csv', authenticateApiKey, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file required' });
    }

    const { connectionId } = req.body;
    const contacts = [];
    const errors = [];

    // Read CSV file
    const fileContent = fs.readFileSync(req.file.path, 'utf-8');
    const rows = fileContent.split('\n');

    // Process each row
    for (let i = 1; i < rows.length; i++) { // Skip header row
      const row = rows[i].trim();
      if (!row) continue;

      const columns = row.split(',');
      const phone = columns[0]?.trim().replace(/\D/g, '');
      
      if (!phone) {
        errors.push(`Row ${i + 1}: Invalid phone number`);
        continue;
      }

      // Format phone number to international format
      const formattedPhone = phone.startsWith('0') ? '62' + phone.slice(1) : 
                           phone.startsWith('62') ? phone : '62' + phone;

      contacts.push(formattedPhone);
    }

    // Delete temporary file
    fs.unlinkSync(req.file.path);

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No valid contacts found in CSV' });
    }

    // Store contacts in Redis
    const redisKey = connectionId 
      ? `contacts:${connectionId}:global`
      : 'contacts:global';
      
    await redis.sadd(redisKey, ...contacts);
    
    // Store contacts in database
    if (connectionId) {
      try {
        await contacts.import(connectionId, contacts);
      } catch (dbErr) {
        console.error(`Error importing contacts to database: ${dbErr.message}`);
      }
    }
    
    res.json({ 
      status: 'imported', 
      count: contacts.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send message to WhatsApp group
app.post('/broadcast/group', authenticateApiKey, async (req, res) => {
  try {
    const { groupId, message, type, mediaUrl, caption, schedule, speed, connectionId } = req.body;
    const apiKey = req.apiKey;

    // Validasi required fields
    if (!groupId) {
      return res.status(400).json({ error: 'groupId required' });
    }
    if (!message) {
      return res.status(400).json({ error: 'message required' });
    }

    // Validasi schedule jika ada
    let delay = 0;
    if (schedule) {
      const scheduleDate = new Date(schedule);
      if (isNaN(scheduleDate.getTime())) {
        return res.status(400).json({ error: 'Invalid schedule date format' });
      }
      delay = Math.max(0, scheduleDate.getTime() - Date.now());
    }

    // Validasi connectionId jika ada
    if (connectionId && (typeof connectionId !== 'string' || connectionId.trim() === '')) {
      return res.status(400).json({ error: 'Invalid connectionId format' });
    }

    // Validasi speed
    const speedValue = typeof speed === 'string' ? speed.toLowerCase() : 'normal';
    const allowedSpeeds = ['fast', 'normal', 'slow'];
    const speedParam = allowedSpeeds.includes(speedValue) ? speedValue : 'normal';

    // Create job in Supabase
    const dbJob = await broadcastJobs.create(connectionId?.trim(), message, [groupId], {
      type: type || 'text',
      mediaUrl,
      caption,
      schedule: schedule ? new Date(schedule).toISOString() : null,
      speed: speedParam,
      isprivatemessage: false,
      isGroup: true
    });

    const jobOpts = {
      priority: 1, // High priority for group messages
      delay,
      removeOnComplete: true,
      removeOnFail: false
    };

    const job = await broadcastQueue.add('broadcast', { 
      groupId,
      message, 
      connectionId: connectionId?.trim(),
      apiKey,
      type,
      mediaUrl,
      caption,
      schedule: schedule ? new Date(schedule).toISOString() : undefined,
      speed: speedParam,
      dbJobId: dbJob.id,
      isprivatemessage: false,
      isGroup: true
    }, jobOpts);

    res.json({ 
      status: 'queued', 
      jobId: job.id,
      dbJobId: dbJob.id,
      connectionId: connectionId?.trim(),
      schedule: schedule ? new Date(schedule).toISOString() : undefined,
      estimatedStart: schedule ? new Date(Date.now() + delay).toISOString() : undefined,
      speed: speedParam
    });
  } catch (err) {
    console.error('Group broadcast error:', err);
    res.status(500).json({ 
      error: err.message,
      details: 'Failed to queue group broadcast job'
    });
  }
});

// Export broadcast results as CSV
app.get('/export/:broadcastId', async (req, res) => {
  try {
    const { broadcastId } = req.params;

    // Ambil semua pesan untuk job ini (tanpa limit)
    const { messages } = await import('./supabaseClient.js');
    // NOTE: It is better to stream results for large exports, 
    // but for now we limit to 10,000 to avoid memory issues.
    const results = await messages.getByJobId(broadcastId, null, 10000); 

    if (!results || results.length === 0) {
      return res.status(404).json({ message: 'No results found for this broadcast.' });
    }

    // Pilih kolom yang ingin diekspor
    const fields = ['id', 'job_id', 'contact', 'status', 'sent_at', 'error'];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(results);

    res.header('Content-Type', 'text/csv');
    // Set a filename for the download
    res.attachment(`broadcast_results_${broadcastId}.csv`);
    return res.send(csv);

  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ message: 'Failed to export results.' });
  }
});

// Endpoint untuk broadcast template
app.post('/broadcast/template', authenticateApiKey, async (req, res) => {
  try {
    const { 
      templateName, 
      variables, 
      contacts, 
      schedule, 
      speed = 'normal',
      type = 'text',
      mediaUrl,
      caption,
      connectionId
    } = req.body;

    // Validasi input
    if (!templateName || !variables || !contacts || !speed) {
      return res.status(400).json({ error: 'Semua field wajib diisi kecuali jadwal ketika kirim template' });
    }

    // Validasi format variabel
    if (typeof variables !== 'object') {
      return res.status(400).json({ error: 'Format variabel tidak valid' });
    }

    // Validasi kecepatan
    if (!['fast', 'normal', 'slow'].includes(speed)) {
      return res.status(400).json({ error: 'Kecepatan tidak valid. Gunakan: fast, normal, atau slow' });
    }

    // Validasi jadwal jika ada
    let delay = 0;
    if (schedule) {
      const scheduleDate = new Date(schedule);
      if (isNaN(scheduleDate.getTime())) {
        return res.status(400).json({ error: 'Format jadwal tidak valid' });
      }
      delay = Math.max(0, scheduleDate.getTime() - Date.now());
    }

    // Buat job di database
    const { data: job, error: jobError } = await supabaseAdmin
      .from('broadcast_jobs')
      .insert({
        type: 'template',
        template_name: templateName,
        variables,
        contacts,
        status: 'queued',
        schedule: schedule ? new Date(schedule).toISOString() : null,
        speed,
        connection_id: connectionId,
        isprivatemessage: false
      })
      .select()
      .single();

    if (jobError) {
      console.error('Error creating job:', jobError);
      return res.status(500).json({ error: 'Gagal membuat job broadcast' });
    }

    // Tambahkan ke queue
    const queueJob = await broadcastQueue.add('broadcast', {
      contacts,
      templateName,
      variables,
      type,
      mediaUrl,
      caption,
      schedule,
      speed,
      connection_id: connectionId,
      dbJobId: job.id,
      apiKey: req.headers.authorization?.split(' ')[1], // Ambil API key dari header
      isprivatemessage: false
    }, {
      delay,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    });

    res.json({
      status: 'queued',
      jobId: queueJob.id,
      dbJobId: job.id,
      schedule: schedule ? new Date(schedule).toISOString() : null,
      estimatedStart: schedule ? new Date(schedule) : new Date(),
      speed
    });

  } catch (err) {
    console.error('Error in /broadcast/template:', err);
    res.status(500).json({ error: err.message });
  }
});

// Listen on all interfaces for production (so 3004.bulumerak.com works)
app.listen(3004, '0.0.0.0', () => {
  console.log('Broadcast server running on port 3004');
}); 