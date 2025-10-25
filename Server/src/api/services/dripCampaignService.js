import { supabase, supabaseAdmin } from '../../utils/supabaseClient.js';
import { loggerUtils as logger } from '../../utils/logger.js';
import { dripQueue, addDripJob, PRIORITY } from '../../jobs/dripQueue.js';

/**
 * Mendaftarkan semua kontak dari segmen yang terhubung ke sebuah campaign.
 * Fungsi ini idempoten: tidak akan mendaftarkan ulang kontak yang sudah menjadi subscriber.
 *
 * @param {string} campaignId - UUID dari campaign yang akan didaftarkan.
 * @param {Array<string>} contactNumbers - Array nomor kontak yang akan didaftarkan.
 * @returns {object} Hasil operasi, berisi jumlah kontak yang berhasil didaftarkan.
 */
export const enrollSegmentToCampaign = async (campaignId, contactNumbers) => {
  logger.info(`[Enrollment] Starting enrollment process for campaign: ${campaignId}`);

  // 1. Ambil detail campaign, terutama segment_id dan connection_id
  const { data: campaign, error: campaignError } = await supabase
    .from('drip_campaigns')
    .select('id, segment_id, connection_id, status, priority, message_rate_limit, rate_limit_window')
    .eq('id', campaignId)
    .single();

  if (campaignError || !campaign) {
    logger.error(`[Enrollment] Campaign with ID ${campaignId} not found.`, campaignError);
    throw new Error('Campaign not found.');
  }
  if (campaign.status !== 'Active') {
      logger.warn(`[Enrollment] Campaign ${campaignId} is not Active. Halting enrollment.`);
      throw new Error('Campaign is not active. Please activate it first.');
  }
  if (!campaign.segment_id) {
    logger.warn(`[Enrollment] Campaign ${campaignId} does not have a segment linked.`);
    throw new Error('Campaign does not have a segment linked.');
  }

  // Tentukan prioritas pesan berdasarkan prioritas kampanye
  let messagePriority = PRIORITY.NORMAL; // Default
  if (campaign.priority === 'high') {
    messagePriority = PRIORITY.HIGH;
  } else if (campaign.priority === 'low') {
    messagePriority = PRIORITY.LOW;
  }

  logger.info(`[Enrollment] Campaign ${campaignId} using priority: ${campaign.priority || 'normal'} (${messagePriority})`);

  // 2. Validasi input: contactNumbers harus berupa array
  if (!Array.isArray(contactNumbers) || contactNumbers.length === 0) {
    logger.warn(`[Enrollment] No contacts provided for campaign ${campaignId}. Halting.`);
    throw new Error('No contacts selected to enroll.');
  }
  
  const totalSegmentContacts = contactNumbers.length;
  logger.info(`[Enrollment] Processing ${totalSegmentContacts} contacts for campaign ${campaignId}`);

  // 3. Dapatkan daftar subscriber yang sudah ada di campaign ini untuk mencegah duplikasi
  const { data: existingSubscribers, error: existingSubError } = await supabase
    .from('drip_subscribers')
    .select('contact_id')
    .eq('drip_campaign_id', campaignId);

  if (existingSubError) {
    logger.error(`[Enrollment] Could not fetch existing subscribers for campaign ${campaignId}.`, existingSubError);
    throw new Error('Could not verify existing subscribers.');
  }

  const existingContactIds = new Set(existingSubscribers.map(sub => sub.contact_id));
  logger.info(`[Enrollment] Found ${existingContactIds.size} existing subscribers in campaign ${campaignId}.`);

  // 4. Filter kontak yang belum menjadi subscriber
  const newContactsToEnroll = contactNumbers.filter(contactNumber => !existingContactIds.has(contactNumber));
  
  const alreadyExistsCount = totalSegmentContacts - newContactsToEnroll.length;
  if (newContactsToEnroll.length === 0) {
    logger.info(`[Enrollment] All ${totalSegmentContacts} contacts are already subscribers. Nothing to do.`);
    return {
      enrolledCount: 0,
      alreadyExistsCount,
      totalSegmentContacts
    };
  }

  logger.info(`[Enrollment] Found ${newContactsToEnroll.length} new contacts to enroll.`);

  // 5. Buat subscriber baru untuk kontak yang belum terdaftar
  const newSubscribers = newContactsToEnroll.map(contactNumber => ({
    drip_campaign_id: campaignId,
    contact_id: contactNumber,
    status: 'active', // Langsung aktif
    connection_id: campaign.connection_id,
    metadata: {} // Default metadata kosong
  }));

  const { data: insertedSubscribers, error: insertError } = await supabase
    .from('drip_subscribers')
    .insert(newSubscribers)
    .select('id, contact_id');

  if (insertError) {
    logger.error(`[Enrollment] Failed to insert new subscribers for campaign ${campaignId}.`, insertError);
    throw new Error('Failed to create new subscribers.');
  }

  logger.info(`[Enrollment] Successfully created ${insertedSubscribers.length} new subscribers.`);
  
  // 6. Dapatkan pesan pertama dari campaign untuk dijadwalkan
  const { data: firstMessage, error: messageError } = await supabase
    .rpc('get_first_drip_message', { campaign_id_input: campaignId }).single();
  
  if (!firstMessage) {
    // Coba pendekatan alternatif untuk mencari pesan pertama
    console.log(`[Enrollment] Trying alternative approach to find first message for campaign ${campaignId}`);
    
    const { data: allMessages, error: allMsgError } = await supabase
      .from('drip_messages')
      .select('*')
      .eq('drip_campaign_id', campaignId)
      .order('message_order', { ascending: true });
      
    if (!allMsgError && allMessages && allMessages.length > 0) {
      // Ambil pesan dengan message_order terkecil sebagai pesan pertama
      const sortedMessages = allMessages.sort((a, b) => 
        (a.message_order || Number.MAX_SAFE_INTEGER) - (b.message_order || Number.MAX_SAFE_INTEGER)
      );
      
      logger.info(`[Enrollment] Found ${allMessages.length} messages for campaign ${campaignId}, using first available with message_order=${sortedMessages[0].message_order}`);
      
      // Gunakan pesan dengan message_order terkecil
      const firstMessageAlternative = sortedMessages[0];
      
      // Jika pesan tidak memiliki message_order=1, update dulu nilainya
      if (firstMessageAlternative.message_order !== 1) {
        logger.warn(`[Enrollment] First message has message_order=${firstMessageAlternative.message_order}, updating to 1`);
        await supabase
          .from('drip_messages')
          .update({ message_order: 1 })
          .eq('id', firstMessageAlternative.id);
          
        firstMessageAlternative.message_order = 1;
      }
      
      // Gunakan pesan ini untuk penjadwalan
      const delayInMs = Math.max(60000, firstMessageAlternative.delay * 60 * 1000); // PERBAIKAN: Minimal 1 menit delay
      
      const schedulingJobs = [];
      let successCount = 0;
      let failedCount = 0;
      
      for (const subscriber of insertedSubscribers) {
        logger.info(`[Enrollment] Scheduling first message for new subscriber ${subscriber.id}`);
        
        try {
          // PERBAIKAN: Tambahkan try-catch untuk menangkap error penjadwalan
          // Gunakan addDripJob dengan priority dan connectionId
          await addDripJob(
            {
              subscriberId: subscriber.id,
              campaignId: campaignId,
              messageOrder: 1,
              connectionId: campaign.connection_id, // Penting untuk rate limiting per koneksi
            },
            {
              delay: delayInMs,
              jobId: `drip-sub${subscriber.id}-camp${campaignId}-msg1-${Date.now()}`, // PERBAIKAN: Tambahkan timestamp untuk mencegah duplikasi
            },
            messagePriority
          );
          
          schedulingJobs.push(subscriber.id);
          successCount++;
        } catch (scheduleError) {
          failedCount++;
          logger.error(`[Enrollment] Error scheduling job for subscriber ${subscriber.id}: ${scheduleError.message}`);
          
          // Coba lagi dengan jobId yang berbeda jika gagal karena duplikasi
          if (scheduleError.message && scheduleError.message.includes('duplicate')) {
            try {
              await addDripJob(
                {
                  subscriberId: subscriber.id,
                  campaignId: campaignId,
                  messageOrder: 1,
                  connectionId: campaign.connection_id
                },
                {
                  delay: delayInMs,
                  jobId: `drip-sub${subscriber.id}-camp${campaignId}-msg1-retry-${Date.now()}`,
                },
                messagePriority
              );
              logger.info(`[Enrollment] Successfully scheduled with alternative jobId for subscriber ${subscriber.id}`);
              schedulingJobs.push(subscriber.id);
              successCount++;
              failedCount--; // Kurangi failed count karena berhasil pada percobaan kedua
            } catch (retryError) {
              logger.error(`[Enrollment] Failed to schedule with alternative jobId for subscriber ${subscriber.id}: ${retryError.message}`);
            }
          }
        }
      }
      
      logger.info(`[Enrollment] Successfully scheduled ${successCount} first messages using alternative approach. Failed: ${failedCount}`);
      
      return { 
        enrolledCount: insertedSubscribers.length, 
        alreadyExistsCount: alreadyExistsCount,
        totalSegmentContacts: totalSegmentContacts,
        scheduledCount: successCount,
        failedScheduleCount: failedCount,
        info: "Used alternative message finding approach"
      };
    }

    logger.warn(`[Enrollment] Campaign ${campaignId} has no first message (message_order 1). Subscribers created but no messages scheduled.`);
    return { enrolledCount: insertedSubscribers.length, alreadyExistsCount: alreadyExistsCount, totalSegmentContacts: totalSegmentContacts, warning: "No first message found to schedule." };
  }

  // PERBAIKAN: Pastikan delay tidak terlalu pendek
  const requestedDelay = firstMessage.delay * 60 * 1000;
  const delayInMs = Math.max(60000, requestedDelay); // Minimal 1 menit

  // Gunakan for-loop untuk menambahkan setiap job menggunakan addDripJob
  const schedulingJobs = [];
  let successCount = 0;
  let failedCount = 0;

  for (const subscriber of insertedSubscribers) {
    logger.info(`[Enrollment] Scheduling first message for new subscriber ${subscriber.id}`);
    
    try {
      // PERBAIKAN: Tambahkan try-catch untuk menangkap error penjadwalan
      // Gunakan addDripJob dengan priority dan connectionId
      await addDripJob(
        {
          subscriberId: subscriber.id,
          campaignId: campaignId,
          messageOrder: 1,
          connectionId: campaign.connection_id, // Penting untuk rate limiting per koneksi
        },
        {
          delay: delayInMs,
          jobId: `drip-sub${subscriber.id}-camp${campaignId}-msg1-${Date.now()}`, // PERBAIKAN: Tambahkan timestamp untuk mencegah duplikasi
        },
        messagePriority
      );
      
      schedulingJobs.push(subscriber.id);
      successCount++;
    } catch (scheduleError) {
      failedCount++;
      logger.error(`[Enrollment] Error scheduling job for subscriber ${subscriber.id}: ${scheduleError.message}`);
      
      // Coba lagi dengan jobId yang berbeda jika gagal karena duplikasi
      if (scheduleError.message && scheduleError.message.includes('duplicate')) {
        try {
          await addDripJob(
            {
              subscriberId: subscriber.id,
              campaignId: campaignId,
              messageOrder: 1,
              connectionId: campaign.connection_id
            },
            {
              delay: delayInMs,
              jobId: `drip-sub${subscriber.id}-camp${campaignId}-msg1-retry-${Date.now()}`,
            },
            messagePriority
          );
          logger.info(`[Enrollment] Successfully scheduled with alternative jobId for subscriber ${subscriber.id}`);
          schedulingJobs.push(subscriber.id);
          successCount++;
          failedCount--; // Kurangi failed count karena berhasil pada percobaan kedua
        } catch (retryError) {
          logger.error(`[Enrollment] Failed to schedule with alternative jobId for subscriber ${subscriber.id}: ${retryError.message}`);
        }
      }
    }
  }

  logger.info(`[Enrollment] Successfully scheduled ${successCount} first messages. Failed: ${failedCount}`);

  return { 
    enrolledCount: insertedSubscribers.length, 
    alreadyExistsCount: alreadyExistsCount,
    totalSegmentContacts: totalSegmentContacts,
    scheduledCount: successCount,
    failedScheduleCount: failedCount
  };
}; 