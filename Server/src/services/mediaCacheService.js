/**
 * mediaCacheService.js
 * Enhanced service for managing media cache, particularly for broadcast messages
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import os from 'os';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Cache configuration
const MEDIA_CACHE_DIR = process.env.MEDIA_CACHE_DIR || path.join(__dirname, '../../temp/media-cache');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const DEBUG = process.env.DEBUG_MEDIA_SERVICE === 'true' || false;

// In-memory cache
const MEDIA_CACHE = new Map();

// Utility functions
function log(message, level = 'info') {
  const prefix = '[MediaCacheService]';
  if (level === 'info' && DEBUG) {
    console.log(`${prefix} ${message}`);
  } else if (level === 'error') {
    console.error(`${prefix} ${message}`);
  } else if (level === 'warn') {
    console.warn(`${prefix} ${message}`);
  } else if (level === 'debug' && DEBUG) {
    console.log(`${prefix} DEBUG: ${message}`);
  }
}

// Create cache directory if it doesn't exist
function ensureCacheDirectory() {
if (!fs.existsSync(MEDIA_CACHE_DIR)) {
    try {
  fs.mkdirSync(MEDIA_CACHE_DIR, { recursive: true });
      log(`Created cache directory: ${MEDIA_CACHE_DIR}`, 'info');
      return true;
    } catch (err) {
      log(`Failed to create cache directory: ${err.message}`, 'error');
      
      // Try fallback directory in system temp
      const tmpDir = path.join(os.tmpdir(), 'whatsapp-media-cache');
      try {
        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir, { recursive: true });
        }
        // Update global cache dir
        process.env.MEDIA_CACHE_DIR = tmpDir;
        log(`Using fallback cache directory: ${tmpDir}`, 'warn');
        return true;
      } catch (tmpErr) {
        log(`Failed to create fallback cache directory: ${tmpErr.message}`, 'error');
        return false;
      }
    }
  }
  return true;
}

// Generate cache key
function generateCacheKey(mediaUrl, assetId) {
  if (assetId) {
    return `asset:${assetId}`;
  }
  if (mediaUrl) {
    return `url:${crypto.createHash('md5').update(mediaUrl).digest('hex')}`;
  }
  throw new Error('Either mediaUrl or assetId must be provided');
}

// Guess extension from MIME type
function guessExtension(mimeType) {
  if (!mimeType) return '.bin';
  
  const mimeMap = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/3gpp': '.3gp',
    'audio/mp3': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  };
  
  return mimeMap[mimeType.toLowerCase()] || '.bin';
}

/**
 * Get media from asset library or URL with enhanced reliability
 * @param {string} mediaUrl - URL of the media (optional if assetId is provided)
 * @param {string} assetId - ID of the asset in asset_library (optional if mediaUrl is provided) 
 * @returns {Promise<Object>} - Object with media information
 */
async function getMedia(mediaUrl, assetId) {
  try {
    // Validate input
    if (!mediaUrl && !assetId) {
      throw new Error('Either mediaUrl or assetId must be provided');
    }
    
    // Ensure cache directory exists
    ensureCacheDirectory();
    
    // Generate cache key
    const cacheKey = generateCacheKey(mediaUrl, assetId);
    
    // Check memory cache first
    const cachedMedia = MEDIA_CACHE.get(cacheKey);
    if (cachedMedia && fs.existsSync(cachedMedia.path)) {
      // Check if cache is still valid
      if (Date.now() - cachedMedia.timestamp < CACHE_TTL) {
        log(`Using cached media: ${cachedMedia.path}`, 'debug');
        return cachedMedia;
      }
      
      // Cache expired, remove from memory
      MEDIA_CACHE.delete(cacheKey);
      log(`Cache expired for: ${cachedMedia.path}`, 'debug');
    }
    
    // Try to get media
    let mediaInfo = null;
    
    // If assetId is provided, try to get from asset library first
      if (assetId) {
      log(`Attempting to download asset: ${assetId}`, 'debug');
      try {
        mediaInfo = await downloadFromAssetLibrary(assetId);
      } catch (assetErr) {
        log(`Error downloading from asset library: ${assetErr.message}`, 'warn');
        // Continue to try URL if provided
      }
    }
    
    // If mediaInfo is still null and mediaUrl is provided, try URL
    if (!mediaInfo && mediaUrl) {
      log(`Attempting to download from URL: ${mediaUrl}`, 'debug');
      try {
        mediaInfo = await downloadFromUrl(mediaUrl);
      } catch (urlErr) {
        log(`Error downloading from URL: ${urlErr.message}`, 'error');
        throw urlErr;
      }
    }
    
    if (!mediaInfo) {
      throw new Error('Failed to download media');
    }
    
    return mediaInfo;
  } catch (error) {
    log(`Error in getMedia: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Download media from asset library
 * @param {string} assetId - ID of the asset
 * @returns {Promise<Object>} - Object with media information
 */
async function downloadFromAssetLibrary(assetId) {
  try {
    log(`Starting downloadFromAssetLibrary for assetId: ${assetId}`, 'debug');
    // Cek apakah media sudah ada di cache lokal terlebih dahulu
    const cacheKey = generateCacheKey(null, assetId);
    
    // Cek di memory cache
    if (MEDIA_CACHE.has(cacheKey)) {
      const cachedMedia = MEDIA_CACHE.get(cacheKey);
      if (fs.existsSync(cachedMedia.path)) {
        log(`Using cached media for asset ${assetId} from ${cachedMedia.path}`, 'info');
        return cachedMedia;
      } else {
        log(`Cached media file not found on disk: ${cachedMedia.path}`, 'warn');
        // Hapus dari cache jika file tidak ada di disk
        MEDIA_CACHE.delete(cacheKey);
      }
    }
    
    // Cek di filesystem cache
    const possibleExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt'];
    log(`Checking filesystem cache for asset ${assetId} with possible extensions`, 'debug');
    for (const ext of possibleExtensions) {
      const cachePath = path.join(MEDIA_CACHE_DIR, `asset_${assetId}${ext}`);
      if (fs.existsSync(cachePath)) {
        log(`Found media in filesystem cache: ${cachePath}`, 'info');
        
        // Coba tebak MIME type dari ekstensi
        const mimeType = getMimeTypeFromExtension(ext);
        
        const mediaInfo = {
          path: cachePath,
          mimeType,
          filename: `asset_${assetId}${ext}`,
          timestamp: Date.now(),
          source: 'asset_library_fs_cache',
          assetId
        };
        
        // Simpan ke memory cache
        MEDIA_CACHE.set(cacheKey, mediaInfo);
        
        return mediaInfo;
      }
    }
    
    // Jika tidak ada di cache, ambil informasi asset dari database
    log(`Asset not found in cache, querying database for asset ${assetId}`, 'debug');
    const { data: asset, error } = await supabase
          .from('asset_library')
      .select('*')
          .eq('id', assetId)
          .single();
    
    if (error) {
      log(`Database error fetching asset: ${error.message}`, 'error');
      return createPlaceholderAsset(assetId);
    }
    
    if (!asset) {
      log(`Asset not found: ${assetId}`, 'error');
      return createPlaceholderAsset(assetId);
    }
    
    log(`Asset found in database: ${JSON.stringify({
      id: asset.id,
      filename: asset.filename,
      mime_type: asset.mime_type,
      storage_path: asset.storage_path,
      bucket_name: asset.bucket_name || 'not specified'
    })}`, 'debug');
    
    if (!asset.storage_path) {
      log(`Asset has no storage_path: ${assetId}`, 'error');
      return createPlaceholderAsset(assetId);
    }
    
    // Coba metode yang paling sering berhasil terlebih dahulu
    
    // 1. Coba download langsung dari storage
    try {
      const bucketName = asset.bucket_name || 'whatsapp-assets';
      log(`Attempting direct storage download for ${bucketName}/${asset.storage_path}`, 'info');
      
          const { data: fileData, error: downloadError } = await supabase.storage
        .from(bucketName)
            .download(asset.storage_path);
        
          if (!downloadError && fileData) {
        log(`Direct download successful, creating local file`, 'info');
        // Create local temp file from the downloaded data
        const extension = path.extname(asset.filename || '') || guessExtension(asset.mime_type);
        const cachePath = path.join(MEDIA_CACHE_DIR, `asset_${assetId}${extension}`);
        
        // Save to cache
        await fs.promises.writeFile(cachePath, await fileData.arrayBuffer());
        log(`Saved directly downloaded asset to cache: ${cachePath}`, 'info');
        
        // Create media info object
        const mediaInfo = {
          path: cachePath,
          mimeType: asset.mime_type || 'application/octet-stream',
          filename: asset.filename || `asset_${assetId}${extension}`,
          timestamp: Date.now(),
          source: 'asset_library_direct',
          assetId
        };
        
        // Add to memory cache
        MEDIA_CACHE.set(cacheKey, mediaInfo);
        
        return mediaInfo;
      }
    } catch (directErr) {
      log(`Direct storage access failed: ${directErr.message}`, 'warn');
    }
    
    // 2. Coba mendapatkan content dari database
    try {
      log(`Trying to get asset content from database for ${assetId}`, 'info');
      const { data: contentData, error: contentError } = await supabase
        .from('asset_library')
        .select('content, mime_type, filename')
        .eq('id', assetId)
        .single();
        
      if (!contentError && contentData && contentData.content) {
        log(`Found content in database for ${assetId}, creating local file`, 'info');
        // Create local temp file from the base64 content
        const extension = path.extname(contentData.filename || '') || guessExtension(contentData.mime_type);
        const cachePath = path.join(MEDIA_CACHE_DIR, `asset_${assetId}${extension}`);
        
        // Convert base64 to buffer and save to cache
        const buffer = Buffer.from(contentData.content, 'base64');
        await fs.promises.writeFile(cachePath, buffer);
        log(`Saved asset from database content to cache: ${cachePath}`, 'info');
        
        // Create media info object
        const mediaInfo = {
              path: cachePath,
          mimeType: contentData.mime_type || 'application/octet-stream',
          filename: contentData.filename || `asset_${assetId}${extension}`,
          timestamp: Date.now(),
          source: 'asset_library_database',
          assetId
        };
        
        // Add to memory cache
        MEDIA_CACHE.set(cacheKey, mediaInfo);
        
        return mediaInfo;
      }
    } catch (dbErr) {
      log(`Database content retrieval failed: ${dbErr.message}`, 'warn');
    }
    
    // 3. Coba mendapatkan signed URL
    try {
      const bucketName = asset.bucket_name || 'whatsapp-assets';
      log(`Attempting to get signed URL for asset ${assetId}`, 'info');
      
      const { data: urlData, error: urlError } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(asset.storage_path, 60);
      
      if (!urlError && urlData && urlData.signedUrl) {
        log(`Successfully got signed URL for ${assetId}`, 'info');
        
        // Download the file
        try {
          const response = await axios({
            method: 'GET',
            url: urlData.signedUrl,
            responseType: 'arraybuffer',
            timeout: 30000
          });
          
          if (response.status === 200 && response.data) {
            // Get file extension
            const extension = path.extname(asset.filename || '') || guessExtension(asset.mime_type);
            const cachePath = path.join(MEDIA_CACHE_DIR, `asset_${assetId}${extension}`);
            
            // Save to cache
            await fs.promises.writeFile(cachePath, response.data);
            log(`Saved asset to cache: ${cachePath}`, 'info');
            
            // Create media info object
            const mediaInfo = {
              path: cachePath,
              mimeType: asset.mime_type || 'application/octet-stream',
              filename: asset.filename || `asset_${assetId}${extension}`,
              timestamp: Date.now(),
              source: 'asset_library_signed_url',
              assetId
            };
            
            // Add to memory cache
            MEDIA_CACHE.set(cacheKey, mediaInfo);
            
            return mediaInfo;
          }
        } catch (downloadErr) {
          log(`Error downloading from signed URL: ${downloadErr.message}`, 'warn');
          }
        }
    } catch (signedUrlError) {
      log(`Exception getting signed URL: ${signedUrlError.message}`, 'warn');
    }
    
    // Jika semua metode gagal, buat placeholder
    return createPlaceholderAsset(assetId, asset);
    
  } catch (error) {
    log(`Error in downloadFromAssetLibrary: ${error.message}`, 'error');
    return createPlaceholderAsset(assetId);
  }
}

/**
 * Create a placeholder asset when all methods fail
 * @param {string} assetId - Asset ID
 * @param {Object} assetInfo - Optional asset info from database
 * @returns {Object} Placeholder media info
 */
async function createPlaceholderAsset(assetId, assetInfo = null) {
  try {
    log(`Creating placeholder for asset ${assetId}`, 'warn');
    
    // Get mime type and extension
    const mimeType = assetInfo?.mime_type || 'image/png';
    const extension = assetInfo?.filename ? path.extname(assetInfo.filename) : 
                     (mimeType.startsWith('image/') ? '.png' : '.bin');
    
    const cachePath = path.join(MEDIA_CACHE_DIR, `asset_${assetId}_placeholder${extension}`);
    
    // Create a minimal valid file based on mime type
    let placeholderData;
    if (mimeType.startsWith('image/')) {
      // Create a 1x1 transparent PNG
      placeholderData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    } else {
      // Create an empty file
      placeholderData = Buffer.from('');
    }
    
    await fs.promises.writeFile(cachePath, placeholderData);
    log(`Created placeholder file for ${assetId}: ${cachePath}`, 'warn');
    
    // Create media info object
    const mediaInfo = {
      path: cachePath,
      mimeType: mimeType,
      filename: assetInfo?.filename || `asset_${assetId}${extension}`,
      timestamp: Date.now(),
      source: 'asset_library_placeholder',
      assetId,
      isPlaceholder: true
    };
    
    // Add to memory cache
    MEDIA_CACHE.set(generateCacheKey(null, assetId), mediaInfo);
    
    return mediaInfo;
  } catch (placeholderErr) {
    log(`Failed to create placeholder: ${placeholderErr.message}`, 'error');
    return null;
  }
}

/**
 * Get MIME type from file extension
 * @param {string} extension - File extension with dot (e.g. '.jpg')
 * @returns {string} MIME type
 */
function getMimeTypeFromExtension(extension) {
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv': 'text/csv',
    '.txt': 'text/plain'
  };
  
  return mimeMap[extension.toLowerCase()] || 'application/octet-stream';
}

/**
 * Download media from URL
 * @param {string} mediaUrl - URL of the media
 * @returns {Promise<Object>} - Object with media information
 */
async function downloadFromUrl(mediaUrl) {
  try {
    // Download the file
    const response = await axios({
      method: 'GET',
      url: mediaUrl,
        responseType: 'arraybuffer',
        timeout: 30000
      });
    
    if (response.status !== 200 || !response.data) {
      log(`Invalid response when downloading URL: ${response.status}`, 'error');
      return null;
    }
    
    // Get MIME type
    const mimeType = response.headers['content-type'] || 'application/octet-stream';
    
    // Get filename from URL or generate one
    let filename = path.basename(new URL(mediaUrl).pathname) || `file_${Date.now()}`;
    
    // Add extension if missing
    if (!path.extname(filename)) {
      filename += guessExtension(mimeType);
    }
    
    // Generate cache path
    const cacheKey = generateCacheKey(mediaUrl, null);
    const cachePath = path.join(MEDIA_CACHE_DIR, `${cacheKey.replace('url:', '')}${path.extname(filename)}`);
    
    // Save to cache
    await fs.promises.writeFile(cachePath, response.data);
    log(`Saved URL to cache: ${cachePath}`, 'debug');
    
    // Create media info object
    const mediaInfo = {
      path: cachePath,
      mimeType,
      filename,
      timestamp: Date.now(),
      source: 'url',
      mediaUrl
    };
    
    // Add to memory cache
    MEDIA_CACHE.set(cacheKey, mediaInfo);
    
    return mediaInfo;
    } catch (error) {
    log(`Error in downloadFromUrl: ${error.message}`, 'error');
      throw error;
    }
  }

/**
 * Clean up expired cache files
 */
async function cleanupCache() {
    try {
    if (!fs.existsSync(MEDIA_CACHE_DIR)) return;
    
    const now = Date.now();
      const files = await fs.promises.readdir(MEDIA_CACHE_DIR);
    
    let deletedCount = 0;
      for (const file of files) {
      try {
        const filePath = path.join(MEDIA_CACHE_DIR, file);
        const stats = await fs.promises.stat(filePath);
        
        // Check if file is older than TTL
        if (now - stats.mtime.getTime() > CACHE_TTL) {
          await fs.promises.unlink(filePath);
          deletedCount++;
      }
      } catch (fileErr) {
        log(`Error processing cache file: ${fileErr.message}`, 'warn');
      }
    }
    
    if (deletedCount > 0) {
      log(`Cleaned up ${deletedCount} expired cache files`, 'info');
    }
  } catch (error) {
    log(`Error in cleanupCache: ${error.message}`, 'error');
    }
  }

// Run initial cleanup
cleanupCache();

// Schedule cleanup to run every hour
setInterval(cleanupCache, 60 * 60 * 1000);

export default {
  getMedia,
  cleanupCache,
  ensureCacheDirectory
}; 