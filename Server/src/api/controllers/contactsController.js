import { removeSetMember, del, keys } from '../../utils/redis.js';

export const deleteContact = async (req, res) => {
  try {
    const { user_id, phone_number } = req.body;
    if (!user_id || !phone_number) {
      return res.status(400).json({
        success: false,
        error: 'user_id dan phone_number wajib diisi.'
      });
    }

    // Hapus dari set contacts:user_id
    const redisKey = `contacts:${user_id}`;
    const removed = await removeSetMember(redisKey, phone_number);
    
    // Hapus data Redis lainnya yang terkait dengan nomor HP ini
    const phoneNumberPatterns = [
      `contact:*:${phone_number}`,           // Data kontak spesifik
      `message:*:${phone_number}`,           // Data pesan
      `lead_score:*:${phone_number}`,        // Data lead score
      `conversation:*:${phone_number}`,      // Data percakapan
      `session:*:${phone_number}`,           // Data session
      `cache:*:${phone_number}`,             // Data cache
      `temp:*:${phone_number}`,              // Data temporary
      `*:${phone_number}:*`,                  // Pattern umum untuk nomor HP
    ];

    let deletedKeys = [];
    
    // Hapus data berdasarkan pattern
    for (const pattern of phoneNumberPatterns) {
      try {
        const matchingKeys = await keys(pattern);
        if (matchingKeys && matchingKeys.length > 0) {
          for (const key of matchingKeys) {
            const deleted = await del(key);
            if (deleted) {
              deletedKeys.push(key);
            }
          }
        }
      } catch (patternError) {
        console.warn(`Warning: Could not process pattern ${pattern}:`, patternError.message);
        // Continue with other patterns
      }
    }

    // Hapus juga data yang mungkin menggunakan format JID WhatsApp
    const whatsappJidPatterns = [
      `${phone_number}@s.whatsapp.net`,
      `${phone_number}@lid`,
    ];

    for (const jidPattern of whatsappJidPatterns) {
      const jidKeys = [
        `contact:*:${jidPattern}`,
        `message:*:${jidPattern}`,
        `*:${jidPattern}:*`,
      ];

      for (const pattern of jidKeys) {
        try {
          const matchingKeys = await keys(pattern);
          if (matchingKeys && matchingKeys.length > 0) {
            for (const key of matchingKeys) {
              const deleted = await del(key);
              if (deleted) {
                deletedKeys.push(key);
              }
            }
          }
        } catch (jidError) {
          console.warn(`Warning: Could not process JID pattern ${pattern}:`, jidError.message);
        }
      }
    }

    if (removed || deletedKeys.length > 0) {
      return res.json({ 
        success: true, 
        message: 'Kontak berhasil dihapus dari Redis.',
        deletedKeys: deletedKeys,
        totalDeleted: deletedKeys.length + (removed ? 1 : 0)
      });
    } else {
      return res.status(404).json({ 
        success: false, 
        error: 'Kontak tidak ditemukan di Redis.' 
      });
    }
  } catch (error) {
    console.error('Error in deleteContact:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}; 