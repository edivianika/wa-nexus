/*
 * DEPRECATED - This polling-based scheduler has been replaced by a job queue system.
 * The new system is triggered in `Server/src/api/services/dripSegmentService.js`
 * and processed by `Server/src/jobs/dripWorker.js`.
 * This file is kept for archival purposes but should not be run.
 */

/*
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Helper function to get API Key from connection_id
async function getApiKeyFromConnectionId(connectionId) {
  if (!connectionId) return null;
  try {
    const { data: connectionData, error: connError } = await supabase
      .from('connections')
      .select('api_key')
      .eq('id', connectionId)
      .single();

    if (connError) {
      console.error(`[DripScheduler] Error fetching API key for connection ${connectionId}:`, connError.message);
      return null;
    }
    return connectionData ? connectionData.api_key : null;
  } catch (err) {
    console.error(`[DripScheduler] Exception fetching API key for connection ${connectionId}:`, err.message);
    return null;
  }
}


// Fungsi sendWhatsAppMessage (diadaptasi dari broadcastWorker.js atau menggunakan yang sudah ada jika memungkinkan)
// Untuk saat ini, kita asumsikan SEND_MESSAGE_API_URL adalah environment variable yang benar
// dan endpoint /api/sendbroadcast pada API tersebut sudah siap.
async function sendWhatsAppMessageViaApi({ to, message, type = 'text', mediaUrl, caption, apiKey, connectionId, campaignId, messageId }) {
  const cleanMessage = message ? String(message).replace(/^\\"|\\"$/g, '').trim() : message;
  const broadcastApiUrl = 'http://localhost:3004'; 

  if (!apiKey) {
    console.error('[DripScheduler] API Key is missing for sending message.');
    return { success: false, error: 'API Key is missing' };
  }
  if (!connectionId) {
    console.error('[DripScheduler] Connection ID is missing for sending message.');
    return { success: false, error: 'Connection ID is missing' };
  }

  const endpoint = `${broadcastApiUrl}/broadcast`;
  const formattedTo = to.includes('@') ? to.split('@')[0] : to; // API broadcast mungkin hanya butuh nomor tanpa @s.whatsapp.net

  const payload = {
    contacts: [
      {
        phone_number: formattedTo 
        // Jika nama kontak tersedia, bisa ditambahkan di sini: contact_name: "Nama Kontak"
      }
    ],
    message: cleanMessage,
    connectionId: connectionId,
    type: type || 'text',
    broadcast_name: `Drip - Campaign: ${campaignId || 'N/A'} - Msg: ${messageId || 'N/A'}`,
    priority: 1, // Default dari contoh curl
    speed: "normal", // Default dari contoh curl
    maxRetry: 2, // Default dari contoh curl
    isBroadcast: false, // Sesuai permintaan Anda
    ...(type === 'media' && mediaUrl && { mediaUrl }),
    ...(type === 'media' && caption && { caption }),
  };
  
  console.log(`[DripScheduler] Sending payload to ${endpoint}:`, JSON.stringify(payload));

  try {
    const response = await axios.post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 30000,
    });

    // Perbaikan: Anggap sukses jika status code adalah 2xx.
    // broadcastServer.js mengembalikan { status: 'queued', ... } bukan { success: true, ... }
    if (response.status >= 200 && response.status < 300) {
      return { success: true, messageId: response.data.jobId || 'sent_via_api', contact: to };
    } else {
      // Ini kemungkinan tidak akan pernah terpicu jika axios melempar error pada status non-2xx,
      // tapi ini sebagai pengaman.
      console.error('[DripScheduler] API returned a non-2xx response:', response.data);
      return { success: false, error: 'API returned a non-2xx response', contact: to, details: response.data };
    }
  } catch (error) {
    const errorMessage = error.response ? (error.response.data.error || error.message) : error.message;
    console.error(`[DripScheduler] Error sending message to ${to} via API:`, error.response ? error.response.data : errorMessage);
    return { success: false, error: errorMessage, contact: to };
  }
}


async function runDripScheduler() {
  console.log(`[DripScheduler] Running at ${new Date().toISOString()}`);

  const { data: activeCampaigns, error: campaignError } = await supabase
    .from('drip_campaigns')
    .select('id, connection_id') // Ambil connection_id dari campaign
    .eq('status', 'Active');

  if (campaignError) {
    console.error('[DripScheduler] Error fetching active campaigns:', campaignError.message);
    return;
  }

  if (!activeCampaigns || activeCampaigns.length === 0) {
    // console.log('[DripScheduler] No active campaigns to process.');
    return;
  }

  for (const campaign of activeCampaigns) {
    if (!campaign.connection_id) {
      console.warn(`[DripScheduler] Campaign ${campaign.id} has no connection_id, skipping.`);
      continue;
    }

    const apiKey = await getApiKeyFromConnectionId(campaign.connection_id);
    if (!apiKey) {
      console.warn(`[DripScheduler] Could not get API key for campaign ${campaign.id} (connection: ${campaign.connection_id}), skipping.`);
      continue;
    }

  const { data: subscribers, error: subError } = await supabase
    .from('drip_subscribers')
    .select('*')
      .eq('drip_campaign_id', campaign.id)
      .eq('status', 'active'); // Pastikan subscriber juga aktif

  if (subError) {
      console.error(`[DripScheduler] Error fetching subscribers for campaign ${campaign.id}:`, subError.message);
      continue;
    }

    if (!subscribers || subscribers.length === 0) {
      // console.log(`[DripScheduler] No active subscribers for campaign ${campaign.id}.`);
      continue;
  }
    
    console.log(`[DripScheduler] Processing campaign ${campaign.id} with ${subscribers.length} active subscribers.`);

  for (const sub of subscribers) {
    const { data: messages, error: msgError } = await supabase
      .from('drip_messages')
      .select('*')
      .eq('drip_campaign_id', sub.drip_campaign_id)
      .order('message_order', { ascending: true });

    if (msgError) {
        console.error(`[DripScheduler] Error fetching messages for campaign ${sub.drip_campaign_id}, subscriber ${sub.contact_id}:`, msgError.message);
      continue;
    }

    let lastSentAt = sub.last_message_sent_at ? new Date(sub.last_message_sent_at) : new Date(sub.created_at);
    let now = new Date();
      let cumulativeDelay = 0; // Untuk menyimpan total delay dari pesan-pesan sebelumnya
      const startTime = new Date(sub.created_at); // Waktu awal subscribe sebagai basis

    for (const msg of messages) {
      const { data: log, error: logError } = await supabase
        .from('drip_logs')
          .select('id')
        .eq('drip_campaign_id', sub.drip_campaign_id)
        .eq('drip_message_id', msg.id)
          .eq('drip_subscriber_id', sub.id)
        .maybeSingle();

      if (logError) {
          console.error(`[DripScheduler] Error checking log for msg ${msg.id}, sub ${sub.id}:`, logError.message);
        continue;
      }

        if (log) continue; // Pesan ini sudah pernah diproses/dikirim untuk subscriber ini

        // Logika BARU: Delay dihitung dari pesan sebelumnya (atau dari waktu subscribe untuk pesan pertama)
        // 'lastSentAt' kini menjadi acuan waktu kapan pesan SEBELUMNYA terkirim.
        const targetTime = new Date(lastSentAt.getTime() + msg.delay * 60 * 1000);
        
        // console.log(`[DripScheduler] Sub ${sub.id}, Msg ${msg.message_order}, Target: ${targetTime.toISOString()}, Now: ${now.toISOString()}, LastSent: ${lastSentAt.toISOString()}`);

      if (now >= targetTime) {
          console.log(`[DripScheduler] Attempting to send message ${msg.id} (Order: ${msg.message_order}) to ${sub.contact_id} for campaign ${campaign.id}`);
          
          const sendResult = await sendWhatsAppMessageViaApi({
            to: sub.contact_id, 
            message: msg.message,
            type: msg.type || 'text', 
            mediaUrl: msg.media_url,  
            caption: msg.caption,     
            apiKey: apiKey,
            connectionId: campaign.connection_id,
            campaignId: campaign.id,
            messageId: msg.id
          });

          const logEntry = {
          drip_campaign_id: sub.drip_campaign_id,
          drip_message_id: msg.id,
          contact_id: sub.contact_id,
            drip_subscriber_id: sub.id,
            status: sendResult.success ? 'sent' : 'failed',
          sent_at: now.toISOString(),
            error_message: sendResult.success ? null : (typeof sendResult.error === 'object' ? JSON.stringify(sendResult.error) : sendResult.error),
            message_content: msg.message // Log isi pesan untuk referensi
          };

          const { error: insertLogError } = await supabase.from('drip_logs').insert(logEntry);
          if (insertLogError) {
            console.error(`[DripScheduler] Error inserting log for msg ${msg.id}, sub ${sub.id}:`, insertLogError.message);
          } else {
            console.log(`[DripScheduler] Logged send attempt for msg ${msg.id} to ${sub.contact_id}: ${logEntry.status}`);
          }

          if (sendResult.success) {
            // Update last_message_sent_at HANYA jika berhasil terkirim
            // dan ini menjadi 'lastSentAt' untuk pesan berikutnya dalam loop ini.
            // Waktu 'now' yang sama digunakan sebagai basis untuk pesan berikutnya di siklus selanjutnya.
            lastSentAt = now; 
            const { error: updateSubError } = await supabase
              .from('drip_subscribers')
              .update({ last_message_sent_at: now.toISOString(), last_message_order_sent: msg.message_order }) // Simpan juga message_order terakhir yg dikirim
          .eq('id', sub.id);
            if (updateSubError) {
              console.error(`[DripScheduler] Error updating subscriber ${sub.id} last_message_sent_at:`, updateSubError.message);
            }
            console.log(`[DripScheduler] Successfully sent message ${msg.id} to ${sub.contact_id}. Updated last_message_sent_at.`);
            break; // Hanya kirim satu pesan per run per subscriber
          } else {
            console.error(`[DripScheduler] Failed to send message ${msg.id} to ${sub.contact_id}. Error: ${logEntry.error_message}`);
            // Jika gagal, jangan update lastSentAt, coba lagi di run berikutnya (tergantung logika delay)
            // Atau bisa tambahkan mekanisme retry dengan status log berbeda, misal 'retry_needed'
            break; // Hentikan proses untuk subscriber ini di run saat ini jika satu pesan gagal.
                   // Atau bisa juga `continue` untuk mencoba pesan berikutnya jika desainnya begitu.
                   // Untuk drip, biasanya jika satu gagal, kita stop untuk subscriber itu di siklus ini.
          }
      } else {
          // Belum waktunya kirim pesan berikutnya untuk subscriber ini, hentikan pengecekan untuk subscriber ini.
        break;
        }
      }
    }
  }
}

// Jalankan setiap menit
setInterval(runDripScheduler, 60 * 1000);
console.log('[DripScheduler] Initialized. Will run every 60 seconds.');
runDripScheduler(); // Jalankan sekali saat startup 
*/ 