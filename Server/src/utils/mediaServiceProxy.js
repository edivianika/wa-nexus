/**
 * mediaServiceProxy.js
 * 
 * A middleware service that provides enhanced reliability when accessing media
 * for broadcast, drip campaigns, and scheduled messages.
 */

import mediaService from '../services/mediaService.js';
import mediaCacheService from '../services/mediaCacheService.js';
import { withDeduplication } from './messageDeduplicator.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import os from 'os';
import crypto from 'crypto';

// Circuit breaker for media requests
const circuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  fallbackFn: async (mediaUrl, assetId) => {
    console.warn(`[MediaServiceProxy] Circuit breaker activated for ${assetId ? `assetId: ${assetId}` : `url: ${mediaUrl}`}`);
    // Return null but don't throw, let the calling code handle fallback
    return null;
  }
};

// Active circuit breakers
const activeCircuitBreakers = new Map();

// In-memory cache
const MEDIA_CACHE = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Ensure temp directory exists
const TEMP_DIR = process.env.MEDIA_CACHE_DIR || path.join(os.tmpdir(), 'whatsapp-media-cache');
if (!fs.existsSync(TEMP_DIR)) {
  try {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  } catch (err) {
    console.error(`[MediaServiceProxy] Failed to create temp directory: ${err.message}`);
  }
}

/**
 * Get media with enhanced reliability through circuit breaker pattern
 * @param {string} mediaUrl - URL of the media
 * @param {string} assetId - ID of the asset in asset library
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Media info
 */
async function getMedia(mediaUrl, assetId = null, options = {}) {
  const cacheKey = assetId ? `asset:${assetId}` : `url:${mediaUrl}`;
  
  // Check memory cache first for quick response
  const cachedMedia = MEDIA_CACHE.get(cacheKey);
  if (cachedMedia && fs.existsSync(cachedMedia.path) && Date.now() - cachedMedia.timestamp < CACHE_TTL) {
    return cachedMedia;
  }
  
  let circuitBreaker = activeCircuitBreakers.get(cacheKey);

  // Initialize circuit breaker if not exists
  if (!circuitBreaker) {
    circuitBreaker = {
      failures: 0,
      lastFailure: null,
      isClosed: true
    };
    activeCircuitBreakers.set(cacheKey, circuitBreaker);
  }

  // Check if circuit is open
  if (!circuitBreaker.isClosed) {
    // Check if reset timeout has passed
    if (Date.now() - circuitBreaker.lastFailure > circuitBreakerConfig.resetTimeout) {
      // Reset circuit breaker to half-open state
      circuitBreaker.isClosed = true;
      circuitBreaker.failures = 0;
    } else {
      // Circuit is still open, use fallback
      return await tryFallbackMethods(mediaUrl, assetId);
    }
  }

  try {
    // Attempt to get media with deduplication
    const mediaInfo = await withDeduplication(
      `media:${cacheKey}`,
      async () => {
        try {
          // Try mediaCacheService first (more reliable)
          const media = await mediaCacheService.getMedia(mediaUrl, assetId);
          if (media && media.path && fs.existsSync(media.path)) {
            // Add to memory cache
            MEDIA_CACHE.set(cacheKey, {
              ...media,
              timestamp: Date.now()
            });
            return media;
          }
          
          // Fall back to mediaService if mediaCacheService fails
          const mediaServiceResult = await mediaService.getMedia(mediaUrl, assetId);
          if (mediaServiceResult && mediaServiceResult.path && fs.existsSync(mediaServiceResult.path)) {
            // Add to memory cache
            MEDIA_CACHE.set(cacheKey, {
              ...mediaServiceResult,
              timestamp: Date.now()
            });
            return mediaServiceResult;
          }
          
          // If both failed, try fallback methods
          return await tryFallbackMethods(mediaUrl, assetId);
        } catch (error) {
          console.error(`[MediaServiceProxy] Error in mediaCacheService: ${error.message}`);
          // If mediaCacheService fails, try regular mediaService as fallback
          try {
            const mediaServiceResult = await mediaService.getMedia(mediaUrl, assetId);
            if (mediaServiceResult && mediaServiceResult.path) {
              return mediaServiceResult;
            }
          } catch (mediaServiceError) {
            console.error(`[MediaServiceProxy] MediaService fallback also failed: ${mediaServiceError.message}`);
          }
          
          // If all methods fail, try direct download as last resort
          return await tryFallbackMethods(mediaUrl, assetId);
        }
      },
      30000 // 30 second timeout
    );

    // If successful, reset failures
    if (mediaInfo && mediaInfo.path) {
      circuitBreaker.failures = 0;
      return mediaInfo;
    } else {
      throw new Error('Media info or path is null');
    }
  } catch (error) {
    // Track failure
    circuitBreaker.failures++;
    circuitBreaker.lastFailure = Date.now();
    console.error(`[MediaServiceProxy] Media fetch error (failures: ${circuitBreaker.failures}): ${error.message}`);

    // Open circuit if threshold reached
    if (circuitBreaker.failures >= circuitBreakerConfig.failureThreshold) {
      circuitBreaker.isClosed = false;
    }

    // Try fallback methods as last resort
    return await tryFallbackMethods(mediaUrl, assetId);
  }
}

/**
 * Try alternative methods to retrieve media when primary methods fail
 * @param {string} mediaUrl - URL of the media
 * @param {string} assetId - ID of the asset
 * @returns {Promise<Object|null>} - Media info or null if all methods fail
 */
async function tryFallbackMethods(mediaUrl, assetId) {
  try {
    // Method 1: If we have an assetId, try direct database query
    if (assetId) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
        );
        
        // Try to get asset info from database
        const { data: asset } = await supabase
          .from('asset_library')
          .select('*')
          .eq('id', assetId)
          .single();
        
        if (asset) {
          // If we have a direct URL in the asset record, use it
          if (asset.url) {
            return await downloadFromUrl(asset.url, assetId, asset.mime_type, asset.filename);
          }
          
          // If we have storage path, try direct download
          if (asset.storage_path) {
            const bucketName = asset.bucket_name || 'whatsapp-assets';
            const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucketName}/${encodeURIComponent(asset.storage_path)}`;
            return await downloadFromUrl(publicUrl, assetId, asset.mime_type, asset.filename);
          }
        }
      } catch (dbError) {
        console.error(`[MediaServiceProxy] Database fallback failed: ${dbError.message}`);
      }
    }
    
    // Method 2: If we have a mediaUrl, try direct download
    if (mediaUrl) {
      return await downloadFromUrl(mediaUrl);
    }
    
    // All methods failed
    return null;
  } catch (error) {
    console.error(`[MediaServiceProxy] All fallback methods failed: ${error.message}`);
    return null;
  }
}

/**
 * Download media from URL and save to temp file
 * @param {string} url - URL to download from
 * @param {string} assetId - Optional asset ID for naming
 * @param {string} mimeType - Optional MIME type
 * @param {string} filename - Optional filename
 * @returns {Promise<Object|null>} - Media info or null if download fails
 */
async function downloadFromUrl(url, assetId = null, mimeType = null, filename = null) {
  try {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'WhatsApp-Media-Service/1.0'
      }
    });
    
    if (response.status !== 200 || !response.data) {
      throw new Error(`Invalid response: ${response.status}`);
    }
    
    // Determine MIME type from response if not provided
    const contentType = mimeType || response.headers['content-type'] || 'application/octet-stream';
    
    // Determine filename and extension
    let finalFilename = filename;
    if (!finalFilename) {
      try {
        const urlObj = new URL(url);
        finalFilename = path.basename(urlObj.pathname);
      } catch (e) {
        finalFilename = `file_${Date.now()}`;
      }
    }
    
    // Add extension based on MIME type if missing
    const ext = path.extname(finalFilename) || getExtensionFromMime(contentType);
    if (!path.extname(finalFilename)) {
      finalFilename += ext;
    }
    
    // Generate temp file path
    const tempPath = path.join(TEMP_DIR, `${assetId ? `asset_${assetId}` : `url_${Date.now()}`}${ext}`);
    
    // Save to temp file
    await fs.promises.writeFile(tempPath, response.data);
    
    // Create and return media info
    const mediaInfo = {
      path: tempPath,
      mimeType: contentType,
      filename: finalFilename,
      timestamp: Date.now(),
      source: 'direct_download',
      assetId
    };
    
    // Add to memory cache if we have a key
    if (assetId) {
      MEDIA_CACHE.set(`asset:${assetId}`, mediaInfo);
    } else if (url) {
      const urlHash = crypto.createHash('md5').update(url).digest('hex');
      MEDIA_CACHE.set(`url:${urlHash}`, mediaInfo);
    }
    
    return mediaInfo;
  } catch (error) {
    console.error(`[MediaServiceProxy] Direct download failed: ${error.message}`);
    return null;
  }
}

/**
 * Get file extension from MIME type
 * @param {string} mimeType - MIME type
 * @returns {string} - File extension with dot
 */
function getExtensionFromMime(mimeType) {
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
 * Verify if media is accessible without downloading
 * @param {string} mediaUrl - URL of the media
 * @param {string} assetId - ID of the asset
 * @returns {Promise<boolean>} Whether media is accessible
 */
async function verifyMediaAccess(mediaUrl, assetId = null) {
  try {
    const cacheKey = assetId ? `asset:${assetId}` : `url:${mediaUrl}`;
    
    // Check memory cache first
    const cachedMedia = MEDIA_CACHE.get(cacheKey);
    if (cachedMedia && fs.existsSync(cachedMedia.path)) {
      return true;
    }
    
    // Use existing circuit breaker state if available
    const circuitBreaker = activeCircuitBreakers.get(cacheKey);
    if (circuitBreaker && !circuitBreaker.isClosed) {
      return false;
    }

    // Use withDeduplication to avoid redundant checks
    const isAccessible = await withDeduplication(
      `verify:${cacheKey}`,
      async () => {
        try {
          // Try mediaCacheService first
          const media = await mediaCacheService.getMedia(mediaUrl, assetId);
          if (media && media.path && fs.existsSync(media.path)) {
            return true;
          }
          
          // Fall back to mediaService if mediaCacheService fails
          return await mediaService.verifyMediaAccess(mediaUrl, assetId);
        } catch (error) {
          console.warn(`[MediaServiceProxy] Media verification failed: ${error.message}`);
          
          // Try a HEAD request as last resort
          if (mediaUrl) {
            try {
              const response = await axios({
                method: 'HEAD',
                url: mediaUrl,
                timeout: 5000
              });
              return response.status === 200;
            } catch (headError) {
              return false;
            }
          }
          
          return false;
        }
      },
      15000 // 15 second timeout for verification
    );

    return isAccessible;
  } catch (error) {
    console.warn(`[MediaServiceProxy] Error verifying media: ${error.message}`);
    return false;
  }
}

/**
 * Create a new asset entry in asset_library
 * @param {Object} mediaData - Media data for new asset
 * @returns {Promise<Object>} Created asset
 */
async function createAssetEntry(mediaData) {
  try {
    return await mediaService.createAssetEntry(mediaData);
  } catch (error) {
    console.error(`[MediaServiceProxy] Error creating asset: ${error.message}`);
    throw error;
  }
}

/**
 * Pre-cache media for upcoming broadcasts
 * @param {Array} jobs - Array of jobs with mediaUrl or assetId
 * @returns {Promise<Object>} Results of pre-caching
 */
async function preloadMediaForJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return { success: false, message: 'No jobs to preload' };
  }

  const results = {
    total: jobs.length,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  const mediaToLoad = new Map();

  // Deduplicate media URLs/assetIds
  for (const job of jobs) {
    if (job.type !== 'media') {
      results.skipped++;
      continue;
    }

    const cacheKey = job.asset_id ? `asset:${job.asset_id}` : (job.mediaUrl ? `url:${job.mediaUrl}` : null);
    if (!cacheKey) {
      results.skipped++;
      continue;
    }

    mediaToLoad.set(cacheKey, { mediaUrl: job.mediaUrl, assetId: job.asset_id });
  }

  // Load media in parallel with concurrency control
  const concurrencyLimit = 3; // Load 3 media items at a time
  const mediaEntries = Array.from(mediaToLoad.entries());
  const chunks = [];
  
  for (let i = 0; i < mediaEntries.length; i += concurrencyLimit) {
    chunks.push(mediaEntries.slice(i, i + concurrencyLimit));
  }

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async ([cacheKey, { mediaUrl, assetId }]) => {
      try {
        await getMedia(mediaUrl, assetId);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          mediaUrl,
          assetId,
          error: error.message
        });
      }
    }));
  }

  return results;
}

export default {
  getMedia,
  verifyMediaAccess,
  createAssetEntry,
  preloadMediaForJobs,
  downloadFromUrl
}; 