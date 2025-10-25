// src/messages/messageTriggers.js
import { executeAction } from './triggerActions/index.js';

async function checkAndRunMessageTriggers(args) {
  try {
    // console.log('[TRIGGER] ===== checkAndRunMessageTriggers called =====');
    // console.log('[TRIGGER] Args:', {
    //   connectionId: args.connectionId,
    //   message: args.message?.substring(0, 50) + '...',
    //   isfromMe: args.isfromMe,
    //   mediaType: args.mediaType,
    //   mediaUrl: args.mediaUrl,
    //   hasMedia: !!args.media,
    //   hasSupabase: !!args.supabase
    // });
    
    const { connection, connectionId, supabase, message, mediaType, mediaUrl, isfromMe, alldata, simplifiedMessage } = args;
    
    if (!supabase) {
      // console.log('[TRIGGER] Tidak ada objek supabase pada argumen, query tidak dijalankan');
      return;
    }

    const redis = connection.configManager?.redis;
    const cacheKey = `triggers:${connectionId}`;
    let data;
    let error;

    if (redis) {
      try {
        const cachedTriggers = await redis.get(cacheKey); 
        if (cachedTriggers) {
          data = JSON.parse(cachedTriggers);
          // console.log(`[TRIGGER] Using triggers from cache for connection: ${connectionId}`);
        }
      } catch (e) {
        console.error('[TRIGGER] Failed to get triggers from Redis cache:', e);
      }
    }

    // If not in cache, query Supabase
    if (!data) {
      // console.log(`[TRIGGER] Fetching triggers from Supabase for connection: ${connectionId}`);
      const { data: dbData, error: dbError } = await supabase
      .from('message_triggers')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('status', 'active');
      
      data = dbData;
      error = dbError;

      // Save to Redis on success
      if (!error && data && redis) {
        try {
          // Cache for 1 hour (3600 seconds)
          await redis.set(cacheKey, JSON.stringify(data), 'EX', 3600);
        } catch (e) {
          console.error('[TRIGGER] Failed to save triggers to Redis cache:', e);
        }
      }
    }

    if (error) {
      console.log('[TRIGGER] Error querying message_triggers:', error);
      return;
    }
    if (!data || data.length === 0) {
      console.log('[TRIGGER] Tidak ada trigger yang ditemukan untuk connection:', connectionId);
      return;
    }
    
    // console.log(`[TRIGGER] Found ${data.length} triggers for connection: ${connectionId}`);
    // Loop dan cocokkan trigger
    for (const trigger of data) {
      // console.log(`[TRIGGER] Checking trigger: ${trigger.trigger_name} (ID: ${trigger.id})`);
      
      // Ambil source dari kolom trigger_source
      const source = trigger.trigger_source;
      // Ambil keyword dari kolom keyword (bisa null)
      let keywordObj = trigger.keyword;
      if (typeof keywordObj === 'string') {
        try { keywordObj = JSON.parse(keywordObj); } catch {}
      }
      const keywords = Array.isArray(keywordObj?.keywords) ? keywordObj.keywords : [];
      // Cek source
      let isSourceMatch = false;
      // console.log(`[TRIGGER] Source check: source=${source}, isfromMe=${isfromMe}, remoteJid=${alldata.key.remoteJid}`);
      
      // Check for Messages from Customers - support both @s.whatsapp.net and @lid formats
      if (source === '1' && !isfromMe && 
          (alldata.key.remoteJid.endsWith('@s.whatsapp.net') || alldata.key.remoteJid.endsWith('@lid'))) {
        isSourceMatch = true; // Messages from Customers
        // console.log(`[TRIGGER] Source match: Messages from Customers`);
      } else if (source === '2' && isfromMe) {
        isSourceMatch = true; // Messages from Me
        // console.log(`[TRIGGER] Source match: Messages from Me`);
      } else if (source === '3' && alldata.key.remoteJid.endsWith('@g.us')) {
        isSourceMatch = true; // Message From Group
        // console.log(`[TRIGGER] Source match: Message From Group`);
      } else {
        // console.log(`[TRIGGER] Source no match: source=${source}, isfromMe=${isfromMe}, remoteJid=${alldata.key.remoteJid}`);
      }
      
      // Cek tipe media (baru)
      let isMediaTypeMatch = false;
      const triggerMediaType = trigger.media_type; // Misal: 'any', 'image', 'video'
      if (!triggerMediaType || triggerMediaType === 'any' || triggerMediaType === mediaType) {
        isMediaTypeMatch = true;
      }

      // Cek keyword (case-insensitive, array, atau null = semua pesan)
      let isKeywordMatch = false;
      if (!keywordObj || !keywords || keywords.length === 0) {
        isKeywordMatch = true; // Jika null/empty, trigger semua pesan
      } else if (message) {
        isKeywordMatch = keywords.some(kw => message.toLowerCase().includes(kw.toLowerCase()));
      }
      
      // Log hasil kecocokan
      // console.log(`[TRIGGER] Matching results for ${trigger.trigger_name}:`, {
      //   isSourceMatch,
      //   isKeywordMatch, 
      //   isMediaTypeMatch,
      //   source,
      //   keywords,
      //   message: message?.substring(0, 50) + '...',
      //   mediaType,
      //   mediaUrl,
      //   hasMedia: !!args.media
      // });
      
      if (isSourceMatch && isKeywordMatch && isMediaTypeMatch) {  
        // console.log(`[TRIGGER] ✅ Trigger matched: ${trigger.trigger_name}`);
        // Jalankan action sesuai tipe
        const action = trigger.action;
        if (action && typeof action === 'object') {
          const context = { 
            connection, 
            message, 
            mediaType, 
            mediaUrl, 
            media: args.media,
            alldata, 
            trigger, 
            simplifiedMessage,
            user_id: args.user_id 
          };
          
            Promise.resolve()
            .then(() => executeAction(action, context))
              .catch(err => {
              console.error(`[TRIGGER] Action execution error (type: ${action.type}):`, err);
              });
          }
      }
    }
  } catch (err) {
    console.log('[TRIGGER] Error di checkAndRunMessageTriggers:', err);
  }
}

export { checkAndRunMessageTriggers }; 
