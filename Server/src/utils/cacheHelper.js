/**
 * Utility untuk mengelola cache Redis pada aplikasi
 * Menyediakan fungsi-fungsi untuk menyimpan, mengambil, dan menghapus cache
 */

import redisClient from './redisConfig.js';
import { supabase, supabaseAdmin } from './supabaseClient.js';
import fetch from 'node-fetch';
import { loggerUtils as logger } from './logger.js';

// Konstanta untuk format key cache
const CACHE_KEYS = {
  API_KEY: 'drip:apikey:',
  MESSAGES: 'drip:messages:',
  CAMPAIGN: 'drip:campaign:',
  CAMPAIGN_STATUS: 'drip:campaign:status:'
};

// TTL dalam detik
const TTL = {
  API_KEY: 3600, // 1 jam
  MESSAGES: 900, // 15 menit
  CAMPAIGN: 1800, // 30 menit
  CAMPAIGN_STATUS: 300 // 5 menit
};

/**
 * Hapus cache pesan untuk campaign tertentu
 * @param {string} campaignId - ID kampanye
 * @returns {Promise<void>}
 */
async function invalidateCampaignCache(campaignId) {
  if (!campaignId) return;
  
  const messagesKey = `${CACHE_KEYS.MESSAGES}${campaignId}`;
  const campaignKey = `${CACHE_KEYS.CAMPAIGN}${campaignId}`;
  
  try {
    await redisClient.del(messagesKey);
    await redisClient.del(campaignKey);
    console.log(`[CacheHelper] Invalidated cache for campaign ${campaignId}`);
  } catch (error) {
    console.error(`[CacheHelper] Error invalidating cache for campaign ${campaignId}:`, error);
  }
}

/**
 * Hapus cache API key untuk connection tertentu
 * @param {string} connectionId - ID koneksi
 * @returns {Promise<void>}
 */
async function invalidateApiKeyCache(connectionId) {
  if (!connectionId) return;
  
  const apiKeyKey = `${CACHE_KEYS.API_KEY}${connectionId}`;
  
  try {
    await redisClient.del(apiKeyKey);
    console.log(`[CacheHelper] Invalidated API key cache for connection ${connectionId}`);
  } catch (error) {
    console.error(`[CacheHelper] Error invalidating API key cache for connection ${connectionId}:`, error);
  }
}

/**
 * Simpan data ke Redis cache dengan TTL
 * @param {string} key - Key cache
 * @param {any} data - Data yang akan disimpan
 * @param {number} ttl - TTL dalam detik
 * @returns {Promise<void>}
 */
async function setCache(key, data, ttl) {
  try {
    const value = typeof data === 'string' ? data : JSON.stringify(data);
    await redisClient.set(key, value, 'EX', ttl);
  } catch (error) {
    console.error(`[CacheHelper] Error setting cache for key ${key}:`, error);
  }
}

/**
 * Ambil data dari Redis cache
 * @param {string} key - Key cache
 * @param {boolean} parse - Apakah hasil perlu di-parse sebagai JSON
 * @returns {Promise<any>} - Data dari cache atau null jika tidak ada
 */
async function getCache(key, parse = true) {
  try {
    const data = await redisClient.get(key);
    if (!data) return null;
    
    if (parse) {
      try {
        // Coba parse sebagai JSON
        return JSON.parse(data);
      } catch (e) {
        // Jika gagal, kemungkinan itu adalah string biasa (misalnya: "Active")
        // Kembalikan data mentah dalam kasus ini.
        return data;
      }
    }
    
    // Jika parse=false, kembalikan data mentah
    return data;
  } catch (error) {
    // Log error asli jika terjadi masalah koneksi Redis, dll.
    console.error(`[CacheHelper] Error getting cache for key ${key}:`, error);
    return null;
  }
}

/**
 * Mendapatkan status kampanye dengan caching
 * @param {string} campaignId - ID kampanye
 * @returns {Promise<string|null>} - Status kampanye atau null jika tidak ditemukan
 */
async function getCampaignStatus(campaignId) {
  if (!campaignId) return null;
  
  try {
    // Coba dapatkan dari cache terlebih dahulu
    const cacheKey = `${CACHE_KEYS.CAMPAIGN_STATUS}${campaignId}`;
    const cachedStatus = await getCache(cacheKey);
    
    if (cachedStatus) {
      logger.debug(`[CacheHelper] Using cached status for campaign ${campaignId}: ${cachedStatus}`);
      return cachedStatus;
    }
    
    // Jika tidak ada di cache, ambil dari database
    try {
      const { data, error } = await supabase
        .from('drip_campaigns')
        .select('status')
        .eq('id', campaignId)
        .single();
      
      if (error) {
        logger.error(`[CacheHelper] Supabase error fetching campaign status: ${error.message}`);
        
        // PERBAIKAN: Langsung kembalikan 'Active' jika Supabase error
        logger.info(`[CacheHelper] Using default 'Active' status due to Supabase error`);
        return 'Active';
      }
      
      if (!data) {
        logger.warn(`[CacheHelper] Campaign ${campaignId} not found`);
        return null;
      }
      
      // Cache status untuk beberapa menit
      try {
        await setCache(cacheKey, data.status, TTL.CAMPAIGN_STATUS);
      } catch (cacheError) {
        logger.error(`[CacheHelper] Error caching campaign status: ${cacheError.message}`);
        // Lanjutkan meskipun gagal cache
      }
      
      return data.status;
    } catch (supabaseError) {
      logger.error(`[CacheHelper] Error fetching campaign status: ${supabaseError.message}`);
      
      // PERBAIKAN: Jika terjadi error koneksi, gunakan status default
      return 'Active'; // Default ke Active untuk mencegah pesan tertunda
    }
  } catch (error) {
    logger.error(`[CacheHelper] Error in getCampaignStatus: ${error.message}`);
    return 'Active'; // PERBAIKAN: Default ke Active untuk mencegah pesan tertunda
  }
}

export {
  CACHE_KEYS,
  TTL,
  invalidateCampaignCache,
  invalidateApiKeyCache,
  setCache,
  getCache,
  getCampaignStatus
}; 