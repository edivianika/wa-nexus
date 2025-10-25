import mediaQueue from '../../jobs/mediaQueue.js';
import { getConnectionManager } from '../../utils/connectionManagerSingleton.js';
import path from 'path';
import { client as redis } from '../../utils/redis.js';
import { supabase, supabaseAdmin } from '../../utils/supabaseClient.js';
import { promises as fs } from 'fs';
import fsSync from 'fs';

// Fungsi utilitas untuk memastikan nomor tujuan WhatsApp valid
function formatWhatsAppJid(to) {
  if (!to) return '';
  // Jika sudah mengandung @, return apa adanya
  if (to.includes('@')) return to;
  // Hanya ambil digit
  const clean = to.replace(/[^0-9]/g, '');
  return `${clean}@s.whatsapp.net`;
}

// Fungsi untuk mengecek dan menjalankan trigger/action pesan masuk
async function checkAndRunMessageTriggers({ message, connectionId, from, apiKey }) {
  try {
    // Ambil semua trigger aktif untuk connection ini
    const { data: triggers, error } = await supabase
      .from('message_triggers')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('status', 'active');
    if (error) {
      console.error('[MessageTriggers] Error loading triggers:', error);
      return;
    }
    if (!triggers || triggers.length === 0) return;
    for (const trig of triggers) {
      if (checkTrigger(trig.trigger, message)) {
        await runAction(trig.action, { message, from, connectionId, apiKey });
      }
    }
  } catch (err) {
    console.error('[MessageTriggers] Error in checkAndRunMessageTriggers:', err);
  }
}

// Fungsi untuk mengecek trigger (bisa dikembangkan)
function checkTrigger(trigger, message) {
  // Contoh: trigger = { type: 'contains', keyword: 'promo' }
  if (!trigger || !message) return false;
  if (trigger.type === 'contains') {
    return message && message.toLowerCase().includes(trigger.keyword.toLowerCase());
  }
  // Tambahkan tipe trigger lain sesuai kebutuhan
  return false;
}

// Fungsi untuk menjalankan action (bisa dikembangkan)
async function runAction(action, { message, from, connectionId, apiKey }) {
  // Contoh: action = { type: 'reply', message: 'Terima kasih sudah menghubungi kami!' }
  if (!action) return;
  if (action.type === 'reply') {
    // Kirim pesan balasan
    const connectionManager = getConnectionManager();
    const connection = connectionManager.getConnection(connectionId);
    if (connection && connection.socket) {
      await connection.socket.sendMessage(from, { text: action.message });
      console.log(`[MessageTriggers] Sent auto-reply to ${from}`);
    }
  }
  // Tambahkan tipe action lain sesuai kebutuhan
}

export const sendMessage = async (req, res) => { 
  try {
    const start = Date.now();
    let apiKey = req.apiKey; // Ambil dari middleware
    let connectionId = req.connectionId; // Ambil dari middleware
    let { 
      to, 
      message, 
      type, 
      isBroadcast, 
      mediaUrl, 
      caption, 
      mediaFullPath,
      media = [], // Parameter baru untuk multiple media
      content, // Parameter untuk kompatibilitas dengan fallback
      options // Parameter untuk kompatibilitas dengan fallback
    } = req.body;
    
    // Untuk kompatibilitas dengan whatsappMessageHandler.sendMessageFallback
    if (content && !message && !type) {
      if (typeof content === 'string') {
        message = content;
        type = 'text';
      } else if (content && typeof content === 'object') {
        // Menangani format content dari whatsappMessageHandler
        if (content.text) {
          message = content.text;
          type = 'text';
        } else {
          // Cek jenis media
          const mediaTypes = ['image', 'video', 'audio', 'document', 'sticker'];
          for (const mediaType of mediaTypes) {
            if (content[mediaType]) {
              type = 'media';
              // Jika media adalah buffer atau data binary
              if (Buffer.isBuffer(content[mediaType]) || (content[mediaType] instanceof Uint8Array)) {
                media = [{
                  buffer: content[mediaType],
                  mimetype: content.mimetype || 'application/octet-stream',
                  filename: content.fileName || 'file'
                }];
              } 
              // Jika media adalah URL
              else if (typeof content[mediaType] === 'object' && content[mediaType].url) {
                mediaUrl = content[mediaType].url;
              }
              caption = content.caption || '';
              break;
            }
          }
        }
      }
    }
    
    let debugLog = { initialApiKey: apiKey, initialConnectionId: connectionId };

    if (!connectionId && req.connection && req.connection.id) {
      connectionId = req.connection.id;
      debugLog.fromReqConnection = connectionId;
    }

    // Coba dapatkan apiKey dari header jika belum ada
    if (!apiKey && req.headers['authorization']) {
      apiKey = req.headers['authorization'].replace('Bearer ', '').trim();
      debugLog.apiKeyFromHeader = apiKey;
    }
    
    if (!connectionId && apiKey) {
        connectionId = await redis.get(`api_key:${apiKey}:connection_id`);
        debugLog.fromRedis = connectionId;
        if (!connectionId) {
          const { data, error } = await supabase
            .from('connections')
            .select('id')
            .eq('api_key', apiKey)
            .maybeSingle();
          if (!error && data && data.id) {
            connectionId = data.id;
            debugLog.fromDb = connectionId;
            await redis.set(`api_key:${apiKey}:connection_id`, connectionId);
          }
        }
      }
    
    // PERBAIKAN: Hapus tanda kutip ganda dari connectionId jika ada
    if (connectionId && typeof connectionId === 'string' && connectionId.startsWith('"') && connectionId.endsWith('"')) {
      connectionId = connectionId.slice(1, -1);
    }
    
    debugLog.finalConnectionId = connectionId;

    if (!type) type = 'text';

    if (!connectionId || !to) {
      console.error('Missing connectionId or to', debugLog);
      return res.status(400).json({ success: false, error: 'connectionId dan to diperlukan', debug: debugLog });
    }

    const connectionManager = getConnectionManager();
    let connection = connectionManager.getConnection(connectionId);

    // PERBAIKAN: Tambahkan mekanisme retry untuk mendapatkan koneksi
    if (!connection || !connection.socket) {
      console.log(`[MessageService] Connection ${connectionId} not immediately available. Retrying...`);
      let retries = 3;
      while (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Tunggu 2 detik
        connection = connectionManager.getConnection(connectionId);
        if (connection && connection.socket) {
          console.log(`[MessageService] Connection ${connectionId} found after retry.`);
          break;
        }
        retries--;
      }
    }

    if (!connection || !connection.socket) {
      console.error('Connection not found or not ready', { connectionId, debugLog });
      return res.status(404).json({ success: false, error: 'Koneksi tidak ditemukan atau belum siap', debug: debugLog });
    }

    const formattedTo = formatWhatsAppJid(to);

    // Prioritas utama: media dari path absolut (untuk worker)
    if (mediaFullPath && typeof mediaFullPath === 'string') {
      
      if (!fsSync.existsSync(mediaFullPath)) {
        return res.status(400).json({ success: false, error: 'File tidak ditemukan di mediaFullPath', filePath: mediaFullPath });
      }
      
      const fileBuffer = await fs.readFile(mediaFullPath);
      const ext = path.extname(mediaFullPath).toLowerCase();
        let mediaType = 'document';
        let mimetype = 'application/octet-stream';
      if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) { mediaType = 'image'; mimetype = 'image/jpeg'; }
      else if ([".mp4", ".mov"].includes(ext)) { mediaType = 'video'; mimetype = 'video/mp4'; }
      else if ([".mp3", ".ogg"].includes(ext)) { mediaType = 'audio'; mimetype = 'audio/mpeg'; }
      
        const sentMedia = await connection.socket.sendMessage(formattedTo, {
          [mediaType]: fileBuffer,
          mimetype,
        fileName: path.basename(mediaFullPath),
        caption: caption || undefined
        });

      return res.status(200).json({ success: true, messageId: sentMedia.key.id });
    }

    // Logika untuk tipe pesan standar
    if (type === 'text') {
      if (!message) return res.status(400).json({ success: false, error: 'message diperlukan untuk pesan text' });
      const sent = await connection.socket.sendMessage(formattedTo, { text: message });
      return res.json({ success: true, messageId: sent.key.id, to });
    }

    if (type === 'media') {
      // NEW: Media array support (for broadcast)
      if (Array.isArray(media) && media.length > 0) {
        const results = [];
        
        for (const mediaItem of media) {
          // Validasi media item
          if (!mediaItem.url && !mediaItem.fullPath) {
            results.push({ 
              success: false, 
              error: 'Media harus memiliki url atau fullPath', 
              item: mediaItem 
            });
            continue;
          }
          
          try {
            // Jika ada fullPath, prioritaskan
            if (mediaItem.fullPath) {
              
              if (!fsSync.existsSync(mediaItem.fullPath)) {
                results.push({ 
                  success: false, 
                  error: 'File tidak ditemukan', 
                  fullPath: mediaItem.fullPath 
                });
                continue;
              }
              
              const fileBuffer = await fs.readFile(mediaItem.fullPath);
              let mediaType = 'document';
              let mimetype = mediaItem.mimetype || 'application/octet-stream';
              
              // Detect mediaType dari mimetype
              if (mimetype.startsWith('image/')) {
                mediaType = 'image';
              } else if (mimetype.startsWith('video/')) {
                mediaType = 'video';
              } else if (mimetype.startsWith('audio/')) {
                mediaType = 'audio';
              } else if (mimetype === 'application/pdf') {
                mediaType = 'document';
              }
              
              // Jika mimetype masih default, coba detect dari extension
              if (mimetype === 'application/octet-stream') {
                const ext = path.extname(mediaItem.fullPath).toLowerCase();
                if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) { 
                  mediaType = 'image'; 
                  mimetype = 'image/jpeg'; 
                }
                else if ([".mp4", ".mov"].includes(ext)) { 
                  mediaType = 'video'; 
                  mimetype = 'video/mp4'; 
                }
                else if ([".mp3", ".ogg"].includes(ext)) { 
                  mediaType = 'audio'; 
                  mimetype = 'audio/mpeg'; 
                }
                else if (ext === '.pdf') {
                  mediaType = 'document';
                  mimetype = 'application/pdf';
                }
              }
              
              const sentMedia = await connection.socket.sendMessage(formattedTo, {
                [mediaType]: fileBuffer,
                mimetype,
                fileName: mediaItem.filename || path.basename(mediaItem.fullPath),
                caption: mediaItem.caption || undefined
              });
              
              results.push({ 
                success: true, 
                messageId: sentMedia.key.id, 
                to,
                file: mediaItem.filename || path.basename(mediaItem.fullPath)
              });
            }
            // Gunakan URL
            else if (mediaItem.url) {
              let mediaType = 'document';
              let mimetype = mediaItem.mimetype || 'application/octet-stream';
              
              // Detect mediaType dari mimetype
              if (mimetype.startsWith('image/')) {
                mediaType = 'image';
              } else if (mimetype.startsWith('video/')) {
                mediaType = 'video';
              } else if (mimetype.startsWith('audio/')) {
                mediaType = 'audio';
              } else if (mimetype === 'application/pdf') {
                mediaType = 'document';
              }
              
              // Default option untuk semua jenis media
              const mediaOption = { url: mediaItem.url };
              
              const sentMedia = await connection.socket.sendMessage(formattedTo, {
                [mediaType]: mediaOption,
                mimetype,
                fileName: mediaItem.filename || 'file',
                caption: mediaItem.caption || undefined
              });
              
              results.push({ 
                success: true, 
                messageId: sentMedia.key.id, 
                to,
                file: mediaItem.filename || 'file',
                url: mediaItem.url
              });
            }
          } catch (err) {
            results.push({ 
              success: false, 
              error: err.message, 
              item: mediaItem 
            });
          }
        }
        
        return res.json({ 
          success: results.some(r => r.success), 
          results,
          totalSent: results.filter(r => r.success).length,
          totalFailed: results.filter(r => !r.success).length
        });
      }
      // Dari file upload (multipart/form-data)
      else if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        const results = [];
        for (const file of req.files) {
          let mediaType = 'document';
          if (file.mimetype.startsWith('image/')) mediaType = 'image';
          else if (file.mimetype.startsWith('video/')) mediaType = 'video';
          else if (file.mimetype.startsWith('audio/')) mediaType = 'audio';

          const sent = await connection.socket.sendMessage(formattedTo, {
            [mediaType]: file.buffer,
            mimetype: file.mimetype,
            fileName: file.originalname,
            caption: caption || undefined
          });
          results.push({ success: true, messageId: sent.key.id, to, file: file.originalname });
        }
        return res.json({ success: true, results });
      } 
      // Dari URL
      else if (mediaUrl) {
        const sent = await connection.socket.sendMessage(formattedTo, {
          image: { url: mediaUrl }, // Asumsi image, bisa dikembangkan
          caption: caption || undefined
        });
        return res.json({ success: true, messageId: sent.key.id, to, mediaUrl });
      }
    }
    
    res.status(400).json({ success: false, error: 'Tipe pesan tidak valid atau payload tidak lengkap' });

  } catch (err) {
    const errorMessage = err.message || 'Terjadi kesalahan internal';
    console.error(`[MessageService] Critical error in sendMessage for connection ${req.connectionId || 'N/A'}:`, err);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Gagal mengirim pesan: ' + errorMessage,
        details: err.stack,
      });
    }
  }
};

export const sendTyping = async (req, res) => {
  try {
    let { connectionId, to } = req.body;
    let debugLog = { initialConnectionId: connectionId };

    if (!connectionId && req.connection && req.connection.id) {
      connectionId = req.connection.id;
      debugLog.fromReqConnection = connectionId;
    }

    if (!connectionId && req.headers['authorization']) {
      const apiKey = req.headers['authorization'].replace('Bearer ', '').trim();
      debugLog.apiKey = apiKey;
      if (apiKey) {
        connectionId = await redis.get(`api_key:${apiKey}:connection_id`);
        debugLog.fromRedis = connectionId;
        if (!connectionId) {
          const { data, error } = await supabase
            .from('connections')
            .select('id')
            .eq('api_key', apiKey)
            .maybeSingle();
          debugLog.dbResult = data;
          if (!error && data && data.id) {
            connectionId = data.id;
            debugLog.fromDb = connectionId;
            await redis.set(`api_key:${apiKey}:connection_id`, connectionId);
          }
        }
      }
    }

    debugLog.finalConnectionId = connectionId;
    if (!connectionId || !to) {
      console.error('Missing connectionId or to for typing', debugLog);
      return res.status(400).json({ success: false, error: 'connectionId dan to diperlukan', debug: debugLog });
    }

    const connectionManager = getConnectionManager();
    const connection = connectionManager.getConnection(connectionId);
    if (!connection || !connection.socket) {
      console.error('Connection not found for typing', { connectionId, debugLog });
      return res.status(404).json({ success: false, error: 'Koneksi tidak ditemukan atau belum siap', debug: debugLog });
    }
    
    const formattedTo = formatWhatsAppJid(to);
    await connection.socket.sendPresenceUpdate('composing', formattedTo);
    res.json({ success: true, message: 'Efek typing dikirim', to: formattedTo });
  } catch (error) {
    console.error('Error in sendTyping:', error.message);
    if (!res.headersSent) {
    res.status(500).json({ success: false, error: error.message });
    }
  }
};

export const sendFiles = async (req, res) => {
  try {
    let { connectionId, to, files } = req.body;
    let debugLog = { initialConnectionId: connectionId };

    if (!connectionId && req.connection && req.connection.id) {
      connectionId = req.connection.id;
      debugLog.fromReqConnection = connectionId;
    }

    if (!connectionId && req.headers['authorization']) {
      const apiKey = req.headers['authorization'].replace('Bearer ', '').trim();
      debugLog.apiKey = apiKey;
      if (apiKey) {
        connectionId = await redis.get(`api_key:${apiKey}:connection_id`);
        debugLog.fromRedis = connectionId;
        if (!connectionId) {
          const { data, error } = await supabase
            .from('connections')
            .select('id')
            .eq('api_key', apiKey)
            .maybeSingle();
          debugLog.dbResult = data;
          if (!error && data && data.id) {
            connectionId = data.id;
            debugLog.fromDb = connectionId;
            await redis.set(`api_key:${apiKey}:connection_id`, connectionId);
          }
        }
      }
    }

    debugLog.finalConnectionId = connectionId;
    if (!connectionId || !to || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: 'connectionId, to, dan files[] diperlukan', debug: debugLog });
    }

    const connectionManager = getConnectionManager();
    const connection = connectionManager.getConnection(connectionId);
    if (!connection || !connection.socket) {
      return res.status(404).json({ success: false, error: 'Koneksi tidak ditemukan atau belum siap', debug: debugLog });
    }

    const formattedTo = formatWhatsAppJid(to);
    const results = await Promise.all(files.map(async (file) => {
      if (!file.url || !file.filename || !file.mimetype) {
        return { success: false, error: 'url, filename, dan mimetype wajib', file };
      }
      let mediaType = 'document';
      if (file.mimetype.startsWith('image/')) mediaType = 'image';
      else if (file.mimetype.startsWith('video/')) mediaType = 'video';
      else if (file.mimetype.startsWith('audio/')) mediaType = 'audio';
      else if (file.filename.toLowerCase().endsWith('.pdf')) mediaType = 'document';
      
        const sent = await connection.socket.sendMessage(formattedTo, {
          [mediaType]: { url: file.url },
          mimetype: file.mimetype,
          fileName: file.filename,
          caption: file.caption || undefined
        });
        return { success: true, messageId: sent.key.id, to, file: file.filename };
      
    }));

    return res.json({ success: true, results });
  } catch (error) {
    console.error('Error in sendFiles:', error.message);
    if (!res.headersSent) {
    res.status(500).json({ success: false, error: error.message });
    }
  }
};

export const sendBubble = async (req, res) => {
  try {
    let { connectionId, to, message, messages, bubble = true, quoted, typingEffect = true, multibubble = true } = req.body;
    let debugLog = { initialConnectionId: connectionId };
    
    // Fungsi untuk mengkonversi string ke JSON jika memungkinkan
    const tryParseJSON = (str) => {
      try {
        return JSON.parse(str);
      } catch (e) {
        return str;
      }
    };

    // Fungsi untuk mengekstrak array pesan dari berbagai format
    const extractMessages = (input) => {
      if (Array.isArray(input)) {
        return input;
      } else if (typeof input === 'string') {
        const parsed = tryParseJSON(input);
        if (Array.isArray(parsed)) {
          return parsed;
        } else if (parsed && parsed.messages && Array.isArray(parsed.messages)) {
          return parsed.messages;
        }
        return [input];
      } else if (input && typeof input === 'object') {
        if (input.messages && Array.isArray(input.messages)) {
          return input.messages;
        }
        const nestedMessages = Object.values(input).find(val => Array.isArray(val));
        if (nestedMessages) {
          return nestedMessages;
        }
      }
      return null;
    };

    // Fungsi untuk memformat quoted message
    const formatQuotedMessage = (quotedId) => {
      if (!quotedId) return null;
      return {
        key: {
          remoteJid: formattedTo,
          id: quotedId
        }
      };
    };

    // Fungsi untuk menggabungkan pesan dengan format yang lebih baik
    const combineMessages = (messages) => {
      return messages
        .map(msg => msg.trim()) // Trim setiap pesan
        .filter(msg => msg.length > 0) // Hapus pesan kosong
        .join('\n\n'); // Gabungkan dengan double newline
    };
    
    // Validasi input dan normalisasi format
    let messageArray;
    if (messages) {
      messageArray = extractMessages(messages);
    } else if (message) {
      messageArray = extractMessages(message);
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'message atau messages diperlukan' 
      });
    }

    if (!messageArray || messageArray.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tidak ada pesan yang valid untuk dikirim' 
      });
    }

    // Cari connectionId jika tidak ada
    if (!connectionId && req.connection && req.connection.id) {
      connectionId = req.connection.id;
      debugLog.fromReqConnection = connectionId;
    }
    if (!connectionId && req.headers['authorization']) {
      const apiKey = req.headers['authorization'].replace('Bearer ', '').trim();
      debugLog.apiKey = apiKey;
      if (apiKey) {
        connectionId = await redis.get(`api_key:${apiKey}:connection_id`);
        debugLog.fromRedis = connectionId;
        if (!connectionId) {
          const { data, error } = await supabase
            .from('connections')
            .select('id')
            .eq('api_key', apiKey)
            .maybeSingle();
          debugLog.dbResult = data;
          if (!error && data && data.id) {
            connectionId = data.id;
            debugLog.fromDb = connectionId;
            await redis.set(`api_key:${apiKey}:connection_id`, connectionId);
          }
        }
      }
    }
    debugLog.finalConnectionId = connectionId;

    if (!connectionId || !to) {
      console.error('Missing connectionId or to', debugLog);
      return res.status(400).json({ 
        success: false, 
        error: 'connectionId dan to diperlukan', 
        debug: debugLog 
      });
    }

    const connectionManager = getConnectionManager();
    const connection = connectionManager.getConnection(connectionId);
    if (!connection || !connection.socket) {
      return res.status(404).json({ 
        success: false, 
        error: 'Koneksi tidak ditemukan atau belum siap', 
        debug: debugLog 
      });
    }

    const formattedTo = formatWhatsAppJid(to);
    const results = [];
    const delay = process.env.BUBBLE_DELAY || 100; // Default 1 detik jika tidak ada di .env

    // Format quoted message jika ada
    const formattedQuoted = formatQuotedMessage(quoted);
    //console.log(JSON.stringify(formattedQuoted));

    // Jika multibubble = false, gabungkan semua pesan menjadi satu
    if (!multibubble) {
      const combinedMessage = combineMessages(messageArray);
      try {
        // Kirim efek typing jika diaktifkan
        if (typingEffect) {
          await connection.socket.sendPresenceUpdate('composing', formattedTo);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Kirim pesan dengan quoted jika ada
        const messageOptions = { text: combinedMessage };
        if (formattedQuoted) {
          messageOptions.quoted = formattedQuoted;
        }
        
        const sent = await connection.socket.sendMessage(formattedTo, messageOptions);
        results.push({ 
          success: true, 
          messageId: sent.key.id, 
          to, 
          message: combinedMessage,
          quoted: !!formattedQuoted,
          multibubble: false
        });
      } catch (err) {
        results.push({ 
          success: false, 
          error: err.message, 
          message: combinedMessage,
          quoted: !!formattedQuoted,
          multibubble: false
        });
      }
    } else {
      // Kirim pesan satu per satu dengan jeda
      for (let i = 0; i < messageArray.length; i++) {
        try {
          // Kirim efek typing jika diaktifkan
          if (typingEffect) {
            await connection.socket.sendPresenceUpdate('composing', formattedTo);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          // Kirim pesan dengan quoted hanya untuk pesan pertama jika ada quoted
          const messageOptions = { text: messageArray[i] };
          if (formattedQuoted && i === 0) {
            messageOptions.quoted = formattedQuoted;
          }
          
          const sent = await connection.socket.sendMessage(formattedTo, messageOptions);
          results.push({ 
            success: true, 
            messageId: sent.key.id, 
            to, 
            message: messageArray[i],
            quoted: i === 0 && !!formattedQuoted,
            multibubble: true
          });
          
          // Tunggu lagi sebelum pesan berikutnya
          await new Promise(resolve => setTimeout(resolve, delay));
        } catch (err) {
          results.push({ 
            success: false, 
            error: err.message, 
            message: messageArray[i],
            quoted: i === 0 && !!formattedQuoted,
            multibubble: true
          });
        }
      }
    }

    return res.json({ success: true, results });
  } catch (error) {
    console.error('Error in sendBubble:', error.message);
    if (!res.headersSent) {
    res.status(500).json({ success: false, error: error.message });
    }
  }
};

export const getMessageHistory = async (req, res) => {
  try {
    // ... existing code ...
    
    // Ambil pesan dari database
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('jid', jid)
      .order('timestamp', { ascending: false })
      .limit(limit)
      .range(offset, offset + limit - 1);
      
    // ... existing code ...
  } catch (error) {
    // ... existing code ...
  }
};

export const getContactsWithMessages = async (req, res) => {
  try {
    // ... existing code ...
    
    // Ambil kontak dengan pesan terbaru
    const { data, error } = await supabase
      .rpc('get_contacts_with_latest_message', { 
        connection_id_param: connectionId,
        limit_param: limit,
        offset_param: offset
      });
      
    // ... existing code ...
  } catch (error) {
    // ... existing code ...
  }
};

export const getContactMessageStats = async (req, res) => {
  try {
    // ... existing code ...
    
    // Ambil statistik pesan per kontak
    const { data, error } = await supabase
      .rpc('get_contact_message_stats', { 
        connection_id_param: connectionId,
        limit_param: limit,
        offset_param: offset
      });
      
    // ... existing code ...
  } catch (error) {
    // ... existing code ...
  }
}; 