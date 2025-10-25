import db from '../../database/database.js';

/**
 * Create a new broadcast job
 * @param {string} connectionId - ID koneksi WhatsApp
 * @param {string} message - Pesan yang akan dikirim
 * @param {Array} contacts - Array of contacts to send message to
 * @param {Object} options - Additional options (type, mediaUrl, etc)
 * @param {string} userId - User ID yang membuat broadcast
 * @param {boolean} isBroadcast - Flag untuk menentukan apakah job ini broadcast (true) atau drip campaign (false)
 * @returns {Promise<Object>} - Created job
 */
async function create(connectionId, message, contacts, options = {}, userId = null, isBroadcast = true) {
  try {
    // Prepare data yang akan dimasukkan ke database
    const contactsCount = Array.isArray(contacts) ? contacts.length : 0;
    
    const defaultData = {
      connection_id: connectionId,
      message: message,
      contacts_total: contactsCount,
      contacts_processed: 0,
      contacts_success: 0,
      contacts_failed: 0,
      contacts_json: JSON.stringify(contacts),
      type: options.type || 'text',
      // Mengubah: Mengganti mediaUrl/mediaFullPath/caption dengan media
      media: options.media || null,
      status: options.status || 'queued',
      created_at: new Date(),
      updated_at: new Date(),
      user_id: userId,
      is_broadcast: isBroadcast
    };
    
    // Opsional fields
    if (options.schedule) {
      defaultData.schedule = options.schedule;
    }
    
    if (options.speed) {
      defaultData.speed = options.speed;
    }
    
    if (options.isprivatemessage !== undefined) {
      defaultData.is_private_message = options.isprivatemessage;
    }
    
    if (options.contact_id) {
      defaultData.contact_id = options.contact_id;
    }
    
    if (options.broadcast_name) {
      defaultData.broadcast_name = options.broadcast_name;
    }
    
    // Execute SQL
    const sql = `
      INSERT INTO broadcast_jobs
        (connection_id, message, contacts_total, contacts_processed, 
        contacts_success, contacts_failed, contacts_json, type, 
        media, status, created_at, updated_at, 
        user_id, is_broadcast, schedule, speed, is_private_message, 
        contact_id, broadcast_name)
      VALUES 
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      defaultData.connection_id,
      defaultData.message,
      defaultData.contacts_total,
      defaultData.contacts_processed,
      defaultData.contacts_success,
      defaultData.contacts_failed,
      defaultData.contacts_json,
      defaultData.type,
      defaultData.media,
      defaultData.status,
      defaultData.created_at,
      defaultData.updated_at,
      defaultData.user_id,
      defaultData.is_broadcast,
      defaultData.schedule || null,
      defaultData.speed || 'normal',
      defaultData.is_private_message || false,
      defaultData.contact_id || null,
      defaultData.broadcast_name || null
    ];
    
    const [result] = await db.query(sql, values);
    
    if (result && result.insertId) {
      return {
        id: result.insertId,
        ...defaultData
      };
    }
    
    throw new Error('Failed to create broadcast job');
  } catch (err) {
    console.error('Error creating broadcast job:', err);
    throw err;
  }
}

// ... other functions stay the same ...

export {
  create,
  // ... exports stay the same ...
}; 