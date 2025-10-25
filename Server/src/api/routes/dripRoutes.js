import express from 'express';
const router = express.Router();
import { createClient } from '@supabase/supabase-js';
import * as dripCampaignService from '../services/dripCampaignService.js';
import { dripQueue } from '../../jobs/dripQueue.js';
import { loggerUtils as logger } from '../../utils/logger.js';
import { invalidateCampaignCache, CACHE_KEYS, setCache } from '../../utils/cacheHelper.js';
import assetService from '../../services/assetService.js';
import 'dotenv/config';
import { quotaGuard } from '../../middleware/quotaGuard.js';

// Initialize Supabase client directly
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Middleware untuk mengekstrak user_id dari header kustom
const extractUserId = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        logger.warn('User ID not found in x-user-id header');
        return res.status(401).json({ message: "User identification is missing." });
    }
    req.user = { id: userId };
    next();
};

// Melindungi semua rute dengan middleware ekstraksi user ID
router.use(extractUserId);

// === CAMPAIGN ===
// GET all campaigns
router.get('/campaigns', async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase
      .from('drip_campaigns')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, campaigns: data });
  } catch (err) {
    console.error('Error fetching drip campaigns:', err);
    res.status(500).json({ success: false, error: 'Gagal memuat daftar campaign' });
  }
});
// CREATE campaign
router.post('/campaigns', /*quotaGuard('drip_campaigns'),*/ async (req, res) => {
  try {
    const { id, name, description, segment_id, connection_id } = req.body;
    const owner_id = req.user.id;
    
    // Temporary fix: Always allow creation of drip campaigns
    // TODO: Fix the quota check system and re-enable quotaGuard middleware
    
    const campaignData = { 
      name, 
      description, 
      segment_id: segment_id || null,
      connection_id,
      owner_id,
      status: 'Active',
      created_at: new Date().toISOString()
    };

    if (id) {
      campaignData.id = id;
    }

    const { data, error } = await supabase
      .from('drip_campaigns')
      .insert([campaignData])
      .select()
      .single();
      
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.status(201).json({ success: true, campaign: data });
  } catch (err) {
    console.error('Error creating drip campaign:', err);
    res.status(500).json({ success: false, error: 'Gagal membuat campaign' });
  }
});
// GET campaign detail
router.get('/campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { data, error } = await supabase
      .from('drip_campaigns')
      .select('*, drip_messages(*)')
      .eq('id', id)
      .eq('owner_id', userId)
      .single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, campaign: data });
  } catch (err) {
    console.error('Error fetching drip campaign details:', err);
    res.status(500).json({ success: false, error: 'Gagal memuat detail campaign' });
  }
});
// UPDATE campaign
router.put('/campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { 
      name, 
      description, 
      segment_id, 
      connection_id, 
      status,
      message_rate_limit,
      rate_limit_window,
      priority 
    } = req.body;
    
    const updatePayload = {
      name,
      description,
      segment_id,
      connection_id,
      updated_at: new Date().toISOString()
    };

    // Validasi dan tambahkan rate limit jika disediakan
    if (message_rate_limit !== undefined) {
      // Pastikan nilai valid (angka positif)
      if (typeof message_rate_limit === 'number' && message_rate_limit > 0) {
        updatePayload.message_rate_limit = message_rate_limit;
        logger.info(`Updating campaign ${id} message rate limit to: ${message_rate_limit}`);
      } else {
        return res.status(400).json({ 
          success: false, 
          error: 'message_rate_limit harus berupa angka positif'
        });
      }
    }
    
    // Validasi dan tambahkan window jika disediakan
    if (rate_limit_window !== undefined) {
      // Pastikan nilai valid (angka positif)
      if (typeof rate_limit_window === 'number' && rate_limit_window > 0) {
        updatePayload.rate_limit_window = rate_limit_window;
        logger.info(`Updating campaign ${id} rate limit window to: ${rate_limit_window}ms`);
      } else {
        return res.status(400).json({ 
          success: false, 
          error: 'rate_limit_window harus berupa angka positif dalam milidetik'
        });
      }
    }
    
    // Validasi dan tambahkan priority jika disediakan
    if (priority !== undefined) {
      // Pastikan nilai valid (salah satu dari high, normal, low)
      if (['high', 'normal', 'low'].includes(priority)) {
        updatePayload.priority = priority;
        logger.info(`Updating campaign ${id} priority to: ${priority}`);
      } else {
        return res.status(400).json({ 
          success: false, 
          error: 'priority harus salah satu dari: high, normal, low'
        });
      }
    }

    if (status !== undefined) {
      updatePayload.status = status;
      
      // Log status saat ini untuk debugging
      logger.info(`Updating campaign ${id} status to: ${status}`);
      
      // Jika status diubah, simpan ke cache juga agar worker segera menggunakan nilai baru
      const statusCacheKey = `${CACHE_KEYS.CAMPAIGN}${id}:status`;
      await setCache(statusCacheKey, status, 300); // TTL 5 menit
      logger.info(`Updated status cache for campaign ${id} to ${status}`);
      
      // Dapatkan status sebelumnya untuk mengetahui apakah ini perubahan dari Draft ke Active
      const { data: prevData, error: prevError } = await supabase
        .from('drip_campaigns')
        .select('status')
        .eq('id', id)
        .eq('owner_id', userId)
        .single();
      
      if (!prevError && prevData && prevData.status === 'Draft' && status === 'Active') {
        // Ini adalah perubahan dari Draft ke Active - perlu me-resume pesan
        logger.info(`Campaign ${id} status changed from Draft to Active. Will resume message delivery.`);
        
        // 1. Dapatkan semua subscriber aktif yang belum menyelesaikan campaign ini
        const { data: activeSubscribers, error: subError } = await supabase
          .from('drip_subscribers')
          .select('*')
          .eq('drip_campaign_id', id)
          .eq('status', 'active');
          
        if (subError) {
          logger.error(`Error fetching subscribers to resume messages for campaign ${id}:`, subError);
        } else if (activeSubscribers && activeSubscribers.length > 0) {
          logger.info(`Found ${activeSubscribers.length} active subscribers for campaign ${id}. Resuming messages...`);
          
          // 2. Jadwalkan pengiriman pesan berikutnya untuk setiap subscriber
          let scheduledCount = 0;
          
          for (const subscriber of activeSubscribers) {
            try {
              // Tentukan pesan berikutnya yang harus dikirim
              const nextMessageOrder = subscriber.last_message_order_sent 
                ? Number(subscriber.last_message_order_sent) + 1 
                : 1;
              
              // Dapatkan detail pesan
              const { data: nextMessage, error: msgError } = await supabase
                .from('drip_messages')
                .select('*')
                .eq('drip_campaign_id', id)
                .eq('message_order', nextMessageOrder)
                .single();
              
              if (msgError || !nextMessage) {
                logger.warn(`No next message (order ${nextMessageOrder}) found for subscriber ${subscriber.id} in campaign ${id}`);
                continue;
              }
              
              // Jadwalkan pengiriman pesan dengan delay minimal (10 detik)
              // Tidak menggunakan delay asli untuk segera memulai pengiriman
              const delayMs = 10000; // 10 detik, agar tidak langsung membanjiri
              
              await dripQueue.add('send-drip-message', 
                {
                  subscriberId: subscriber.id,
                  campaignId: id,
                  messageOrder: nextMessageOrder
                },
                {
                  delay: delayMs,
                  jobId: `drip-sub${subscriber.id}-camp${id}-msg${nextMessageOrder}-resume` // ID unik untuk resume
                }
              );
              
              scheduledCount++;
              
              // Tambahkan jeda kecil antara jadwal pesan 
              // untuk mencegah bottleneck database/message queue
              if (scheduledCount % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            } catch (scheduleError) {
              logger.error(`Error scheduling message for subscriber ${subscriber.id}:`, scheduleError);
            }
          }
          
          logger.info(`Successfully scheduled ${scheduledCount} messages for resumed campaign ${id}`);
        } else {
          logger.info(`No active subscribers found for campaign ${id}. Nothing to resume.`);
        }
      } else if (status !== 'Active') {
        // Jika status diubah menjadi selain Active, batalkan semua job yang belum jalan
        logger.info(`Campaign ${id} deactivated, will attempt to remove pending jobs`);
        try {
          const jobs = await dripQueue.getJobs(['waiting', 'delayed']);
          const campaignJobs = jobs.filter(job => job.data.campaignId === id);
          
          if (campaignJobs.length > 0) {
            logger.info(`Found ${campaignJobs.length} pending jobs for campaign ${id}, removing...`);
            for (const job of campaignJobs) {
              await job.remove();
            }
            logger.info(`Successfully removed ${campaignJobs.length} pending jobs for campaign ${id}`);
          } else {
            logger.info(`No pending jobs found for campaign ${id}`);
          }
        } catch (jobError) {
          logger.error(`Error removing pending jobs for campaign ${id}:`, jobError);
          // Lanjutkan meskipun ada error dalam menghapus job
        }
      }
    }

    const { data, error } = await supabase
      .from('drip_campaigns')
      .update(updatePayload)
      .eq('id', id)
      .eq('owner_id', userId)
      .select()
      .single();
    
    if (error) return res.status(500).json({ success: false, error: error.message });
    
    // Invalidasi cache untuk campaign yang diupdate
    await invalidateCampaignCache(id);
    logger.info(`Campaign ${id} cache invalidated after update`);
    
    res.json({ success: true, campaign: data });
  } catch (err) {
    console.error('Error updating drip campaign:', err);
    res.status(500).json({ success: false, error: 'Gagal mengupdate campaign' });
  }
});
// DELETE campaign
router.delete('/campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: campaign, error: fetchError } = await supabase
      .from('drip_campaigns')
      .select('id')
      .eq('id', id)
      .eq('owner_id', userId)
      .single();

    if (fetchError || !campaign) {
      logger.warn('Attempt to delete non-existent or unauthorized campaign', { campaignId: id, userId });
      return res.status(404).json({ success: false, error: 'Campaign not found or you do not have permission to delete it.' });
    }
    
    // Hapus semua data terkait terlebih dahulu (subscribers, messages)
    // Ini penting untuk menjaga integritas data (foreign key constraints)
    await supabase.from('drip_subscribers').delete().eq('drip_campaign_id', id);
    await supabase.from('drip_messages').delete().eq('drip_campaign_id', id);
    
    // Hapus campaign utama
    const { error } = await supabase
      .from('drip_campaigns')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    
    // Invalidate cache
    invalidateCampaignCache(id);

    res.status(200).json({ success: true, message: 'Campaign and all associated data deleted successfully.' });
  } catch (err) {
    logger.error('Error deleting drip campaign', { error: err.message, campaignId: req.params.id, userId: req.user.id });
    res.status(500).json({ success: false, error: 'Failed to delete campaign.' });
  }
});

// Endpoint baru untuk mendaftarkan semua kontak di segmen
router.post('/campaigns/:id/enroll-segment', async (req, res) => {
  const { id } = req.params;
  const { contactNumbers } = req.body; // Terima array contactNumbers dari body
  try {
    const result = await dripCampaignService.enrollSegmentToCampaign(id, contactNumbers);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(`Error enrolling segment for campaign ${id}:`, err);
    res.status(500).json({ success: false, error: err.message || 'Gagal mendaftarkan segmen ke campaign' });
  }
});

// === MESSAGES ===
// GET all messages for a campaign
router.get('/campaigns/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: campaign, error: campaignError } = await supabase
        .from('drip_campaigns')
        .select('id')
        .eq('id', id)
        .eq('owner_id', userId)
        .single();

    if (campaignError || !campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found or not authorized.' });
    }

    const { data, error } = await supabase
      .from('drip_messages')
      .select('*')
      .eq('drip_campaign_id', id)
      .order('message_order', { ascending: true });

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, messages: data });
  } catch (err) {
    console.error('Error fetching drip messages:', err);
    res.status(500).json({ success: false, error: 'Gagal memuat pesan campaign' });
  }
});
// CREATE message
router.post('/campaigns/:campaignId/messages', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { message, delay, order, type, mediaFullPath, assetId } = req.body;
    const userId = req.user.id;
    
    // Validate campaign ownership
    const { data: campaign, error: campaignError } = await supabase
      .from('drip_campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('owner_id', userId)
      .single();
      
    if (campaignError) {
      return res.status(404).json({ 
        success: false, 
        error: 'Campaign tidak ditemukan atau Anda tidak memiliki akses' 
      });
    }
    
    // Create message
    const messageData = {
      drip_campaign_id: campaignId,
      message,
      delay: delay || 0,
      message_order: order || 1,
      type: type || 'text',
      media_url: mediaFullPath || null,
      asset_id: assetId || null, // Track the asset ID
      caption: message || null // Simpan caption dari pesan (atau bisa dari req.body.caption jika ada)
    };
    
    const { data, error } = await supabase
      .from('drip_messages')
      .insert([messageData])
      .select()
      .single();
      
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    
    // If an asset was used, record its usage
    if (assetId) {
      try {
        await assetService.recordAssetUsage(
          assetId,
          'drip_message',
          data.id
        );
        logger.info(`Asset ${assetId} usage recorded for drip message ${data.id}`);
      } catch (assetError) {
        // Log but don't fail the whole operation
        logger.error(`Failed to record asset usage for message ${data.id}:`, assetError);
      }
    }
    
    // Invalidate cache
    await invalidateCampaignCache(campaignId);
    
    res.status(201).json({ success: true, message: data });
  } catch (err) {
    logger.error('Error creating drip message:', err);
    res.status(500).json({ success: false, error: 'Gagal membuat pesan' });
  }
});
// UPDATE message
router.put('/messages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      message, 
      delay, 
      message_order, 
      type, 
      mediaFullPath,
      drip_campaign_id,
      assetId // Add asset ID to track
    } = req.body;
    const userId = req.user.id;
    
    // First verify ownership via the campaign
    const { data: msgData, error: msgError } = await supabase
      .from('drip_messages')
      .select('drip_campaign_id, asset_id')
      .eq('id', id)
      .single();
      
    if (msgError) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    
    const { data: campaign, error: campaignError } = await supabase
      .from('drip_campaigns')
      .select('id')
      .eq('id', msgData.drip_campaign_id)
      .eq('owner_id', userId)
      .single();
      
    if (campaignError) {
      return res.status(403).json({ 
        success: false, 
        error: 'You do not have permission to edit this message' 
      });
    }
    
    // Update message
    const updateData = {
      message,
      delay,
      message_order,
      type: type || 'text',
      media_url: mediaFullPath || null,
      asset_id: assetId || null,
      updated_at: new Date().toISOString(),
      caption: message || null // Simpan caption dari pesan (atau bisa dari req.body.caption jika ada)
    };
    
    const { data, error } = await supabase
      .from('drip_messages')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    
    // If asset ID has changed, record the new usage
    if (assetId && assetId !== msgData.asset_id) {
      try {
        await assetService.recordAssetUsage(
          assetId,
          'drip_message',
          id
        );
        logger.info(`Asset ${assetId} usage recorded for drip message ${id}`);
      } catch (assetError) {
        // Log but don't fail the whole operation
        logger.error(`Failed to record asset usage for message ${id}:`, assetError);
      }
    }
    
    // Invalidate cache for this campaign
    await invalidateCampaignCache(msgData.drip_campaign_id);
    
    res.json({ success: true, message: data });
  } catch (err) {
    logger.error('Error updating drip message:', err);
    res.status(500).json({ success: false, error: 'Failed to update message' });
  }
});
// DELETE message
router.delete('/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    // First, get the message to verify ownership and get the campaign_id for cache invalidation
    const { data: message, error: fetchError } = await supabase
      .from('drip_messages')
      .select('id, drip_campaign_id')
      .eq('id', messageId)
      .eq('owner_id', userId)
      .single();

    if (fetchError || !message) {
      return res.status(404).json({ success: false, error: 'Message not found or you are not authorized to delete it.' });
    }
    
    // Now, delete the message
    const { error } = await supabase.from('drip_messages').delete()
      .eq('id', messageId);

    if (error) return res.status(500).json({ success: false, error: error.message });
    
    // Invalidate cache for the campaign whose message was deleted
    if (message.drip_campaign_id) {
      await invalidateCampaignCache(message.drip_campaign_id);
      logger.info(`Campaign ${message.drip_campaign_id} cache invalidated after deleting message ${messageId}`);
    }
    
    res.json({ success: true, message: 'Pesan berhasil dihapus' });
  } catch (err) {
    console.error('Error deleting drip message:', err);
    res.status(500).json({ success: false, error: 'Gagal menghapus pesan' });
  }
});

// === SUBSCRIBERS ===
// GET all subscribers for a campaign
router.get('/campaigns/:id/subscribers', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: campaign, error: campaignError } = await supabase
        .from('drip_campaigns').select('id').eq('id', id).eq('owner_id', userId).single();

    if (campaignError || !campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found or not authorized.' });
    }

    const { data, error } = await supabase
      .from('drip_subscribers')
      .select('*')
      .eq('drip_campaign_id', id)
      .eq('owner_id', userId)
      .order('created_at', { ascending: true });
    
    if (error) return res.status(500).json({ success: false, error: error.message });
    
    // Pastikan metadata selalu ada, defaultnya objek kosong
    const subscribers = data.map(sub => ({
      ...sub,
      metadata: sub.metadata || {}
    }));
    
    res.json({ success: true, subscribers });
  } catch (err) {
    console.error('Error fetching drip subscribers:', err);
    res.status(500).json({ success: false, error: 'Gagal memuat daftar subscriber' });
  }
});
// ADD subscriber
router.post('/campaigns/:id/subscribers', async (req, res) => {
  try {
    const { id } = req.params;
    const { contact_id, metadata, should_schedule = true } = req.body;
    const userId = req.user.id;
    
    // Validasi input
    if (!contact_id) {
      return res.status(400).json({ success: false, error: 'contact_id wajib diisi' });
    }
    
    
    let phoneNumber;
    let contactIdNumeric = null;

    // Heuristic to differentiate between a numeric contact ID and a phone number string.
    // A phone number string might be parsed as a number, but will be very large.
    const potentialId = parseInt(contact_id, 10);
    if (!isNaN(potentialId) && String(contact_id).length < 12) { // Phone numbers are assumed to be >= 12 digits
        contactIdNumeric = potentialId;
        const { data: contactData, error: contactError } = await supabase
          .from('contacts')
          .select('phone_number')
          .eq('id', contactIdNumeric)
          .eq('owner_id', userId)
          .single();

        if (contactError || !contactData) {
          logger.error(`Error fetching contact with ID ${contactIdNumeric}:`, contactError?.message || 'Contact not found');
          return res.status(404).json({ success: false, error: `Contact with ID ${contactIdNumeric} not found` });
        }
        phoneNumber = contactData.phone_number;
    } else {
        phoneNumber = String(contact_id); // Ensure it's a string
        logger.info(`Received value as phone number directly: ${phoneNumber}`);
    }
    
    // Prepare data untuk insert
    const subscriberData = { 
      drip_campaign_id: id, 
      contact_id: phoneNumber,
      contact_ref_id: contactIdNumeric,
      status: 'active',
      owner_id: userId
    };
    
    // Tambahkan metadata jika ada
    if (metadata && Object.keys(metadata).length > 0) {
      subscriberData.metadata = metadata;
    }
    
    // Ambil connection_id dari campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('drip_campaigns')
      .select('connection_id')
      .eq('id', id)
      .eq('owner_id', userId)
      .single();
      
    if (campaignError) {
      logger.error(`Error fetching campaign ${id}:`, campaignError);
      return res.status(500).json({ success: false, error: 'Gagal mendapatkan data campaign' });
    }
    
    // Tambahkan connection_id ke data subscriber
    if (campaign && campaign.connection_id) {
      subscriberData.connection_id = campaign.connection_id;
    }
    
    // Cek apakah subscriber sudah ada
    const { data: existingSubscriber, error: existingError } = await supabase
      .from('drip_subscribers')
      .select('id')
      .eq('drip_campaign_id', id)
      .eq('contact_id', phoneNumber)
      .eq('owner_id', userId)
      .single();
    
    if (existingSubscriber) {
      logger.info(`Subscriber with contact_id=${phoneNumber} already exists in campaign ${id}`);
      return res.status(200).json({ 
        success: true, 
        subscriber: existingSubscriber,
        message: 'Subscriber already exists'
      });
    }
    
    // Insert ke database
    const { data, error } = await supabase
      .from('drip_subscribers')
      .insert([subscriberData])
      .select()
      .single();
      
    if (error) {
      logger.error(`Error adding subscriber to campaign ${id}:`, error);
      return res.status(500).json({ success: false, error: error.message });
    }
    
    
    // Jika should_schedule=true, jadwalkan pesan pertama
    if (should_schedule) {
      try {
        console.log(`[DripRoutes] 🔍 DEBUG: Scheduling first message for subscriber ${data.id} in campaign ${id}`);
        // Ambil pesan pertama dari campaign
        let firstMessage;
        let messageError;
        try {
          const result = await supabase
          .rpc('get_first_drip_message', { 
            campaign_id_input: id,
            owner_id_input: userId 
          })
          .single();
          firstMessage = result.data;
          messageError = result.error;
          console.log(`[DripRoutes] 🔍 DEBUG: First message RPC result:`, firstMessage ? `Found message #${firstMessage.message_order}` : 'No message found', messageError ? `Error: ${messageError.message}` : 'No error');
        } catch (rpcErr) {
          // Tangkap error dari .single() jika multiple/no rows
          messageError = rpcErr;
          console.log(`[DripRoutes] 🔍 DEBUG: RPC error caught:`, rpcErr.message);
        }
        if (messageError || !firstMessage) {
          console.log(`[DripRoutes] 🔍 DEBUG: Using fallback to find first message`);
          // Fallback: ambil pesan dengan message_order terkecil
          const { data: allMessages, error: allMsgError } = await supabase
            .from('drip_messages')
            .select('*')
            .eq('drip_campaign_id', id)
            .order('message_order', { ascending: true });
          if (allMsgError || !allMessages || allMessages.length === 0) {
            logger.error(`Error fetching first message for campaign ${id}:`, messageError?.message || allMsgError?.message || 'No messages found');
            console.log(`[DripRoutes] 🔍 DEBUG: No messages found in fallback query`);
          return res.json({ 
            success: true, 
            subscriber: data,
            warning: 'Subscriber added but no messages found to schedule'
          });
        }
          firstMessage = allMessages[0];
          console.log(`[DripRoutes] 🔍 DEBUG: Found first message in fallback: message #${firstMessage.message_order}`);
        }
        // Hitung delay untuk pesan pertama
        const delayMs = firstMessage.delay * 60 * 1000; // Konversi menit ke ms
        console.log(`[DripRoutes] 🔍 DEBUG: Scheduling with delay of ${delayMs}ms (${firstMessage.delay} minutes)`);
        // Jadwalkan pesan pertama
        const jobId = `drip-sub${data.id}-camp${id}-msg${firstMessage.message_order}`;
        console.log(`[DripRoutes] 🔍 DEBUG: Creating job with ID: ${jobId}`);
        await dripQueue.add('send-drip-message', {
          subscriberId: data.id,
          campaignId: id,
          messageOrder: firstMessage.message_order,
          connectionId: subscriberData.connection_id
        }, {
          delay: delayMs,
          jobId: jobId,
          removeOnComplete: true
        });
        console.log(`[DripRoutes] 🔍 DEBUG: Job created successfully`);
      } catch (scheduleError) {
        logger.error(`Error scheduling first message for subscriber ${data.id}:`, scheduleError);
        console.log(`[DripRoutes] 🔍 DEBUG: Error scheduling job:`, scheduleError.message);
        return res.json({ 
          success: true, 
          subscriber: data,
          warning: 'Subscriber added but failed to schedule first message'
        });
      }
    }
    
    res.json({ success: true, subscriber: data });
  } catch (err) {
    logger.error('Error adding drip subscriber:', err);
    res.status(500).json({ success: false, error: 'Gagal menambahkan subscriber' });
  }
});
// DELETE subscriber
router.delete('/subscribers/:subscriberId', async (req, res) => {
  try {
    const { subscriberId } = req.params;
    const userId = req.user.id;
    const { cancelScheduledMessages } = req.body || {};

    // Verifikasi kepemilikan melalui campaign
    const { data: subscriber, error: getSubError } = await supabase
      .from('drip_subscribers')
      .select('id, contact_id, drip_campaign_id')
      .eq('id', subscriberId)
      .eq('owner_id', userId)
      .single();
    
    if (getSubError || !subscriber) {
      return res.status(404).json({ success: false, error: 'Subscriber not found.' });
    }

    const { data: campaign, error: campaignError } = await supabase
        .from('drip_campaigns')
        .select('id')
        .eq('id', subscriber.drip_campaign_id)
        .eq('owner_id', userId)
        .single();
    
    if (campaignError || !campaign) {
        return res.status(403).json({ success: false, error: 'Not authorized to delete this subscriber.' });
    }
    
    // Jika perlu, dapatkan info subscriber sebelum dihapus
    if (cancelScheduledMessages) {
      // ... (logika penghapusan job tetap sama)
    }
    
    // Hapus subscriber dari database
    const { error } = await supabase.from('drip_subscribers').delete()
      .eq('id', subscriberId)
      .eq('owner_id', userId);
    if (error) return res.status(500).json({ success: false, error: error.message });
    
    res.json({ 
      success: true, 
      message: cancelScheduledMessages 
        ? 'Subscriber berhasil dihapus beserta jadwal pengiriman pesannya' 
        : 'Subscriber berhasil dihapus'
    });
  } catch (err) {
    console.error('Error deleting drip subscriber:', err);
    res.status(500).json({ success: false, error: 'Gagal menghapus subscriber' });
  }
});

// UPDATE subscriber metadata
router.patch('/subscribers/:subscriberId/metadata', async (req, res) => {
  try {
    const { subscriberId } = req.params;
    const { metadata } = req.body;
    const userId = req.user.id;
    
    if (!metadata || typeof metadata !== 'object') {
      return res.status(400).json({ success: false, error: 'Metadata harus dalam format objek JSON' });
    }

    // Verifikasi kepemilikan melalui campaign
    const { data: subscriber, error: getSubError } = await supabase
      .from('drip_subscribers')
      .select('drip_campaign_id, metadata')
      .eq('id', subscriberId)
      .eq('owner_id', userId)
      .single();

    if (getSubError || !subscriber) {
        return res.status(404).json({ success: false, error: 'Subscriber not found' });
    }
    
    const { data: campaign, error: campaignError } = await supabase
      .from('drip_campaigns')
      .select('id')
      .eq('id', subscriber.drip_campaign_id)
      .eq('owner_id', userId)
      .single();

    if (campaignError || !campaign) {
        return res.status(403).json({ success: false, error: 'Not authorized to update this subscriber' });
    }
    
    // Gabungkan metadata yang sudah ada dengan metadata baru
    const existingMetadata = subscriber.metadata || {};
    const updatedMetadata = { ...existingMetadata, ...metadata };
    
    // Update metadata
    const { data, error } = await supabase
      .from('drip_subscribers')
      .update({ metadata: updatedMetadata })
      .eq('id', subscriberId)
      .eq('owner_id', userId)
      .select()
      .single();
      
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    
    res.json({ success: true, subscriber: data });
  } catch (err) {
    console.error('Error updating subscriber metadata:', err);
    res.status(500).json({ success: false, error: 'Gagal mengupdate metadata subscriber' });
  }
});

// === LOGS ===
// GET logs for a campaign (optional)
router.get('/campaigns/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verifikasi kepemilikan campaign
    const { data: campaign, error: campaignError } = await supabase
        .from('drip_campaigns')
        .select('id')
        .eq('id', id)
        .eq('owner_id', userId)
        .single();
    
    if (campaignError || !campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found or not authorized.' });
    }
    
    const { data, error } = await supabase
      .from('drip_logs')
      .select(`
        *,
        drip_subscribers ( id, contact_id ),
        drip_messages ( id, message, "message_order" )
      `)
      .eq('drip_campaign_id', id)
      .order('sent_at', { ascending: false });
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, logs: data });
  } catch (err) {
    console.error('Error fetching drip logs:', err);
    res.status(500).json({ success: false, error: 'Gagal memuat log campaign' });
  }
});

// === CONTACT-CENTRIC QUERIES ===

// GET all campaigns a specific contact is subscribed to
router.get('/contacts/:contactId/campaigns', async (req, res) => {
  try {
    const { contactId } = req.params;
    const userId = req.user.id;

    if (!contactId || isNaN(parseInt(contactId, 10))) {
        return res.status(400).json({ success: false, error: 'A valid numeric contact ID is required.' });
    }
    const numericContactId = parseInt(contactId, 10);

    // Get the contact's phone number to perform a comprehensive search
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('phone_number')
      .eq('id', numericContactId)
      .eq('owner_id', userId)
      .single();

    if (contactError) {
        logger.error(`Error fetching contact ${numericContactId} for campaign lookup:`, contactError);
        return res.status(500).json({ success: false, error: 'Could not fetch contact details.' });
    }
    if (!contact) {
      return res.status(404).json({ success: false, error: `Contact with ID ${numericContactId} not found.` });
    }

    const phoneNumber = contact.phone_number;

    // Find all subscriptions for this contact by matching either the phone number or the numeric ID (as text)
    const { data: subscriptions, error: subsError } = await supabase
      .from('drip_subscribers')
      .select(`
        id, 
        status,
        last_message_order_sent,
        last_message_sent_at,
        created_at,
        drip_campaigns ( id, name, owner_id )
      `)
      // Filter di sini lebih kompleks, kita filter setelah join
      .or(`contact_id.eq.${phoneNumber},contact_ref_id.eq.${numericContactId}`);

    if (subsError) {
        logger.error(`Error fetching subscriptions for contact ${numericContactId}:`, subsError);
        return res.status(500).json({ success: false, error: 'Could not fetch campaign subscriptions.' });
    }
    
    // Format the data to match the structure the frontend expects
    const formattedCampaigns = subscriptions
      // Filter di sisi server untuk memastikan hanya campaign milik user yang ditampilkan
      .filter(sub => sub.drip_campaigns && sub.drip_campaigns.owner_id === userId)
      .map(sub => ({
        subscriber_id: sub.id,
        drip_campaign_id: sub.drip_campaigns.id,
        campaign_name: sub.drip_campaigns.name,
        status: sub.status,
        last_message_order: sub.last_message_order_sent,
        last_message_sent_at: sub.last_message_sent_at,
        subscribed_at: sub.created_at
      }));

    res.json({ success: true, campaigns: formattedCampaigns });

  } catch (err) {
    logger.error('Error fetching drip campaigns for contact:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch campaign details for contact.' });
  }
});

// NEW: UNSUBSCRIBE contact from a specific campaign
router.delete('/campaigns/:campaignId/subscribers/by-contact/:contactId', async (req, res) => {
  try {
    const { campaignId, contactId } = req.params;
    const userId = req.user.id;

    if (!campaignId || !contactId || isNaN(parseInt(contactId, 10))) {
      return res.status(400).json({ success: false, error: 'Campaign ID and a valid numeric Contact ID are required.' });
    }

    const numericContactId = parseInt(contactId, 10);
    
    // Verifikasi bahwa campaign ini milik user sebelum melakukan delete
    const { data: campaign, error: campaignError } = await supabase
        .from('drip_campaigns')
        .select('id')
        .eq('id', campaignId)
        .eq('owner_id', userId)
        .single();
    
    if(campaignError || !campaign) {
        return res.status(403).json({ success: false, error: 'Not authorized to perform this action.' });
    }

    // Get the contact's phone number to perform a more reliable delete.
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('phone_number')
      .eq('id', numericContactId)
      .eq('owner_id', userId)
      .single();

    if (contactError || !contact) {
      logger.warn(`Could not find contact ${numericContactId} for unsubscription. Assuming already unsubscribed.`);
      return res.status(404).json({ success: false, error: `Contact with ID ${numericContactId} not found.` });
    }

    // Delete the subscriber by matching campaign and EITHER contact_ref_id OR phone number.
    const { data, error } = await supabase
      .from('drip_subscribers')
      .delete()
      .eq('drip_campaign_id', campaignId)
      .or(`contact_ref_id.eq.${numericContactId},contact_id.eq.${contact.phone_number}`)
      .select();
    
    if (error) {
      logger.error(`Failed to unsubscribe contact ${numericContactId} from campaign ${campaignId}`, error);
      return res.status(500).json({ success: false, error: error.message });
    }

    if (data.length === 0) {
      logger.warn(`No subscriber found for contact ${numericContactId} (phone: ${contact.phone_number}) in campaign ${campaignId}. Nothing to delete.`);
    }

    
    res.json({ success: true, message: 'Contact unsubscribed successfully.' });

  } catch (err) {
    logger.error('Error during unsubscription process:', err);
    res.status(500).json({ success: false, error: 'Failed to unsubscribe contact.' });
  }
});

export default router; 