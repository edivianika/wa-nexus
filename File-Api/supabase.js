const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Mengambil kredensial dari file .env
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

// Jika kredensial tidak ada, tampilkan pesan error
if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase credentials are missing in .env file');
  console.error('Please provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

// Membuat client Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Fungsi untuk menyimpan informasi file yang diupload ke Supabase
async function saveFileInfo(fileData, agenId, userId) {
  try {
    const { data, error } = await supabase
      .from('files')
      .insert([
        {
          original_filename: fileData.originalName,
          mimetype: fileData.mimetype,
          size: fileData.size,
          file_path: `Files/${fileData.filename}`,
          user_id: userId,
          agent_id: agenId,
          status: 'pending',
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('Error saving file info to Supabase:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Exception when saving to Supabase:', err);
    return { success: false, error: err.message };
  }
}

// Fungsi untuk mendapatkan semua file
async function getFiles() {
  try {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting files from Supabase:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Exception when getting files from Supabase:', err);
    return { success: false, error: err.message };
  }
}

// Fungsi untuk mendapatkan file berdasarkan user_id
async function getFilesByUserId(userId) {
  try {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting files by user_id from Supabase:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Exception when getting files by user_id from Supabase:', err);
    return { success: false, error: err.message };
  }
}

// Fungsi untuk mendapatkan file berdasarkan agent_id
async function getFilesByAgentId(agentId) {
  try {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting files by agent_id from Supabase:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Exception when getting files by agent_id from Supabase:', err);
    return { success: false, error: err.message };
  }
}

// Fungsi untuk menghapus file berdasarkan id
async function deleteFileById(fileId) {
  try {
    // Ambil data file terlebih dahulu untuk mengembalikan informasi file yang dihapus
    const { data: fileData, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();
    
    if (fileError) {
      console.error('Error getting file by id from Supabase:', fileError);
      return { success: false, error: fileError };
    }
    
    // Jika file tidak ditemukan
    if (!fileData) {
      return { success: false, error: 'File tidak ditemukan' };
    }
    
    // Hapus file dari database
    const { error } = await supabase
      .from('files')
      .delete()
      .eq('id', fileId);

    if (error) {
      console.error('Error deleting file by id from Supabase:', error);
      return { success: false, error };
    }

    return { success: true, data: fileData };
  } catch (err) {
    console.error('Exception when deleting file by id from Supabase:', err);
    return { success: false, error: err.message };
  }
}

// Fungsi untuk menghapus file berdasarkan user_id
async function deleteFilesByUserId(userId) {
  try {
    // Ambil data file terlebih dahulu untuk mengembalikan informasi file yang dihapus
    const { data: fileData, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', userId);
    
    if (fileError) {
      console.error('Error getting files by user_id from Supabase:', fileError);
      return { success: false, error: fileError };
    }
    
    // Jika tidak ada file
    if (!fileData || fileData.length === 0) {
      return { success: true, data: [] };
    }
    
    // Hapus file dari database
    const { error } = await supabase
      .from('files')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting files by user_id from Supabase:', error);
      return { success: false, error };
    }

    return { success: true, data: fileData };
  } catch (err) {
    console.error('Exception when deleting files by user_id from Supabase:', err);
    return { success: false, error: err.message };
  }
}

// Fungsi untuk menghapus file berdasarkan agent_id
async function deleteFilesByAgentId(agentId) {
  try {
    // Ambil data file terlebih dahulu untuk mengembalikan informasi file yang dihapus
    const { data: fileData, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('agent_id', agentId);
    
    if (fileError) {
      console.error('Error getting files by agent_id from Supabase:', fileError);
      return { success: false, error: fileError };
    }
    
    // Jika tidak ada file
    if (!fileData || fileData.length === 0) {
      return { success: true, data: [] };
    }
    
    // Hapus file dari database
    const { error } = await supabase
      .from('files')
      .delete()
      .eq('agent_id', agentId);

    if (error) {
      console.error('Error deleting files by agent_id from Supabase:', error);
      return { success: false, error };
    }

    return { success: true, data: fileData };
  } catch (err) {
    console.error('Exception when deleting files by agent_id from Supabase:', err);
    return { success: false, error: err.message };
  }
}

// Fungsi untuk menambahkan atau memperbarui kontak
async function upsertContact(contactData) {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .upsert([
        {
          owner_id: contactData.owner_id,
          phone_number: contactData.phone_number,
          contact_name: contactData.contact_name,
          agent_id: contactData.agent_id,
          updated_at: new Date().toISOString()
        }
      ], {
        onConflict: 'owner_id,phone_number'
      });

    if (error) {
      console.error('Error upserting contact to Supabase:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Exception when upserting contact to Supabase:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  supabase,
  saveFileInfo,
  getFiles,
  getFilesByUserId,
  getFilesByAgentId,
  deleteFileById,
  deleteFilesByUserId,
  deleteFilesByAgentId,
  upsertContact
}; 