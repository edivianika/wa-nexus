import { Worker } from 'bullmq';
import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { dripQueue, addDripJob } from './dripQueue.js';
import redisConfig from '../utils/redisConfig.js';
import { CACHE_KEYS, TTL, getCache, setCache, getCampaignStatus, invalidateCampaignCache } from '../utils/cacheHelper.js';
import { createClient } from '@supabase/supabase-js';
import { getConnectionManager } from '../utils/connectionManagerSingleton.js';
import path from 'path';
import mediaService from '../services/mediaService.js';

import 'dotenv/config';

// Inisialisasi Supabase client secara langsung untuk memastikan konsistensi
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Default rate limit jika tidak ditentukan di database
const DEFAULT_RATE_LIMIT = {
  max: 10,           // 10 pesan per window
  duration: 60000,   // 60 detik (1 menit),
  initialBackoff: 5000, // Backoff awal jika terkena rate limit (5 detik)
};

// Kontrol level logging
const DEBUG = process.env.DEBUG_DRIP_WORKER === 'true' || false; // Set to false by default

// Fungsi logging yang memperhatikan DEBUG mode
function logInfo(message) {
  if (DEBUG) {
    console.log(`[DripWorker] ${message}`);
  }
}

function logError(message) {
  console.error(`[DripWorker] ${message}`);
}

function logWarning(message) {
  console.warn(`[DripWorker] ${message}`);
}

// Cache untuk rate limit settings
const rateLimitCache = new Map();

// Circuit breaker untuk connection yang kena rate limit
const CONNECTION_COOLDOWNS = new Map();

// Fungsi untuk memeriksa dan mendapatkan status cooldown sebuah connection
async function getConnectionCooldown(connectionId) {
  const cooldown = CONNECTION_COOLDOWNS.get(connectionId);

  if (!cooldown) return null;

  // Jika waktu cooldown sudah lewat, hapus dari map
  if (Date.now() > cooldown.expiry) {
    CONNECTION_COOLDOWNS.delete(connectionId);
    logInfo(`Cooldown berakhir untuk connection ${connectionId}`);
    return null;
  }

  // Return informasi cooldown jika masih berlaku
  return cooldown;
}

// Fungsi untuk menandai connection dalam cooldown
function setCooldownForConnection(connectionId, durationSeconds) {
  // Default 2 menit jika tidak ditentukan
  const cooldownDuration = durationSeconds > 0 ? durationSeconds : 120;
  const expiry = Date.now() + (cooldownDuration * 1000);

  logInfo(`Setting cooldown untuk connection ${connectionId} selama ${cooldownDuration} detik`);

  CONNECTION_COOLDOWNS.set(connectionId, {
    expiry,
    remainingSeconds: () => Math.ceil((expiry - Date.now()) / 1000)
  });
}

// Fungsi untuk mendapatkan API key dengan Redis caching
async function getApiKeyFromConnectionId(connectionId) {
  if (!connectionId) return null;

  // Coba dapatkan API key dari Redis cache
  const cacheKey = `${CACHE_KEYS.API_KEY}${connectionId}`;
  const cachedApiKey = await getCache(cacheKey, false);

  if (cachedApiKey) {
    logInfo(`Using Redis-cached API key for connection ${connectionId}`);
    return cachedApiKey;
  }

  // Jika tidak ada di cache, ambil dari database
  const { data, error } = await supabase.from('connections').select('api_key').eq('id', connectionId).single();
  if (error) {
    logError(`Error fetching API key for connection ${connectionId}: ${error.message}`);
    return null;
  }

  const apiKey = data ? data.api_key : null;
  if (apiKey) {
    logInfo(`Caching API key in Redis for connection ${connectionId}`);
    // Simpan ke Redis cache dengan TTL
    await setCache(cacheKey, apiKey, TTL.API_KEY);
  }

  return apiKey;
}

// Fungsi untuk mendapatkan rate limit settings dari database atau cache
async function getRateLimitSettings(campaignId) {
  // Cek cache dulu untuk performa
  if (rateLimitCache.has(campaignId)) {
    return rateLimitCache.get(campaignId);
  }

  try {
    // Ambil dari database
    const { data, error } = await supabase
      .from('drip_campaigns')
      .select('message_rate_limit, rate_limit_window')
      .eq('id', campaignId)
      .single();

    if (error || !data) {
      logInfo(`Couldn't fetch rate limit settings for campaign ${campaignId}, using defaults`);
      return DEFAULT_RATE_LIMIT;
    }

    const settings = {
      max: data.message_rate_limit || DEFAULT_RATE_LIMIT.max,
      duration: data.rate_limit_window || DEFAULT_RATE_LIMIT.duration,
    };

    // Simpan di cache untuk 5 menit
    rateLimitCache.set(campaignId, settings);

    // Set timeout untuk menghapus dari cache setelah 5 menit
    setTimeout(() => {
      rateLimitCache.delete(campaignId);
    }, 5 * 60 * 1000);

    return settings;
  } catch (err) {
    logError(`Error fetching rate limit settings: ${err.message}`);
    return DEFAULT_RATE_LIMIT;
  }
}

// Fungsi untuk mengambil semua pesan kampanye sekaligus dengan Redis caching
async function getCampaignMessages(campaignId) {
  // Cek Redis cache terlebih dahulu
  const cacheKey = `${CACHE_KEYS.MESSAGES}${campaignId}`;
  const cachedMessages = await getCache(cacheKey);

  if (cachedMessages) {
    logInfo(`Using Redis-cached messages for campaign ${campaignId}`);
    return cachedMessages;
  }

  // Jika tidak ada di cache, ambil dari database
  const { data: messages, error } = await supabase
    .from('drip_messages')
    .select('*')
    .eq('drip_campaign_id', campaignId)
    .order('message_order', { ascending: true });

  if (error) {
    logError(`Error fetching messages for campaign ${campaignId}: ${error.message}`);
    return [];
  }

  if (messages && messages.length > 0) {
    logInfo(`Caching ${messages.length} messages in Redis for campaign ${campaignId}`);
    // Simpan ke Redis cache dengan TTL
    await setCache(cacheKey, messages, TTL.MESSAGES);
  }

  return messages || [];
}

/**
 * Memperkaya metadata subscriber dengan data kontak dari database
 * @param {object} subscriber - Objek subscriber
 * @returns {Promise<object>} - Metadata yang diperkaya
 */
async function enrichSubscriberMetadata(subscriber) {
  try {
    // Start with existing metadata or empty object
    let enrichedMetadata = subscriber.metadata || {};

    logInfo(`[DripWorker] Starting metadata enrichment. Subscriber has contact_ref_id: ${subscriber.contact_ref_id || 'none'}, contact_id: ${subscriber.contact_id || 'none'}`);

    // If subscriber has contact_ref_id, fetch contact data
    if (subscriber.contact_ref_id) {
      logInfo(`[DripWorker] Fetching contact data for contact_ref_id: ${subscriber.contact_ref_id}`);
      const { data: contactData, error: contactError } = await supabase
        .from('contacts')
        .select('contact_name, phone_number, email, notes, contact_detail')
        .eq('id', subscriber.contact_ref_id)
        .single();

      if (!contactError && contactData) {
        // Merge contact_detail (JSONB) into metadata if it exists
        let contactDetailData = {};
        if (contactData.contact_detail) {
          // Handle JSONB - could be object, string, or null
          if (typeof contactData.contact_detail === 'string') {
            try {
              contactDetailData = JSON.parse(contactData.contact_detail);
            } catch (parseError) {
              logWarning(`[DripWorker] Failed to parse contact_detail as JSON: ${parseError.message}`);
              contactDetailData = {};
            }
          } else if (typeof contactData.contact_detail === 'object' && contactData.contact_detail !== null) {
            // JSONB from Supabase is already an object, use it directly
            contactDetailData = contactData.contact_detail;
          }

          if (contactDetailData && typeof contactDetailData === 'object') {
            const keys = Object.keys(contactDetailData);
            logInfo(`[DripWorker] Found contact_detail (JSONB) with ${keys.length} keys: ${keys.join(', ')}`);
            // Log sample values for debugging (including empty strings)
            keys.slice(0, 5).forEach(key => {
              const val = contactDetailData[key];
              logInfo(`[DripWorker]   ${key} = "${val}" (type: ${typeof val}, isString: ${typeof val === 'string'}, isEmpty: ${val === ''})`);
            });
          } else {
            logWarning(`[DripWorker] contact_detail is not a valid object: ${typeof contactDetailData}`);
            contactDetailData = {};
          }
        }

        // Flatten nested objects in contactDetailData to top level
        // This ensures all fields from contact_detail are accessible at top level (e.g., {{city}}, {{City}}, {{CITY}})
        // Case-insensitive: all variations will work
        const flattenedContactDetail = {};

        // For flat JSONB structure like { "city": "ini kota", "Title": "", "address": "", "birthday": "" }
        // All keys should be directly accessible at top level
        const flattenObject = (obj, prefix = '') => {
          if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
            logWarning(`[DripWorker] Cannot flatten: obj is ${typeof obj}, isArray: ${Array.isArray(obj)}`);
            return;
          }

          const keys = Object.keys(obj);
          logInfo(`[DripWorker] Flattening object with ${keys.length} keys, prefix: "${prefix || 'none'}"`);

          keys.forEach(key => {
            const value = obj[key];

            // Handle null, undefined - convert to empty string for template
            if (value === null || value === undefined) {
              // Still add the key even if value is null/undefined, but as empty string for template
              if (!prefix) {
                flattenedContactDetail[key] = '';
                logInfo(`[DripWorker] Added key "${key}" with empty string (was null/undefined)`);
              }
              if (prefix) {
                flattenedContactDetail[`${prefix}_${key}`] = '';
              }
              return;
            }

            // If value is a plain object (not array, not Date, etc.), recursively flatten it
            if (typeof value === 'object' &&
              !Array.isArray(value) &&
              value.constructor === Object &&
              Object.keys(value).length > 0) {
              // Recursively flatten nested objects
              logInfo(`[DripWorker] Recursively flattening nested object for key "${key}"`);
              flattenObject(value, prefix ? `${prefix}_${key}` : key);
            } else {
              // Primitive value (string including empty string "", number, boolean) or array
              // Add directly at top level - preserve original case from database
              // This allows {{city}}, {{City}}, {{CITY}} to work (case-insensitive matching in template processor)
              const topLevelKey = key;

              // Always add at top level (preserve original case from database)
              // Empty strings are valid and should be preserved
              flattenedContactDetail[topLevelKey] = value;
              logInfo(`[DripWorker] Added key "${topLevelKey}" = "${value}" (type: ${typeof value})`);

              // Also add with prefix if exists (for nested access like {{address_city}})
              if (prefix) {
                flattenedContactDetail[`${prefix}_${key}`] = value;
              }
            }
          });
        };

        flattenObject(contactDetailData);

        const flattenedKeys = Object.keys(flattenedContactDetail);
        if (flattenedKeys.length > 0) {
          logInfo(`[DripWorker] Successfully flattened contact_detail to ${flattenedKeys.length} keys: ${flattenedKeys.join(', ')}`);
          // Log sample values for debugging (including empty strings)
          flattenedKeys.slice(0, 5).forEach(key => {
            const val = flattenedContactDetail[key];
            logInfo(`[DripWorker]   ${key} = "${val}" (type: ${typeof val}, empty: ${val === ''})`);
          });
        } else {
          logWarning(`[DripWorker] contact_detail exists but no keys were flattened.`);
          logWarning(`[DripWorker] contact_detail type: ${typeof contactData.contact_detail}, keys: ${contactData.contact_detail ? Object.keys(contactData.contact_detail).join(', ') : 'N/A'}`);
        }

        // Merge contact data into metadata with priority to database values
        enrichedMetadata = {
          // Start with existing metadata (lowest priority)
          ...enrichedMetadata,
          // Merge flattened contact_detail fields (like city, etc.) - has higher priority than existing metadata
          ...flattenedContactDetail,
          // Contact data from database (highest priority)
          contact_name: contactData.contact_name || enrichedMetadata.contact_name || enrichedMetadata.name || '',
          contact_phone: contactData.phone_number || subscriber.contact_id || '',
          contact_email: contactData.email || enrichedMetadata.email || '',
          contact_notes: contactData.notes || enrichedMetadata.notes || '',
          // Override with database values if they exist (database has priority)
          name: contactData.contact_name || enrichedMetadata.name || enrichedMetadata.contact_name || '',
          phone: contactData.phone_number || subscriber.contact_id || enrichedMetadata.phone || '',
        };

        // Log sample of enriched metadata for debugging
        const sampleKeys = ['city', 'address', 'company', 'profession', 'contact_name', 'name'];
        const sampleValues = sampleKeys.map(key => `${key}="${enrichedMetadata[key] || 'N/A'}"`).join(', ');
        logInfo(`[DripWorker] Enriched metadata: ${sampleValues}`);
      } else if (contactError) {
        logWarning(`[DripWorker] Could not fetch contact data for contact_ref_id ${subscriber.contact_ref_id}: ${contactError.message}`);
      }
    } else {
      // If no contact_ref_id, try to find contact by phone number
      if (subscriber.contact_id) {
        logInfo(`[DripWorker] No contact_ref_id, trying to find contact by phone: ${subscriber.contact_id}`);
        const { data: contactData, error: contactError } = await supabase
          .from('contacts')
          .select('contact_name, phone_number, email, notes, contact_detail, id')
          .eq('phone_number', subscriber.contact_id)
          .maybeSingle();

        if (!contactError && contactData) {
          // Merge contact_detail (JSONB) into metadata if it exists
          let contactDetailData = {};
          if (contactData.contact_detail) {
            // Handle JSONB - could be object, string, or null
            if (typeof contactData.contact_detail === 'string') {
              try {
                contactDetailData = JSON.parse(contactData.contact_detail);
              } catch (parseError) {
                logWarning(`[DripWorker] Failed to parse contact_detail as JSON: ${parseError.message}`);
                contactDetailData = {};
              }
            } else if (typeof contactData.contact_detail === 'object' && contactData.contact_detail !== null) {
              // JSONB from Supabase is already an object, use it directly
              contactDetailData = contactData.contact_detail;
            }

            if (contactDetailData && typeof contactDetailData === 'object') {
              const keys = Object.keys(contactDetailData);
              logInfo(`[DripWorker] Found contact_detail (JSONB) with ${keys.length} keys: ${keys.join(', ')}`);
              // Log sample values for debugging (including empty strings)
              keys.slice(0, 5).forEach(key => {
                const val = contactDetailData[key];
                logInfo(`[DripWorker]   ${key} = "${val}" (type: ${typeof val}, isString: ${typeof val === 'string'}, isEmpty: ${val === ''})`);
              });
            } else {
              logWarning(`[DripWorker] contact_detail is not a valid object: ${typeof contactDetailData}`);
              contactDetailData = {};
            }
          }

          // Flatten nested objects in contactDetailData to top level
          // This ensures all fields from contact_detail are accessible at top level (e.g., {{city}}, {{City}}, {{CITY}})
          // Case-insensitive: all variations will work
          const flattenedContactDetail = {};

          // For flat JSONB structure like { "city": "ini kota", "Title": "", "address": "", "birthday": "" }
          // All keys should be directly accessible at top level
          const flattenObject = (obj, prefix = '') => {
            if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
              logWarning(`[DripWorker] Cannot flatten: obj is ${typeof obj}, isArray: ${Array.isArray(obj)}`);
              return;
            }

            const keys = Object.keys(obj);
            logInfo(`[DripWorker] Flattening object with ${keys.length} keys, prefix: "${prefix || 'none'}"`);

            keys.forEach(key => {
              const value = obj[key];

              // Handle null, undefined - convert to empty string for template
              if (value === null || value === undefined) {
                // Still add the key even if value is null/undefined, but as empty string for template
                if (!prefix) {
                  flattenedContactDetail[key] = '';
                  logInfo(`[DripWorker] Added key "${key}" with empty string (was null/undefined)`);
                }
                if (prefix) {
                  flattenedContactDetail[`${prefix}_${key}`] = '';
                }
                return;
              }

              // If value is a plain object (not array, not Date, etc.), recursively flatten it
              if (typeof value === 'object' &&
                !Array.isArray(value) &&
                value.constructor === Object &&
                Object.keys(value).length > 0) {
                // Recursively flatten nested objects
                logInfo(`[DripWorker] Recursively flattening nested object for key "${key}"`);
                flattenObject(value, prefix ? `${prefix}_${key}` : key);
              } else {
                // Primitive value (string including empty string "", number, boolean) or array
                // Add directly at top level - preserve original case from database
                // This allows {{city}}, {{City}}, {{CITY}} to work (case-insensitive matching in template processor)
                const topLevelKey = key;

                // Always add at top level (preserve original case from database)
                // Empty strings are valid and should be preserved
                flattenedContactDetail[topLevelKey] = value;
                logInfo(`[DripWorker] Added key "${topLevelKey}" = "${value}" (type: ${typeof value})`);

                // Also add with prefix if exists (for nested access like {{address_city}})
                if (prefix) {
                  flattenedContactDetail[`${prefix}_${key}`] = value;
                }
              }
            });
          };

          flattenObject(contactDetailData);

          const flattenedKeys = Object.keys(flattenedContactDetail);
          if (flattenedKeys.length > 0) {
            logInfo(`[DripWorker] Successfully flattened contact_detail to ${flattenedKeys.length} keys: ${flattenedKeys.join(', ')}`);
            // Log sample values for debugging (including empty strings)
            flattenedKeys.slice(0, 5).forEach(key => {
              const val = flattenedContactDetail[key];
              logInfo(`[DripWorker]   ${key} = "${val}" (type: ${typeof val}, empty: ${val === ''})`);
            });
          } else {
            logWarning(`[DripWorker] contact_detail exists but no keys were flattened.`);
            logWarning(`[DripWorker] contact_detail type: ${typeof contactData.contact_detail}, keys: ${contactData.contact_detail ? Object.keys(contactData.contact_detail).join(', ') : 'N/A'}`);
          }

          enrichedMetadata = {
            // Start with existing metadata (lowest priority)
            ...enrichedMetadata,
            // Merge flattened contact_detail fields (like city, etc.) - has higher priority than existing metadata
            ...flattenedContactDetail,
            // Contact data from database (highest priority)
            contact_name: contactData.contact_name || enrichedMetadata.contact_name || enrichedMetadata.name || '',
            contact_phone: contactData.phone_number || subscriber.contact_id || '',
            contact_email: contactData.email || enrichedMetadata.email || '',
            contact_notes: contactData.notes || enrichedMetadata.notes || '',
            name: contactData.contact_name || enrichedMetadata.name || enrichedMetadata.contact_name || '',
            phone: contactData.phone_number || subscriber.contact_id || enrichedMetadata.phone || '',
          };

          // Log sample of enriched metadata for debugging
          const sampleKeys = ['city', 'address', 'company', 'profession', 'contact_name', 'name'];
          const sampleValues = sampleKeys.map(key => `${key}="${enrichedMetadata[key] || 'N/A'}"`).join(', ');
          logInfo(`[DripWorker] Found contact by phone, enriched metadata: ${sampleValues}`);
        } else if (contactError) {
          logWarning(`[DripWorker] Could not find contact by phone ${subscriber.contact_id}: ${contactError.message}`);
        } else {
          logInfo(`[DripWorker] No contact found in database for phone ${subscriber.contact_id}`);
        }
      }
    }

    // Ensure contact_name is available (fallback to name or empty string)
    if (!enrichedMetadata.contact_name && enrichedMetadata.name) {
      enrichedMetadata.contact_name = enrichedMetadata.name;
      logInfo(`[DripWorker] Set contact_name from name: "${enrichedMetadata.contact_name}"`);
    }
    if (!enrichedMetadata.name && enrichedMetadata.contact_name) {
      enrichedMetadata.name = enrichedMetadata.contact_name;
      logInfo(`[DripWorker] Set name from contact_name: "${enrichedMetadata.name}"`);
    }

    // Log final metadata summary (always log, not just in DEBUG mode)
    const metadataKeys = Object.keys(enrichedMetadata);
    logInfo(`[DripWorker] Final enriched metadata has ${metadataKeys.length} keys`);

    // Log important keys for debugging
    const importantKeys = ['city', 'address', 'company', 'profession', 'contact_name', 'name', 'phone', 'email'];
    const importantValues = importantKeys
      .filter(key => enrichedMetadata.hasOwnProperty(key))
      .map(key => `${key}="${enrichedMetadata[key]}"`)
      .join(', ');
    if (importantValues) {
      logInfo(`[DripWorker] Important metadata values: ${importantValues}`);
    }

    // Log all keys in DEBUG mode
    if (DEBUG) {
      logInfo(`[DripWorker] All metadata keys: ${metadataKeys.join(', ')}`);
      logInfo(`[DripWorker] Full enriched metadata: ${JSON.stringify(enrichedMetadata, null, 2)}`);
    }

    return enrichedMetadata;
  } catch (error) {
    logError(`[DripWorker] Error enriching subscriber metadata: ${error.message}`);
    logError(`[DripWorker] Error stack: ${error.stack}`);
    // Return original metadata if enrichment fails
    return subscriber.metadata || {};
  }
}

/**
 * Mencari value di metadata dengan case-insensitive
 * @param {object} metadata - Objek metadata
 * @param {string} key - Key yang dicari (case-insensitive)
 * @returns {any} - Value yang ditemukan atau undefined
 */
function findMetadataValueCaseInsensitive(metadata, key) {
  if (!metadata || typeof metadata !== 'object') return undefined;

  // Coba exact match dulu (prioritas tertinggi)
  if (metadata.hasOwnProperty(key)) {
    return metadata[key];
  }

  // Coba case-insensitive match
  const lowerKey = key.toLowerCase();
  const foundKey = Object.keys(metadata).find(k => k.toLowerCase() === lowerKey);

  if (foundKey) {
    return metadata[foundKey];
  }

  // Support nested keys dengan dot notation (case-insensitive)
  const parts = key.split('.');
  if (parts.length > 1) {
    let current = metadata;
    for (const part of parts) {
      if (!current || typeof current !== 'object') return undefined;

      // Coba exact match
      if (current.hasOwnProperty(part)) {
        current = current[part];
        continue;
      }

      // Coba case-insensitive match
      const lowerPart = part.toLowerCase();
      const foundPart = Object.keys(current).find(k => k.toLowerCase() === lowerPart);
      if (foundPart) {
        current = current[foundPart];
      } else {
        return undefined;
      }
    }
    return current;
  }

  return undefined;
}

/**
 * Memproses template pesan dengan menggantikan placeholder {{key}} dengan nilai dari metadata subscriber
 * Case-insensitive untuk key matching
 * @param {string} messageTemplate - Pesan template dengan format {{key}}
 * @param {object} metadata - Objek metadata subscriber
 * @returns {string} - Pesan yang sudah diproses
 */
function processMessageTemplate(messageTemplate, metadata = {}) {
  if (!messageTemplate) return '';

  // Jika metadata null atau undefined, gunakan objek kosong
  const subscriberMetadata = metadata || {};

  // Pattern untuk mendeteksi placeholder dalam format {{key}}
  const placeholderPattern = /{{([^{}]+)}}/g;

  // Track placeholders yang tidak ditemukan untuk logging
  const missingPlaceholders = new Set();

  // Replace semua placeholder dengan nilai dari metadata
  const processedMessage = messageTemplate.replace(placeholderPattern, (match, key) => {
    // Trim whitespace dari key
    const trimmedKey = key.trim();

    // Cari value dengan case-insensitive matching
    let value;
    try {
      value = findMetadataValueCaseInsensitive(subscriberMetadata, trimmedKey);
    } catch (error) {
      logWarning(`[DripWorker] Error accessing metadata key '${trimmedKey}': ${error.message}`);
      value = undefined;
    }

    // Jika key tidak ditemukan, kembalikan string kosong
    if (value !== undefined && value !== null) {
      const stringValue = String(value);
      if (DEBUG) {
        logInfo(`[DripWorker] Template replacement: {{${trimmedKey}}} -> "${stringValue}"`);
      }
      return stringValue;
    }

    // Track missing placeholder
    missingPlaceholders.add(trimmedKey);

    // Log warning untuk placeholder yang tidak ditemukan
    if (DEBUG) {
      logWarning(`[DripWorker] Template placeholder '${trimmedKey}' not found in metadata. Available keys: ${Object.keys(subscriberMetadata).slice(0, 10).join(', ')}...`);
    }

    return ''; // Return empty string if not found
  });

  // Log summary jika ada placeholder yang tidak ditemukan
  if (missingPlaceholders.size > 0) {
    logWarning(`[DripWorker] ${missingPlaceholders.size} placeholder(s) not found: ${Array.from(missingPlaceholders).join(', ')}`);
    logInfo(`[DripWorker] Available metadata keys: ${Object.keys(subscriberMetadata).join(', ')}`);
  }

  return processedMessage;
}

// Fungsi pengiriman pesan, dirombak total untuk mengirim secara langsung
async function sendWhatsAppMessageDirectly({ to, message, type, media_url, caption, connectionId, metadata, asset_id }) {
  try {
    const connectionManager = getConnectionManager();
    let connection = connectionManager.getConnection(connectionId);

    // Retry mechanism for connection
    if (!connection || !connection.socket) {
      logWarning(`[DripWorker] Connection ${connectionId} not immediately available. Retrying...`);
      let retries = 3;
      while (retries > 0) {
        await sleep(2000); // Wait 2 seconds
        connection = connectionManager.getConnection(connectionId);
        if (connection && connection.socket) {
          logInfo(`[DripWorker] Connection ${connectionId} found after retry.`);
          break;
        }
        retries--;
      }
    }

    if (!connection || !connection.socket) {
      logError(`[DripWorker] Connection ${connectionId} not found or not ready after retries.`);
      return { success: false, status: 'CONNECTION_NOT_READY' };
    }

    // Log template processing
    logInfo(`[DripWorker] Processing message template. Original: ${message ? message.substring(0, 100) + '...' : 'null'}`);
    logInfo(`[DripWorker] Metadata keys available: ${Object.keys(metadata || {}).join(', ')}`);

    const processedMessage = processMessageTemplate(message, metadata);
    logInfo(`[DripWorker] Processed message: ${processedMessage ? processedMessage.substring(0, 100) + '...' : 'null'}`);

    const processedCaption = caption ? processMessageTemplate(caption, metadata) : undefined;
    if (caption) {
      logInfo(`[DripWorker] Processing caption template. Original: ${caption.substring(0, 50) + '...'}`);
      logInfo(`[DripWorker] Processed caption: ${processedCaption ? processedCaption.substring(0, 50) + '...' : 'null'}`);
    }

    const recipient = to.includes('@') ? to : `${to}@s.whatsapp.net`;

    // Determine if media is needed: must have either asset_id or media_url, AND type must indicate media
    const isMediaType = (type === 'media' || type === 'image' || type === 'video' || type === 'audio' || type === 'document');
    // Check if asset_id or media_url exists (handle null, undefined, empty string)
    const hasAssetId = asset_id && asset_id.toString().trim() !== '';
    const hasMediaUrl = media_url && media_url.toString().trim() !== '';
    const hasMediaSource = hasAssetId || hasMediaUrl;
    const mediaNeeded = isMediaType && hasMediaSource;

    // If type indicates media but no media source, log warning and send as text
    if (isMediaType && !hasMediaSource) {
      logWarning(`[DripWorker] Message type is '${type}' but no asset_id or media_url provided. Sending as text message instead.`);
      // Continue to text message handling below - don't return here
    }

    // Handle media messages
    if (mediaNeeded) {
      // Fetch media
      logInfo(`[DripWorker] Preparing to send media message. Type: ${type}, AssetID: ${asset_id || 'null'}, URL: ${media_url ? media_url.substring(0, 50) + '...' : 'null'}`);
      try {
        // Double-check validation (should not reach here if hasMediaSource is false, but just in case)
        if (!hasAssetId && !hasMediaUrl) {
          logError(`[DripWorker] Media message requires either asset_id or media_url`);
          return { success: false, status: 'MEDIA_ERROR', error: 'Missing asset_id or media_url' };
        }

        // Use the validated values
        const effectiveAssetId = hasAssetId ? asset_id : null;
        const effectiveMediaUrl = hasMediaUrl ? media_url : null;

        const mediaInfo = await mediaService.getMedia(effectiveMediaUrl, effectiveAssetId);

        if (!mediaInfo || !mediaInfo.path) {
          logError(`[DripWorker] Media not found or no path returned. AssetID: ${asset_id}, URL: ${media_url ? media_url.substring(0, 50) : 'null'}`);
          return { success: false, status: 'MEDIA_NOT_FOUND', error: 'Media info or path is missing' };
        }

        // Check if this is a placeholder (should not be sent)
        if (mediaInfo.isPlaceholder) {
          logError(`[DripWorker] Media is a placeholder and cannot be sent. AssetID: ${asset_id}`);
          return { success: false, status: 'MEDIA_ERROR', error: 'Media is a placeholder and cannot be sent' };
        }

        // Check if file exists
        if (!fs.existsSync(mediaInfo.path)) {
          logError(`[DripWorker] Media file not found at path: ${mediaInfo.path}`);
          return { success: false, status: 'MEDIA_FILE_NOT_FOUND', error: `File not found at path: ${mediaInfo.path}` };
        }

        // Check file stats and validate file
        let fileStats;
        try {
          fileStats = fs.statSync(mediaInfo.path);
          if (fileStats.size === 0) {
            logError(`[DripWorker] Media file is empty: ${mediaInfo.path}`);
            return { success: false, status: 'MEDIA_ERROR', error: 'Media file is empty' };
          }
        } catch (statError) {
          logError(`[DripWorker] Cannot access media file stats: ${statError.message}`);
          return { success: false, status: 'MEDIA_ERROR', error: `Cannot access file: ${statError.message}` };
        }

        // Read file buffer
        let buffer;
        try {
          buffer = fs.readFileSync(mediaInfo.path);
          if (!buffer || buffer.length === 0) {
            logError(`[DripWorker] Media buffer is empty or invalid`);
            return { success: false, status: 'MEDIA_ERROR', error: 'Media buffer is empty' };
          }
        } catch (readError) {
          logError(`[DripWorker] Failed to read media file: ${readError.message}`);
          return { success: false, status: 'MEDIA_ERROR', error: `Failed to read file: ${readError.message}` };
        }

        // Validate mimeType
        const mimeType = mediaInfo.mimeType || 'application/octet-stream';
        if (!mimeType || mimeType === 'application/octet-stream') {
          logWarning(`[DripWorker] MIME type is missing or generic, defaulting to document`);
        }

        // Determine media type for socket
        let mediaType = 'document';
        if (mimeType.startsWith('image')) mediaType = 'image';
        else if (mimeType.startsWith('video')) mediaType = 'video';
        else if (mimeType.startsWith('audio')) mediaType = 'audio';

        // Generate filename if missing
        let fileName = mediaInfo.filename;
        if (!fileName) {
          const extension = mimeType.split('/')[1] || 'bin';
          fileName = `file.${extension}`;
        }

        // Create payload
        const payload = {
          [mediaType]: buffer,
          mimetype: mimeType,
          fileName: fileName
        };

        if (processedCaption) payload.caption = processedCaption;

        logInfo(`[DripWorker] Sending ${mediaType} to ${recipient}. File: ${fileName}, Size: ${buffer.length} bytes, MIME: ${mimeType}`);

        // Send with mediaPath option
        try {
          await connection.socket.sendMessage(recipient, payload, { mediaPath: mediaInfo.path });
          logInfo(`[DripWorker] Successfully sent media message to ${recipient}`);
          return { success: true, status: 'SENT' };
        } catch (socketError) {
          logError(`[DripWorker] Failed to send media message: ${socketError.message}`);
          return { success: false, status: 'SOCKET_ERROR', error: socketError.message };
        }
      } catch (mediaError) {
        logError(`[DripWorker] General error in sendWhatsAppMessageDirectly: ${mediaError.message}`);
        logError(`[DripWorker] Error stack: ${mediaError.stack}`);
        return { success: false, status: 'MEDIA_ERROR', error: mediaError.message };
      }
    } else {
      // Text message
      if (!processedMessage || processedMessage.trim() === '') {
        logError(`[DripWorker] Attempted to send empty text message to ${recipient}. Halting.`);
        return { success: false, status: 'EMPTY_MESSAGE' };
      }
      try {
        await connection.socket.sendMessage(recipient, { text: processedMessage });
        logInfo(`[DripWorker] Successfully sent text message to ${recipient}`);
        return { success: true, status: 'SENT' };
      } catch (textError) {
        logError(`[DripWorker] Failed to send text message: ${textError.message}`);
        return { success: false, status: 'TEXT_ERROR', error: textError.message };
      }
    }
  } catch (err) {
    logError(`[DripWorker] Failed to send message directly to ${to}: ${err.message}`);
    return { success: false, status: 'SEND_ERROR', error: err.message };
  }
}

const processDripJob = async (job) => {
  try {
    const { subscriberId, campaignId, messageOrder, connectionId } = job.data;
    console.log(`========================================`);
    console.log(`[DripWorker] 🔔 RECEIVED JOB: Processing job for subscriber ${subscriberId}, campaign ${campaignId}, message #${messageOrder}`);
    console.log(`[DripWorker] Job ID: ${job.id}, Connection ID: ${connectionId}`);
    console.log(`[DripWorker] Queue Name: ${job.queueName}, Queue Events: ${Object.keys(job.queue.eventNames())}`);
    console.log(`========================================`);

    logInfo(`Processing job for subscriber ${subscriberId}, campaign ${campaignId}, message #${messageOrder}`);

    // PERBAIKAN: Periksa circuit breaker untuk connection ini (sebelum melakukan apa-apa)
    if (connectionId) {
      const cooldown = await getConnectionCooldown(connectionId);
      if (cooldown) {
        const remainingTime = cooldown.remainingSeconds();
        logInfo(`Connection ${connectionId} sedang dalam cooldown (${remainingTime} detik tersisa)`);
        job.opts.delay = remainingTime * 1000; // Set delay sebesar waktu cooldown
        throw new Error(`Connection ${connectionId} sedang dalam cooldown. Retry dalam ${remainingTime} detik.`);
      }
    }

    // 0. Verifikasi status kampanye (hanya proses jika 'active')
    const campaignStatus = await getCampaignStatus(campaignId);

    if (campaignStatus !== 'Active') {
      logInfo(`Skipping job for campaign ${campaignId} with status '${campaignStatus || 'unknown'}' (not Active)`);
      return; // Keluar dengan tenang, jangan lempar error, hanya skip job
    }

    logInfo(`Campaign ${campaignId} is Active, continuing processing`);

    // 1. Ambil data subscriber
    let subscriber = null;
    try {
      logInfo(`[DripWorker] Fetching subscriber ${subscriberId} from database...`);
      const { data: subData, error: subError } = await supabase
        .from('drip_subscribers')
        .select('*')
        .eq('id', subscriberId)
        .maybeSingle(); // PERBAIKAN: Gunakan maybeSingle() untuk mencegah error jika tidak ada baris

      if (subError) {
        logError(`[DripWorker] Database error fetching subscriber ${subscriberId}: ${subError.message}`);
        logError(`[DripWorker] Error code: ${subError.code}, details: ${JSON.stringify(subError)}`);
        // Lempar error agar BullMQ mencoba lagi dengan backoff
        throw new Error(`Database error fetching subscriber ${subscriberId}. Will retry in 5 minutes.`);
      }

      if (!subData) {
        // Cek apakah subscriber mungkin dipindahkan atau dihapus
        logWarning(`[DripWorker] Subscriber with ID ${subscriberId} not found in database.`);
        logWarning(`[DripWorker] This could mean:`);
        logWarning(`[DripWorker]   1. Subscriber was deleted/unsubscribed after job was scheduled`);
        logWarning(`[DripWorker]   2. Subscriber was moved to a different campaign`);
        logWarning(`[DripWorker]   3. Database connection issue (unlikely with maybeSingle)`);

        // Cek apakah ada subscriber lain dengan campaign yang sama untuk debugging
        const { data: otherSubs, error: checkError } = await supabase
          .from('drip_subscribers')
          .select('id, contact_id, status, drip_campaign_id')
          .eq('drip_campaign_id', campaignId)
          .limit(5);

        if (!checkError && otherSubs) {
          logInfo(`[DripWorker] Found ${otherSubs.length} other subscribers in campaign ${campaignId} (for debugging)`);
        }

        // Job akan di-discard karena subscriber tidak ada
        logWarning(`[DripWorker] Job will be discarded. No retry needed.`);
        return; // Keluar dari job, jangan coba lagi
      }

      logInfo(`[DripWorker] Successfully fetched subscriber ${subscriberId}. Status: ${subData.status}, Campaign: ${subData.drip_campaign_id}`);
      subscriber = subData;

    } catch (error) {
      logError(`Error in processDripJob: ${error.message}`);
      logError(`Error stack: ${error.stack}`);
      // Pastikan error dilempar kembali agar BullMQ tahu job gagal
      throw error;
    }

    // Validate subscriber object
    if (!subscriber || typeof subscriber !== 'object') {
      logError(`[DripWorker] Invalid subscriber object: ${JSON.stringify(subscriber)}`);
      throw new Error(`Invalid subscriber data for subscriber ${subscriberId}`);
    }

    // Jika status subscriber bukan 'active', hentikan
    if (!subscriber.hasOwnProperty('status')) {
      logError(`[DripWorker] Subscriber ${subscriberId} missing 'status' property`);
      throw new Error(`Subscriber ${subscriberId} missing status property`);
    }

    if (subscriber.status !== 'active') {
      logInfo(`Subscriber ${subscriberId} is not active (status: ${subscriber.status}). Halting chain.`);
      return;
    }

    // Lanjutkan dengan proses pengiriman pesan
    await processSubscriberMessage(subscriber, campaignId, messageOrder, connectionId, job);

  } catch (error) {
    // Log error dan throw kembali untuk diproses oleh BullMQ
    logError(`Error in processDripJob: ${error.message}`);
    throw error;
  }
};

// Fungsi terpisah untuk memproses pesan subscriber
// Ini memudahkan penggunaan kembali kode untuk metode alternatif
async function processSubscriberMessage(subscriber, campaignId, messageOrder, connectionId, job) {
  // Validate inputs
  if (!subscriber || typeof subscriber !== 'object') {
    logError(`[DripWorker] Invalid subscriber in processSubscriberMessage: ${JSON.stringify(subscriber)}`);
    throw new Error('Invalid subscriber object');
  }

  if (!campaignId) {
    logError(`[DripWorker] Missing campaignId in processSubscriberMessage`);
    throw new Error('Missing campaignId');
  }

  if (!messageOrder && messageOrder !== 0) {
    logError(`[DripWorker] Missing messageOrder in processSubscriberMessage`);
    throw new Error('Missing messageOrder');
  }

  // try { // @dripWorker.js
  // 2. Ambil detail pesan menggunakan Redis cache
  const allMessages = await getCampaignMessages(campaignId);
  if (!allMessages || allMessages.length === 0) {
    logError(`No messages found for campaign ${campaignId}`);
    return;
  }

  // Cari pesan berdasarkan message_order
  const messageData = allMessages.find(msg =>
    String(msg.message_order) === String(messageOrder)
  );

  // Log message data untuk debugging
  if (messageData) {
    logInfo(`[DripWorker] Found message data: type=${messageData.type}, asset_id=${messageData.asset_id || 'null'}, media_url=${messageData.media_url ? messageData.media_url.substring(0, 50) + '...' : 'null'}`);

    // If message type is media but missing asset_id and media_url, try to refresh from database
    const isMediaType = (messageData.type === 'media' || messageData.type === 'image' || messageData.type === 'video' || messageData.type === 'audio' || messageData.type === 'document');
    if (isMediaType && !messageData.asset_id && !messageData.media_url) {
      logWarning(`[DripWorker] Message #${messageOrder} is media type but missing asset_id and media_url. Refreshing from database...`);

      // Bypass cache and fetch directly from database
      const { data: freshMessage, error: freshError } = await supabase
        .from('drip_messages')
        .select('*')
        .eq('id', messageData.id)
        .single();

      if (!freshError && freshMessage) {
        logInfo(`[DripWorker] Refreshed message data: asset_id=${freshMessage.asset_id || 'null'}, media_url=${freshMessage.media_url ? freshMessage.media_url.substring(0, 50) + '...' : 'null'}`);
        // Update messageData with fresh data
        Object.assign(messageData, freshMessage);

        // Invalidate cache to force refresh next time
        await invalidateCampaignCache(campaignId);
      } else if (freshError) {
        logError(`[DripWorker] Error refreshing message from database: ${freshError.message}`);
      }
    }
  }

  if (!messageData) {
    logError(`Message with order ${messageOrder} not found for campaign ${campaignId}`);

    // PERBAIKAN: Coba cari pesan dengan cara alternatif jika tidak ditemukan
    const sortedMessages = [...allMessages].sort((a, b) =>
      (parseInt(a.message_order) || Number.MAX_SAFE_INTEGER) -
      (parseInt(b.message_order) || Number.MAX_SAFE_INTEGER)
    );

    // Cari pesan dengan message_order terkecil yang lebih besar dari messageOrder saat ini
    const nextAvailableMessage = sortedMessages.find(msg =>
      (parseInt(msg.message_order) || 0) > parseInt(messageOrder)
    );

    if (nextAvailableMessage) {
      logWarning(`Message #${messageOrder} not found, but found next available message #${nextAvailableMessage.message_order}. Will use that instead.`);

      // Jadwalkan pesan berikutnya yang tersedia dengan delay minimal
      await addDripJob(
        {
          subscriberId: subscriber.id,
          campaignId: campaignId,
          messageOrder: nextAvailableMessage.message_order,
          connectionId: connectionId
        },
        {
          delay: 60000, // 1 menit delay
          jobId: `drip-sub${subscriber.id}-camp${campaignId}-msg${nextAvailableMessage.message_order}-recovery-${Date.now()}`,
        },
        1 // High priority untuk recovery
      );

      logInfo(`Recovery job scheduled for subscriber ${subscriber.id} with next available message #${nextAvailableMessage.message_order}`);
      return; // Keluar dari fungsi
    }

    return; // Tidak ada pesan yang ditemukan, keluar dari fungsi
  }

  // 3. Cek/lock drip_logs sebelum kirim
  const { data: existingLog, error: logCheckError } = await supabase
    .from('drip_logs')
    .select('id, status')
    .eq('drip_subscriber_id', subscriber.id)
    .eq('drip_message_id', messageData.id)
    .maybeSingle();

  if (existingLog && existingLog.status === 'sent') {
    logInfo(`Found existing 'sent' log for msg #${messageData.message_order} to sub ${subscriber.id}. Scheduling next message.`);

    // PERBAIKAN: Langsung jadwalkan pesan berikutnya jika pesan ini sudah pernah dikirim
    const nextMessageOrder = Number(messageOrder) + 1;
    const nextMessageData = allMessages.find(msg =>
      String(msg.message_order) === String(nextMessageOrder)
    );

    if (nextMessageData) {
      const delayInMs = Math.max(60000, nextMessageData.delay * 60 * 1000); // Minimal 1 menit
      logInfo(`Scheduling next message #${nextMessageOrder} for sub ${subscriber.id} with a delay of ${delayInMs / 60000} minutes.`);

      // Tentukan prioritas pesan berikutnya
      let messagePriority = 2; // Default NORMAL

      // Gunakan helper function dari dripQueue
      await addDripJob(
        {
          subscriberId: subscriber.id,
          campaignId: campaignId,
          messageOrder: nextMessageOrder,
          connectionId: connectionId // Penting untuk rate limiting
        },
        {
          delay: delayInMs,
          jobId: `drip-sub${subscriber.id}-camp${campaignId}-msg${nextMessageOrder}-${Date.now()}`, // PERBAIKAN: Tambahkan timestamp untuk mencegah duplikasi
        },
        messagePriority
      );
    }

    return; // Keluar dari fungsi karena pesan sudah dikirim
  }

  let sendSuccess = true; // Anggap sukses jika sudah pernah dikirim sebelumnya

  if (!existingLog) {
    logInfo(`No 'sent' log found for msg #${messageData.message_order}. Proceeding to send to ${subscriber.contact_id}.`);

    // 4. Kirim pesan
    // Buat worker lebih tangguh: ambil connection_id dari campaign jika tidak ada di subscriber
    let connectionId = subscriber.connection_id;
    if (!connectionId) {
      logInfo(`Subscriber ${subscriber.id} is missing connection_id. Fetching from campaign ${campaignId}...`);
      const { data: campaign, error: campError } = await supabase
        .from('drip_campaigns')
        .select('connection_id')
        .eq('id', campaignId)
        .single();

      if (campError || !campaign) {
        logError(`Could not fetch campaign ${campaignId} to find connection_id. Halting.`);
        return;
      }
      connectionId = campaign.connection_id;
    }

    // Periksa cooldown lagi setelah mendapatkan connectionId yang benar
    if (connectionId) {
      const cooldown = await getConnectionCooldown(connectionId);
      if (cooldown) {
        const remainingTime = cooldown.remainingSeconds();
        logInfo(`Connection ${connectionId} sedang dalam cooldown (${remainingTime} detik tersisa)`);
        job.opts.delay = remainingTime * 1000;
        throw new Error(`Connection ${connectionId} sedang dalam cooldown. Retry dalam ${remainingTime} detik.`);
      }
    }

    // Gunakan fungsi caching untuk API key (sekarang menggunakan Redis)
    const apiKey = await getApiKeyFromConnectionId(connectionId);
    if (!apiKey) {
      throw new Error(`[DripWorker] Could not get API key for connection ${connectionId}. Retrying job.`);
    }

    // Enrich subscriber metadata dengan data kontak dari database
    logInfo(`[DripWorker] Enriching metadata for subscriber ${subscriber.id}`);
    const enrichedMetadata = await enrichSubscriberMetadata(subscriber);
    logInfo(`[DripWorker] Enriched metadata keys: ${Object.keys(enrichedMetadata).join(', ')}`);

    // Log data sebelum mengirim
    logInfo(`[DripWorker] Sending message - Type: ${messageData.type}, AssetID: ${messageData.asset_id || 'null'}, MediaURL: ${messageData.media_url ? messageData.media_url.substring(0, 50) + '...' : 'null'}`);
    logInfo(`[DripWorker] Template message: ${messageData.message ? messageData.message.substring(0, 100) + '...' : 'null'}`);

    let sendResult;
    try {
      sendResult = await sendWhatsAppMessageDirectly({
        to: subscriber.contact_id,
        message: messageData.message,
        type: messageData.type,
        media_url: messageData.media_url || null,
        caption: messageData.caption || null,
        connectionId: connectionId,
        metadata: enrichedMetadata, // Use enriched metadata instead of raw metadata
        asset_id: messageData.asset_id || null,
      });
    } catch (sendError) {
      logError(`[DripWorker] Exception in sendWhatsAppMessageDirectly: ${sendError.message}`);
      logError(`[DripWorker] Error stack: ${sendError.stack}`);
      sendResult = { success: false, status: 'EXCEPTION_ERROR', error: sendError.message };
    }

    // Validate sendResult
    if (!sendResult || typeof sendResult !== 'object') {
      logError(`[DripWorker] Invalid sendResult returned: ${JSON.stringify(sendResult)}`);
      sendResult = { success: false, status: 'INVALID_RESULT', error: 'Invalid result from sendWhatsAppMessageDirectly' };
    }

    // Ensure sendResult has required properties
    if (!sendResult.hasOwnProperty('success')) {
      logError(`[DripWorker] sendResult missing 'success' property`);
      sendResult.success = false;
    }
    if (!sendResult.hasOwnProperty('status')) {
      logError(`[DripWorker] sendResult missing 'status' property`);
      sendResult.status = 'UNKNOWN_STATUS';
    }

    // Jika koneksi belum siap, jadwalkan ulang job dan keluar
    if (sendResult.status === 'CONNECTION_NOT_READY') {
      const requeueDelay = 30000; // 30 detik
      logWarning(`[DripWorker] Re-queueing job for sub ${subscriber.id} due to unavailable connection. Delay: ${requeueDelay}ms`);
      await addDripJob(job.data, { delay: requeueDelay }, job.opts.priority);
      return; // Keluar dari job ini dengan sukses, karena sudah di-requeue
    }

    sendSuccess = sendResult.success === true;

    // 5. Log hasil pengiriman, APAPUN hasilnya
    const logEntry = {
      drip_campaign_id: campaignId,
      drip_message_id: messageData.id,
      contact_id: subscriber.contact_id,
      drip_subscriber_id: subscriber.id,
      status: sendSuccess ? 'sent' : 'failed',
      sent_at: new Date().toISOString(),
      error_message: sendSuccess ? null : `Failed with status: ${sendResult.status || 'UNKNOWN'}${sendResult.error ? ` - ${sendResult.error}` : ''}`,
      message_content: messageData.message
    };

    try {
      await supabase.from('drip_logs').insert(logEntry);
    } catch (logError) {
      logError(`Failed to insert log entry: ${logError.message}`);
      // Lanjutkan meskipun gagal insert log
    }

  } else {
    logInfo(`Found existing log for msg #${messageData.message_order} to sub ${subscriber.id}. Skipping send.`);
  }

  if (!sendSuccess) {
    logError(`Failed to send message #${messageOrder} to ${subscriber.contact_id}. Halting chain for this subscriber.`);
    // Tidak melempar error agar tidak memicu retry BullMQ untuk kasus yang sudah ditangani (e.g., MEDIA_NOT_FOUND)
    return;
  }

  // 6. Update status subscriber dan jadwalkan pesan berikutnya
  logInfo(`Updating subscriber ${subscriber.id} status after sending message #${messageOrder}`);
  try {
    const { error: updateError } = await supabase
      .from('drip_subscribers')
      .update({
        last_message_sent_at: new Date().toISOString(),
        last_message_order_sent: messageOrder
      })
      .eq('id', subscriber.id);

    if (updateError) {
      // PERBAIKAN: Log error dengan lebih detail
      logError(`Failed to update subscriber status for sub ID ${subscriber.id}: ${updateError.message}`);
      // Lanjutkan meskipun gagal update, ini tidak seharusnya menghentikan chain
    } else {
      logInfo(`Successfully updated subscriber status for sub ID ${subscriber.id}`);
    }
  } catch (updateError) {
    logError(`Critical error when updating subscriber status for sub ID ${subscriber.id}: ${updateError.message}`);
    // Lanjutkan meskipun gagal update status
  }

  // 7. Chaining: Jadwalkan pesan berikutnya
  const nextMessageOrder = Number(messageOrder) + 1;

  // Verifikasi status kampanye lagi sebelum jadwalkan pesan berikutnya
  // Ini mencegah penjadwalan pesan baru jika status kampanye berubah
  const currentStatus = await getCampaignStatus(campaignId);
  if (currentStatus !== 'Active') {
    logInfo(`Campaign ${campaignId} status changed to '${currentStatus || 'unknown'}'. Stopping message chain.`);
    return;
  }

  // Cari pesan berikutnya menggunakan cache yang sudah diambil
  logInfo(`Searching for next message with order ${nextMessageOrder} in campaign ${campaignId}`);
  const nextMessageData = allMessages.find(msg =>
    String(msg.message_order) === String(nextMessageOrder)
  );

  if (nextMessageData) {
    logInfo(`Next message found: ID ${nextMessageData.id}, Order ${nextMessageData.message_order}`);
    // PERBAIKAN: Pastikan delay tidak terlalu pendek
    const requestedDelay = nextMessageData.delay * 60 * 1000;
    const delayInMs = Math.max(60000, requestedDelay); // Minimal 1 menit

    logInfo(`Scheduling next message #${nextMessageOrder} for sub ${subscriber.id} with a delay of ${delayInMs / 60000} minutes.`);

    // Tentukan prioritas pesan berikutnya
    const { data: campaign, error: campError } = await supabase
      .from('drip_campaigns')
      .select('priority')
      .eq('id', campaignId)
      .single();

    let messagePriority = 2; // Default NORMAL
    if (!campError && campaign) {
      if (campaign.priority === 'high') {
        messagePriority = 1; // HIGH
      } else if (campaign.priority === 'low') {
        messagePriority = 3; // LOW
      }
    } else if (campError) {
      logWarning(`Could not fetch campaign priority for campaign ${campaignId}: ${campError.message}. Using default priority.`);
    }

    try {
      // PERBAIKAN: Validasi subscriber masih ada sebelum menjadwalkan job berikutnya
      const { data: verifySub, error: verifyError } = await supabase
        .from('drip_subscribers')
        .select('id, status')
        .eq('id', subscriber.id)
        .single();

      if (verifyError || !verifySub) {
        logWarning(`[DripWorker] Subscriber ${subscriber.id} no longer exists. Skipping next message scheduling.`);
        return; // Keluar tanpa menjadwalkan job berikutnya
      }

      if (verifySub.status !== 'active') {
        logInfo(`[DripWorker] Subscriber ${subscriber.id} status is '${verifySub.status}', not 'active'. Skipping next message scheduling.`);
        return; // Keluar tanpa menjadwalkan job berikutnya
      }

      // PERBAIKAN: Tambahkan try-catch untuk menangkap error penjadwalan
      // Gunakan helper function dari dripQueue
      await addDripJob(
        {
          subscriberId: subscriber.id,
          campaignId: campaignId,
          messageOrder: nextMessageOrder,
          connectionId: connectionId // Penting untuk rate limiting
        },
        {
          delay: delayInMs,
          jobId: `drip-sub${subscriber.id}-camp${campaignId}-msg${nextMessageOrder}-${Date.now()}`, // PERBAIKAN: Tambahkan timestamp untuk mencegah duplikasi
        },
        messagePriority
      );

      logInfo(`Successfully scheduled next message #${nextMessageOrder} for subscriber ${subscriber.id}`);
    } catch (scheduleError) {
      logError(`Failed to schedule next message: ${scheduleError.message}`);

      // Coba lagi dengan jobId yang berbeda jika gagal karena duplikasi
      if (scheduleError.message && scheduleError.message.includes('duplicate')) {
        try {
          await addDripJob(
            {
              subscriberId: subscriber.id,
              campaignId: campaignId,
              messageOrder: nextMessageOrder,
              connectionId: connectionId
            },
            {
              delay: delayInMs,
              jobId: `drip-sub${subscriber.id}-camp${campaignId}-msg${nextMessageOrder}-${Date.now()}-retry`, // ID unik dengan timestamp dan retry
            },
            messagePriority
          );
          logInfo(`Successfully scheduled next message with alternative jobId`);
        } catch (retryError) {
          logError(`Failed to schedule with alternative jobId: ${retryError.message}`);
        }
      }
    }
  } else {
    logInfo(`End of campaign ${campaignId} for subscriber ${subscriber.id}. No more messages to schedule. Chain complete.`);
    try {
      await supabase.from('drip_subscribers').update({ status: 'completed' }).eq('id', subscriber.id);
    } catch (updateError) {
      logError(`Failed to update subscriber status to completed: ${updateError.message}`);
    }
  }

  return true;
  // } catch (error) { // @dripWorker.js
  //     logError(`Error in processSubscriberMessage: ${error.message}`); // @dripWorker.js
  //     throw error; // @dripWorker.js
  // } // @dripWorker.js
}

// Fungsi untuk mendapatkan worker options berdasarkan campaign ID
async function getWorkerOptions(campaignId) {
  const rateLimitSettings = await getRateLimitSettings(campaignId);
  return {
    limiter: {
      max: rateLimitSettings.max,
      duration: rateLimitSettings.duration,
      groupKey: campaignId,
    },
    // Opsi untuk mendeteksi job yang macet (misalnya, jika worker crash)
    // Job dianggap macet jika aktif lebih dari 30 detik tanpa selesai
    stalledInterval: 30000,
    maxStalledCount: 5, // Coba lagi job yang macet hingga 5 kali
  };
}

// Inisialisasi worker dengan konfigurasi yang lebih tangguh
const dripWorker = new Worker(
  'drip-campaigns',
  processDripJob,
  {
    connection: redisConfig,
    // Menangani job yang macet (stalled)
    // Job dianggap macet jika tidak selesai dalam 30 detik
    stalledInterval: 30000,
    maxStalledCount: 5, // Mencoba ulang job yang macet hingga 5 kali
    concurrency: parseInt(process.env.DRIP_WORKER_CONCURRENCY || '5', 10) // Proses 5 job secara bersamaan
  }
);

// --- Event Listeners untuk Logging & Monitoring ---

dripWorker.on('completed', (job, result) => {
  logInfo(`Job ${job.id} completed successfully. Result: ${JSON.stringify(result)}`);
});

dripWorker.on('failed', (job, err) => {
  logError(`Job ${job.id} failed after ${job.attemptsMade} attempts with error: ${err.message}`);
  // Pertimbangkan untuk mengirim notifikasi jika job gagal berkali-kali
});

dripWorker.on('stalled', (jobId) => {
  logWarning(`Job ${jobId} has been marked as stalled. This may indicate a worker crash or a long-running task.`);
});

dripWorker.on('error', (err) => {
  logError(`An error occurred in the drip worker: ${err.message}`);
});


logInfo('Drip Worker started successfully with robust settings.');

export { dripWorker, addDripJob }; 