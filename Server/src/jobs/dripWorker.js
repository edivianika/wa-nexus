import { Worker } from 'bullmq';
import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { dripQueue, addDripJob } from './dripQueue.js';
import redisConfig from '../utils/redisConfig.js';
import { CACHE_KEYS, TTL, getCache, setCache, getCampaignStatus } from '../utils/cacheHelper.js';
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
 * Memproses template pesan dengan menggantikan placeholder {{key}} dengan nilai dari metadata subscriber
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
  
  // Replace semua placeholder dengan nilai dari metadata
  return messageTemplate.replace(placeholderPattern, (match, key) => {
    // Cek apakah key ada di metadata
    const value = key.split('.').reduce((obj, prop) => {
      return obj && obj[prop] !== undefined ? obj[prop] : '';
    }, subscriberMetadata);
    
    // Jika key tidak ditemukan, kembalikan string kosong
    return value !== undefined ? value : '';
  });
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

    const processedMessage = processMessageTemplate(message, metadata);
    const processedCaption = caption ? processMessageTemplate(caption, metadata) : undefined;
    const recipient = to.includes('@') ? to : `${to}@s.whatsapp.net`;

    const mediaNeeded = (type === 'media' || type === 'image' || type === 'video' || type === 'audio' || type === 'document' || asset_id);

    if (mediaNeeded) {
      // Fetch media
      logInfo(`[DripWorker] Preparing to send media message. Type: ${type}, AssetID: ${asset_id}, URL: ${media_url}`);
      try {
        const mediaInfo = await mediaService.getMedia(media_url, asset_id);
        
        if (!mediaInfo || !mediaInfo.path) {
          logError(`[DripWorker] Media not found or no path returned`);
          return { success: false, status: 'MEDIA_NOT_FOUND' };
        }
        
        // Check if file exists
        if (!fs.existsSync(mediaInfo.path)) {
          logError(`[DripWorker] Media file not found at path: ${mediaInfo.path}`);
          return { success: false, status: 'MEDIA_FILE_NOT_FOUND' };
        }
        
        // Read file buffer
        try {
          const fileStats = fs.statSync(mediaInfo.path);
        } catch (statError) {
        }
        
        const buffer = fs.readFileSync(mediaInfo.path);
        
        // Determine media type for socket
        let mediaType = 'document';
        if (mediaInfo.mimeType.startsWith('image')) mediaType = 'image';
        else if (mediaInfo.mimeType.startsWith('video')) mediaType = 'video';
        else if (mediaInfo.mimeType.startsWith('audio')) mediaType = 'audio';
        
        // Create payload
        const payload = {
          [mediaType]: buffer,
          mimetype: mediaInfo.mimeType,
          fileName: mediaInfo.filename || `file.${mediaInfo.mimeType.split('/')[1]}`
        };
        
        if (processedCaption) payload.caption = processedCaption;
        
        logInfo(`[DripWorker] Sending ${mediaType} to ${recipient}. File: ${mediaInfo.filename}, Size: ${buffer.length} bytes`);
        
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
            const { data: subData, error: subError } = await supabase
                .from('drip_subscribers')
                .select('*')
                .eq('id', subscriberId)
                .maybeSingle(); // PERBAIKAN: Gunakan maybeSingle() untuk mencegah error jika tidak ada baris

            if (subError) {
                logError(`Database error fetching subscriber ${subscriberId}: ${subError.message}`);
                // Lempar error agar BullMQ mencoba lagi dengan backoff
                throw new Error(`Database error fetching subscriber ${subscriberId}. Will retry in 5 minutes.`);
            }

            if (!subData) {
                logWarning(`Subscriber with ID ${subscriberId} not found. The subscriber might have been deleted. Job will be discarded.`);
                return; // Keluar dari job, jangan coba lagi
            }
            subscriber = subData;

        } catch (error) {
            logError(`Error in processDripJob: ${error.message}`);
            // Pastikan error dilempar kembali agar BullMQ tahu job gagal
            throw error;
        }
        
        // Jika status subscriber bukan 'active', hentikan
        if (subscriber.status !== 'active') {
            logInfo(`Subscriber ${subscriberId} is not active. Halting chain.`);
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
              logInfo(`Scheduling next message #${nextMessageOrder} for sub ${subscriber.id} with a delay of ${delayInMs/60000} minutes.`);
              
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
    
          const sendResult = await sendWhatsAppMessageDirectly({
                to: subscriber.contact_id,
                message: messageData.message,
                type: messageData.type,
                media_url: messageData.media_url,
                caption: messageData.caption,
              connectionId: connectionId,
              metadata: subscriber.metadata,
              asset_id: messageData.asset_id,
          });

          // Jika koneksi belum siap, jadwalkan ulang job dan keluar
          if (sendResult.status === 'CONNECTION_NOT_READY') {
              const requeueDelay = 30000; // 30 detik
              logWarning(`[DripWorker] Re-queueing job for sub ${subscriber.id} due to unavailable connection. Delay: ${requeueDelay}ms`);
              await addDripJob(job.data, { delay: requeueDelay }, job.opts.priority);
              return; // Keluar dari job ini dengan sukses, karena sudah di-requeue
          }

          sendSuccess = sendResult.success;
    
          // 5. Log hasil pengiriman, APAPUN hasilnya
          const logEntry = {
              drip_campaign_id: campaignId,
              drip_message_id: messageData.id,
              contact_id: subscriber.contact_id,
              drip_subscriber_id: subscriber.id,
              status: sendSuccess ? 'sent' : 'failed',
              sent_at: new Date().toISOString(),
              error_message: sendSuccess ? null : `Failed with status: ${sendResult.status}`,
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
            
            logInfo(`Scheduling next message #${nextMessageOrder} for sub ${subscriber.id} with a delay of ${delayInMs/60000} minutes.`);
            
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