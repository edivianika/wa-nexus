import { supabase, supabaseAdmin } from '../../utils/supabaseClient.js';
import { loggerUtils as logger } from '../../utils/logger.js';
import { dripQueue, addDripJob, PRIORITY } from '../../jobs/dripQueue.js';
import fetch from 'node-fetch';
import 'dotenv/config';

// Server URL untuk API calls internal
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

/**
 * Get all drip contact segments.
 * Optionally, can be filtered by user_id if implemented.
 */
export const getAllSegments = async (userId) => {
  try {
    if (!userId) {
      throw new Error('User ID is required to fetch segments.');
    }
    // Ambil data segmen
    const { data: segments, error } = await supabase
      .from('drip_contact_segments')
      .select('id, name, description, created_at, updated_at, owner_id')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching drip contact segments:', error);
      throw error;
    }

    // Jika tidak ada segmen, kembalikan array kosong
    if (!segments || segments.length === 0) {
      return [];
    }

    // Untuk setiap segmen, hitung jumlah kontaknya
    for (const segment of segments) {
      const { count, error: countError } = await supabase
        .from('drip_segment_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('segment_id', segment.id);
      
      if (countError) {
        logger.error(`Error counting contacts for segment ${segment.id}:`, countError);
        segment.contacts_count = 0;
      } else {
        segment.contacts_count = count || 0;
      }
    }

    return segments;
  } catch (error) {
    logger.error('Error in getAllSegments:', error);
    throw error;
  }
};

/**
 * Create a new drip contact segment.
 * @param {object} segmentData - The data for the new segment.
 * @param {string} segmentData.name - The name of the segment.
 * @param {string} [segmentData.description] - Optional description for the segment.
 * @param {string} [segmentData.user_id] - Optional user ID.
 */
export const createSegment = async (segmentData) => {
  try {
    const { name, description, owner_id } = segmentData;

    if (!name) {
      throw new Error('Segment name is required.');
    }

    // Buat segmen baru
    const { data, error } = await supabase
      .from('drip_contact_segments')
      .insert([{ name, description, owner_id }])
      .select('id, name, description, created_at, updated_at, owner_id')
      .single();

    if (error) {
      logger.error('Error creating drip contact segment:', error);
      throw error;
    }

    // Tambahkan contacts_count = 0 untuk segmen baru
    data.contacts_count = 0;
    
    return data;
  } catch (error) {
    logger.error('Error in createSegment:', error);
    throw error;
  }
};

/**
 * Get a single drip contact segment by its ID.
 * @param {string} segmentId - The ID of the segment.
 */
export const getSegmentById = async (segmentId) => {
  try {
    // Ambil data segmen
    const { data: segment, error } = await supabase
      .from('drip_contact_segments')
      .select('id, name, description, created_at, updated_at, user_id')
      .eq('id', segmentId)
      .single();

    if (error) {
      logger.error(`Error fetching drip contact segment with id ${segmentId}:`, error);
      return null;
    }

    if (!segment) {
      return null;
    }

    // Hitung jumlah kontak dalam segmen
    const { count, error: countError } = await supabase
      .from('drip_segment_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('segment_id', segmentId);
    
    if (countError) {
      logger.error(`Error counting contacts for segment ${segmentId}:`, countError);
      segment.contacts_count = 0;
    } else {
      segment.contacts_count = count || 0;
    }

    return segment;
  } catch (error) {
    logger.error(`Error in getSegmentById for ${segmentId}:`, error);
    throw error;
  }
};

/**
 * Update an existing drip contact segment.
 * @param {string} segmentId - The ID of the segment to update.
 * @param {object} updateData - The data to update.
 * @param {string} [updateData.name] - The new name of the segment.
 * @param {string} [updateData.description] - The new description for the segment.
 */
export const updateSegment = async (segmentId, updateData) => {
  try {
    const { name, description } = updateData;

    if (!name && description === undefined) {
      throw new Error('Nothing to update. Provide name or description.');
    }
    
    const updatePayload = {};
    if (name) updatePayload.name = name;
    if (description !== undefined) updatePayload.description = description; // Allow empty string for description
    updatePayload.updated_at = new Date().toISOString();

    // Update segmen
    const { data: updatedSegment, error } = await supabase
      .from('drip_contact_segments')
      .update(updatePayload)
      .eq('id', segmentId)
      .select('id, name, description, created_at, updated_at, user_id')
      .single();

    if (error) {
      logger.error(`Error updating drip contact segment with id ${segmentId}:`, error);
      throw error;
    }

    if (!updatedSegment) {
      return null;
    }

    // Hitung jumlah kontak dalam segmen
    const { count, error: countError } = await supabase
      .from('drip_segment_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('segment_id', segmentId);
    
    if (countError) {
      logger.error(`Error counting contacts for segment ${segmentId}:`, countError);
      updatedSegment.contacts_count = 0;
    } else {
      updatedSegment.contacts_count = count || 0;
    }

    return updatedSegment;
  } catch (error) {
    logger.error(`Error in updateSegment for ${segmentId}:`, error);
    throw error;
  }
};

/**
 * Delete a drip contact segment by its ID.
 * @param {string} segmentId - The ID of the segment to delete.
 */
export const deleteSegment = async (segmentId) => {
  const { data, error } = await supabase
    .from('drip_contact_segments')
    .delete()
    .eq('id', segmentId)
    .select() // select to get data of deleted row
    .single();

  if (error) {
    logger.error(`Error deleting drip contact segment with id ${segmentId}:`, error);
    throw error;
  }
  return data; // Returns the deleted segment data
};


// --- Contact Management within a Segment ---

/**
 * Get all contacts within a specific segment.
 * @param {string} segmentId - The ID of the segment.
 */
export const getContactsInSegment = async (segmentId) => {
  try {
  const { data, error } = await supabase
    .from('drip_segment_contacts')
      .select('id, contact_number, contact_name, added_at')
    .eq('segment_id', segmentId)
    .order('added_at', { ascending: false });

  if (error) {
      logger.error(`Error fetching contacts for segment ${segmentId}:`, error);
      throw error;
    }

    return data || [];
  } catch (error) {
    logger.error(`Error in getContactsInSegment for ${segmentId}:`, error);
    throw error;
  }
};

/**
 * Add a contact to a segment.
 * @param {string} segmentId - The ID of the segment.
 * @param {object} contactData - The contact data.
 * @param {string} contactData.contact_number - The contact's phone number.
 * @param {string} [contactData.contact_name] - Optional name for the contact.
 */
export const addContactToSegment = async (segmentId, contactData) => {
  const { contact_number, contact_name } = contactData;

  if (!contact_number) {
    throw new Error('Contact number is required.');
  }

  // Cek apakah kontak sudah ada
  const { data: existing, error: existingError } = await supabase
    .from('drip_segment_contacts')
    .select('id')
    .eq('segment_id', segmentId)
    .eq('contact_number', contact_number)
    .maybeSingle();

  if (existingError) {
    logger.error(`Error checking for existing contact in segment ${segmentId}:`, existingError);
    throw existingError;
  }
  if (existing) {
    logger.warn(`Contact ${contact_number} already exists in segment ${segmentId}.`);
    throw new Error(`Kontak ${contact_number} sudah ada di segmen ini.`);
  }

  // Tambahkan kontak ke segmen
  const { data: newContactLink, error: insertError } = await supabase
    .from('drip_segment_contacts')
    .insert([{ segment_id: segmentId, contact_number, contact_name }])
    .select()
    .single();
  
  if (insertError) {
    logger.error(`Error adding contact to segment ${segmentId}:`, insertError);
    throw insertError;
  }

  // --- LOGIKA BARU: Memicu Drip Campaign ---
  try {
    console.log(`[DripTrigger] Contact ${contact_number} added to segment ${segmentId}. Starting trigger logic...`);

    // 1. Cari semua campaign aktif yang menggunakan segmen ini
    const { data: campaigns, error: campaignError } = await supabase
      .from('drip_campaigns')
      .select('id, connection_id, priority')
      .eq('segment_id', segmentId)
      .eq('status', 'Active');

    if (campaignError) {
      console.error('[DripTrigger] Error fetching campaigns:', campaignError.message);
      throw campaignError;
    }
    
    if (!campaigns || campaigns.length === 0) {
      console.log(`[DripTrigger] No active campaigns found for segment ${segmentId}. Trigger logic finished.`);
      return newContactLink; // Tetap kembalikan link kontak yang baru dibuat
    }

    console.log(`[DripTrigger] Found ${campaigns.length} active campaigns:`, campaigns.map(c => c.id));
    
    // 2. Loop melalui semua kampanye yang menggunakan segmen ini
    for (const campaign of campaigns) {
      // 2.1 Cek apakah kontak sudah menjadi subscriber
      const { data: existingSubscriber, error: subError } = await supabase
        .from('drip_subscribers')
        .select('id')
        .eq('drip_campaign_id', campaign.id)
        .eq('contact_id', contact_number)
        .maybeSingle();
      
      if (subError) {
        console.error(`[DripTrigger] Error checking existing subscriber for campaign ${campaign.id}:`, subError.message);
        continue; // Lanjut ke campaign berikutnya jika ada error
      }
      
      if (existingSubscriber) {
        console.log(`[DripTrigger] Contact ${contact_number} is already a subscriber to campaign ${campaign.id}. Skipping.`);
        continue; // Lanjut ke campaign berikutnya
      }
      
      // 2.2 Tambahkan kontak sebagai subscriber baru
      console.log(`[DripTrigger] Adding contact ${contact_number} as new subscriber to campaign ${campaign.id}`);
      
      // PERBAIKAN: Tambahkan metadata kontak untuk personalisasi pesan
      const subscriberMetadata = {
        name: contact_name,
        phone: contact_number,
        added_via: 'segment',
        added_at: new Date().toISOString()
      };
      
      const { data: newSubscriber, error: insertError } = await supabase
        .from('drip_subscribers')
        .insert({
          drip_campaign_id: campaign.id,
          contact_id: contact_number,
          connection_id: campaign.connection_id,
          status: 'active',
          metadata: subscriberMetadata
        })
        .select('id')
        .single();
      
      if (insertError || !newSubscriber) {
        console.error(`[DripTrigger] Error creating subscriber for campaign ${campaign.id}:`, insertError?.message || 'No subscriber data returned');
        continue; // Lanjut ke campaign berikutnya jika ada error
      }
      
      console.log(`[DripTrigger] Successfully created subscriber ${newSubscriber.id} for campaign ${campaign.id}`);
      
      // 3. Ambil pesan pertama untuk kampanye ini
      const { data: firstMessage } = await supabase
        .rpc('get_first_drip_message', { campaign_id_input: campaign.id })
        .maybeSingle();
      
      // PERBAIKAN: Jika tidak ada pesan pertama, coba cari pesan dengan message_order terkecil
      if (!firstMessage) {
        console.log(`[DripTrigger] No first message found using RPC for campaign ${campaign.id}. Trying alternative approach...`);
        
        const { data: allMessages, error: allMsgError } = await supabase
          .from('drip_messages')
          .select('*')
          .eq('drip_campaign_id', campaign.id)
          .order('message_order', { ascending: true });
          
        if (allMsgError) {
          console.error(`[DripTrigger] Error fetching messages for campaign ${campaign.id}:`, allMsgError.message);
          continue;
        }
        
        if (!allMessages || allMessages.length === 0) {
          console.warn(`[DripTrigger] Campaign ${campaign.id} has no messages. Skipping.`);
          continue;
        }
        
        // Ambil pesan dengan message_order terkecil sebagai pesan pertama
        const sortedMessages = allMessages.sort((a, b) => 
          (a.message_order || Number.MAX_SAFE_INTEGER) - (b.message_order || Number.MAX_SAFE_INTEGER)
        );
        
        logger.info(`[DripTrigger] Found ${allMessages.length} messages for campaign ${campaign.id}, using first available with message_order=${sortedMessages[0].message_order}`);
        
        // Gunakan pesan dengan message_order terkecil
        const firstMessageAlternative = sortedMessages[0];
        
        // Jika pesan tidak memiliki message_order=1, update dulu nilainya
        if (firstMessageAlternative.message_order !== 1) {
          logger.warn(`[DripTrigger] First message has message_order=${firstMessageAlternative.message_order}, updating to 1`);
          await supabase
            .from('drip_messages')
            .update({ message_order: 1 })
            .eq('id', firstMessageAlternative.id);
            
          firstMessageAlternative.message_order = 1;
        }
        
        // 4. Jadwalkan job untuk pesan pertama dengan sistem prioritas baru
        const delayInMs = firstMessageAlternative.delay * 60 * 1000;
        
        console.log(`[DripTrigger] Campaign ${campaign.id}: Attempting to add job to dripQueue for subscriber ${newSubscriber.id}...`);
        
        // Tentukan prioritas berdasarkan prioritas kampanye
        let messagePriority = PRIORITY.NORMAL;
        if (campaign.priority === 'high') {
          messagePriority = PRIORITY.HIGH;
        } else if (campaign.priority === 'low') {
          messagePriority = PRIORITY.LOW;
        }
        
        // PERBAIKAN: Gunakan try-catch untuk menangkap error penjadwalan
        try {
          // Jadwalkan pesan pertama
          await addDripJob(
            {
              subscriberId: newSubscriber.id,
              campaignId: campaign.id,
              messageOrder: 1,
              connectionId: campaign.connection_id
            },
            {
              delay: Math.max(60000, delayInMs), // Minimal 1 menit delay
              jobId: `drip-sub${newSubscriber.id}-camp${campaign.id}-msg1-segment`,
            },
            messagePriority
          );
          
          console.log(`[DripTrigger] Successfully scheduled first message for subscriber ${newSubscriber.id} in campaign ${campaign.id}`);
        } catch (jobError) {
          console.error(`[DripTrigger] Error scheduling job:`, jobError.message);
          
          // PERBAIKAN: Coba lagi dengan jobId yang berbeda jika gagal karena duplikasi
          if (jobError.message && jobError.message.includes('duplicate')) {
            try {
              await addDripJob(
                {
                  subscriberId: newSubscriber.id,
                  campaignId: campaign.id,
                  messageOrder: 1,
                  connectionId: campaign.connection_id
                },
                {
                  delay: Math.max(60000, delayInMs),
                  jobId: `drip-sub${newSubscriber.id}-camp${campaign.id}-msg1-segment-${Date.now()}`,
                },
                messagePriority
              );
              console.log(`[DripTrigger] Successfully scheduled with alternative jobId`);
            } catch (retryError) {
              console.error(`[DripTrigger] Failed to schedule with alternative jobId:`, retryError.message);
            }
          }
        }
        
        continue; // Lanjut ke campaign berikutnya
      }
      
      // Jika ada pesan pertama dari RPC, gunakan itu
      console.log(`[DripTrigger] Found first message for campaign ${campaign.id} with delay ${firstMessage.delay} minutes`);
      
      // PERBAIKAN: Pastikan delay tidak terlalu pendek
      const delayInMs = Math.max(60000, firstMessage.delay * 60 * 1000); // Minimal 1 menit
      
      // Tentukan prioritas berdasarkan prioritas kampanye
      let messagePriority = PRIORITY.NORMAL;
      if (campaign.priority === 'high') {
        messagePriority = PRIORITY.HIGH;
      } else if (campaign.priority === 'low') {
        messagePriority = PRIORITY.LOW;
      }
      
      // PERBAIKAN: Gunakan try-catch untuk menangkap error penjadwalan
      try {
        // Jadwalkan pesan pertama
        await addDripJob(
          {
            subscriberId: newSubscriber.id,
            campaignId: campaign.id,
            messageOrder: 1,
            connectionId: campaign.connection_id
          },
          {
            delay: delayInMs,
            jobId: `drip-sub${newSubscriber.id}-camp${campaign.id}-msg1`,
          },
          messagePriority
        );
        
        console.log(`[DripTrigger] Successfully scheduled first message for subscriber ${newSubscriber.id} in campaign ${campaign.id}`);
      } catch (jobError) {
        console.error(`[DripTrigger] Error scheduling job:`, jobError.message);
        
        // PERBAIKAN: Coba lagi dengan jobId yang berbeda jika gagal karena duplikasi
        if (jobError.message && jobError.message.includes('duplicate')) {
          try {
            await addDripJob(
              {
                subscriberId: newSubscriber.id,
                campaignId: campaign.id,
                messageOrder: 1,
                connectionId: campaign.connection_id
              },
              {
                delay: delayInMs,
                jobId: `drip-sub${newSubscriber.id}-camp${campaign.id}-msg1-${Date.now()}`,
              },
              messagePriority
            );
            console.log(`[DripTrigger] Successfully scheduled with alternative jobId`);
          } catch (retryError) {
            console.error(`[DripTrigger] Failed to schedule with alternative jobId:`, retryError.message);
          }
        }
      }
    }
    
    console.log(`[DripTrigger] Finished processing all campaigns for segment ${segmentId}`);
    
  } catch (error) {
    console.error('[DripTrigger] Error in trigger logic:', error);
  }
  
  return newContactLink;
};

/**
 * Remove a contact from a segment.
 * This uses the ID of the drip_segment_contacts record.
 * @param {string} segmentContactId - The ID of the segment-contact link record.
 */
export const removeContactFromSegment = async (segmentContactId) => {
  const { data, error } = await supabase
    .from('drip_segment_contacts')
    .delete()
    .eq('id', segmentContactId)
    .select()
    .single();

  if (error) {
    logger.error(`Error removing contact (link id ${segmentContactId}) from segment:`, error);
    throw error;
  }
  return data;
}; 