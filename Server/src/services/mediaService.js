/**
 * mediaService.js
 * Service for handling media downloads and caching
 */

import mediaCacheService from './mediaCacheService.js';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for asset access
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Debug flag
const DEBUG = process.env.DEBUG_MEDIA_SERVICE === 'true' || false;

/**
 * Get media file information
 * @param {string} mediaUrl - URL of media to download (optional if assetId is provided)
 * @param {string} assetId - ID of asset in asset_library (optional if mediaUrl is provided)
 * @param {boolean} forceRefresh - Force refresh the cache
 * @returns {Promise<Object>} Media information including local path
   */
async function getMedia(mediaUrl, assetId = null, forceRefresh = false) {
    try {
    console.log(`[MediaService] Getting media: assetId=${assetId}, url=${mediaUrl ? mediaUrl.substring(0, 30) + '...' : 'null'}`);

    // Validate inputs
      if (!mediaUrl && !assetId) {
        throw new Error('Either mediaUrl or assetId must be provided');
      }

    // Use enhanced media cache service
    return await mediaCacheService.getMedia(mediaUrl, assetId);
    } catch (error) {
    console.error(`[MediaService] Error in getMedia: ${error.message}`, error);
      throw error;
    }
  }

  /**
 * Create a media entry in asset_library
 * @param {Object} mediaData - Media data to store
 * @returns {Promise<Object>} Created asset information
 */
async function createAssetEntry(mediaData) {
    try {
    if (!mediaData || !mediaData.userId || !mediaData.filePath || !mediaData.mimeType) {
      throw new Error('Invalid media data');
  }

    // Create asset entry in database
    const { data: asset, error } = await supabase
        .from('asset_library')
      .insert({
        user_id: mediaData.userId,
        filename: path.basename(mediaData.filePath),
        original_filename: mediaData.originalFilename || path.basename(mediaData.filePath),
        content_hash: mediaData.contentHash || Date.now().toString(),
        storage_path: mediaData.storagePath,
        asset_type: getAssetTypeFromMimeType(mediaData.mimeType),
        mime_type: mediaData.mimeType,
        size_bytes: mediaData.sizeBytes || 0,
        width: mediaData.width,
        height: mediaData.height,
        duration: mediaData.duration,
        tags: mediaData.tags || []
      })
      .select()
        .single();
      
    if (error) {
      console.error(`[MediaService] Failed to create asset entry: ${error.message}`);
      throw error;
    }
    
    return asset;
    } catch (error) {
    console.error(`[MediaService] Error creating asset entry: ${error.message}`);
      throw error;
    }
  }

  /**
 * Get asset type from MIME type
 * @param {string} mimeType - MIME type
 * @returns {string} Asset type
 */
function getAssetTypeFromMimeType(mimeType) {
  if (!mimeType) return 'document';
  
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
    
  return 'document';
  }

  /**
 * Verify media exists and is accessible
 * @param {string} mediaUrl - URL of the media
 * @param {string} assetId - ID of the asset
 * @returns {Promise<boolean>} Whether media is accessible
 */
async function verifyMediaAccess(mediaUrl, assetId = null) {
  try {
    const media = await getMedia(mediaUrl, assetId);
    return !!media && fs.existsSync(media.path);
    } catch (error) {
    console.warn(`[MediaService] Media verification failed: ${error.message}`);
    return false;
  }
}

export default {
  getMedia,
  createAssetEntry,
  verifyMediaAccess
}; 