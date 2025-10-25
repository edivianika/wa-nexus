// Simplified Supabase client for broadcast module
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
// Use service role key instead of anon key to bypass RLS
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Broadcast Jobs
const broadcastJobs = {
  // Create a new broadcast job
  create: async (connectionId, message, contacts, options = {}, userId = null, isBroadcast = true) => {

    // Jika bukan broadcast (misal: pesan drip), jangan simpan ke database.
    // Cukup kembalikan struktur data dummy agar sisa alur tidak error.
    if (!isBroadcast) {
      return { 
        id: `drip-${Date.now()}`, // ID dummy
        ...options 
      };
    }

    const jobData = {
      connection_id: connectionId,
      message: message,
      type: options.type || 'text',
      media_url: options.mediaUrl || null,
      schedule: options.schedule || null,
      speed: options.speed || 'normal',
      total_contacts: contacts.length,
      status: options.schedule && new Date(options.schedule) > new Date() ? 'queued' : 'active',
      contacts, // simpan array of object untuk audit
      user_id: userId || null, // tambahkan user_id
      isprivatemessage: typeof options.isPrivateMessage === 'boolean' ? options.isPrivateMessage : false,
      contact_id: typeof options.contact_id === 'string' ? options.contact_id : null,
      broadcast_name: typeof options.broadcast_name === 'string' ? options.broadcast_name : null
    };

    const { data, error } = await supabase
      .from('broadcast_jobs')
      .insert([jobData])
      .select();
    
    if (error) throw error;
    
    // Create message entries for each contact
    const messages = contacts.map(contact => {
      if (typeof contact === 'string') {
        return {
          job_id: data[0].id,
          contact: contact.replace(/\D/g, ''),
          status: 'waiting'
        };
      } else {
        // Ambil phone_number, simpan data tambahan jika ada kolom data
        const { phone_number, ...extra } = contact;
        const msg = {
          job_id: data[0].id,
          contact: phone_number.replace(/\D/g, ''),
          status: 'waiting'
        };
        if (Object.keys(extra).length > 0) {
          msg.data = extra; // hanya jika kolom data ada di DB
        }
        return msg;
      }
    });
    
    // Insert messages in chunks to avoid payload limits
    const chunkSize = 1000;
    for (let i = 0; i < messages.length; i += chunkSize) {
      const chunk = messages.slice(i, i + chunkSize);
      const { error: msgError } = await supabase
        .from('broadcast_messages')
        .insert(chunk);
      
      if (msgError) throw msgError;
    }
    
    return data[0];
  },

  // Get broadcast history
  getHistory: async (connectionId, limit = 100) => {
    const { data, error } = await supabase
      .from('broadcast_jobs')
      .select('*')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  },

  // Get all broadcast jobs by API key
  getByApiKey: async (apiKey, limit = 100) => {
    // First get the connections associated with this API key
    const { data: connections, error: connError } = await supabase
      .from('connections')
      .select('id')
      .eq('api_key', apiKey);
    
    if (connError) throw connError;
    
    if (!connections || connections.length === 0) {
      return [];
    }
    
    // Get all connection IDs
    const connectionIds = connections.map(conn => conn.id);
    
    // Get broadcast jobs for these connections
    const { data, error } = await supabase
      .from('broadcast_jobs')
      .select('*')
      .in('connection_id', connectionIds)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  },

  // Get scheduled broadcasts
  getScheduled: async (connectionId) => {
    const { data, error } = await supabase
      .from('broadcast_jobs')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('status', 'queued')
      .gt('schedule', new Date().toISOString())
      .order('schedule', { ascending: true });
    
    if (error) throw error;
    return data;
  },

  // Get scheduled broadcasts by API key
  getScheduledByApiKey: async (apiKey) => {
    // First get the connections associated with this API key
    const { data: connections, error: connError } = await supabase
      .from('connections')
      .select('id')
      .eq('api_key', apiKey);
    
    if (connError) throw connError;
    
    if (!connections || connections.length === 0) {
      return [];
    }
    
    // Get all connection IDs
    const connectionIds = connections.map(conn => conn.id);
    
    // Get scheduled broadcast jobs for these connections
    const { data, error } = await supabase
      .from('broadcast_jobs')
      .select('*')
      .in('connection_id', connectionIds)
      .eq('status', 'queued')
      .gt('schedule', new Date().toISOString())
      .order('schedule', { ascending: true });
    
    if (error) throw error;
    return data;
  },

  // Get job details with status summary
  getJobDetails: async (jobId) => {
    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('broadcast_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (jobError) throw jobError;
    
    // Get status summary
    const { data: statusSummary, error: summaryError } = await supabase
      .rpc('get_message_status_counts', { job_id: jobId });
    
    if (summaryError) {
      // Fallback if RPC not available
      const { data: messages, error: msgError } = await supabase
        .from('broadcast_messages')
        .select('status')
        .eq('job_id', jobId);
      
      if (msgError) throw msgError;
      
      const summary = {
        sent: messages.filter(m => m.status === 'sent').length,
        failed: messages.filter(m => m.status === 'failed').length,
        waiting: messages.filter(m => m.status === 'waiting').length,
        skipped: messages.filter(m => m.status === 'skipped').length
      };
      
      return { ...job, statusSummary: summary };
    }
    
    return { ...job, statusSummary: statusSummary };
  },

  // Update job status
  updateStatus: async (jobId, status, progress = null) => {
    // Check if status is an object (for backward compatibility)
    const updates = typeof status === 'object' 
      ? { 
          status: status.status || 'completed',
          progress: progress !== null ? progress : undefined,
          completed_at: status.completed_at || new Date().toISOString(),
          sent_count: status.sent_count || 0,
          failed_count: status.failed_count || 0,
          skipped_count: status.skipped_count || 0
        }
      : { 
          status,
          progress: progress !== null ? progress : undefined
        };
    
    if (status === 'completed' || (typeof status === 'object' && status.status === 'completed')) {
      updates.completed_at = new Date().toISOString();
    }
    
    const { data, error } = await supabase
      .from('broadcast_jobs')
      .update(updates)
      .eq('id', jobId)
      .select();
    
    if (error) throw error;
    return data[0];
  },

  // Cancel a scheduled broadcast
  cancelScheduled: async (jobId) => {
    const { data, error } = await supabase
      .from('broadcast_jobs')
      .update({ status: 'cancelled' })
      .eq('id', jobId)
      .eq('status', 'queued')
      .select();
    
    if (error) throw error;
    return data[0];
  }
};

// Message Management
const messages = {
  // Update message status
  updateStatus: async (jobId, contact, status, messageId = null, error = null) => {
    console.log(`[MessageService] Updating message status for job ${jobId}, contact ${contact} to ${status}`);
    
    try {
      // Normalize the contact number (remove any non-digit characters)
      const normalizedContact = contact.toString().replace(/\D/g, '');
      
      const updates = {
        status,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
        message_id: messageId,
        error,
        updated_at: new Date().toISOString() // Explicitly set updated_at
      };
      
      console.log(`[MessageService] Update payload:`, updates);
      
      const { data, error: updateError } = await supabase
        .from('broadcast_messages')
        .update(updates)
        .eq('job_id', jobId)
        .eq('contact', normalizedContact);
        
      if (updateError) {
        console.error(`[MessageService] Error updating message status:`, updateError);
        throw updateError;
      }
      
      // Verify the update was successful by fetching the updated record
      const { data: verifyData, error: verifyError } = await supabase
        .from('broadcast_messages')
        .select('status, updated_at')
        .eq('job_id', jobId)
        .eq('contact', normalizedContact)
        .single();
        
      if (verifyError) {
        console.warn(`[MessageService] Error verifying update:`, verifyError);
      } else {
        console.log(`[MessageService] Verified update: Status is now ${verifyData.status}`);
      }
      
      return data;
    } catch (err) {
      console.error(`[MessageService] Exception in updateStatus:`, err);
      throw err;
    }
  },

  // Get messages for a job
  getByJobId: async (jobId, status = null, limit = 50) => {
    let query = supabase
      .from('broadcast_messages')
      .select('*')
      .eq('job_id', jobId)
      .limit(limit);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data;
  },

  // Get failed messages
  getFailedMessages: async (jobId) => {
    const { data, error } = await supabase
      .from('broadcast_messages')
      .select('*')
      .eq('job_id', jobId)
      .eq('status', 'failed');
    
    if (error) throw error;
    return data;
  }
};

// Contact Management
const contacts = {
  // Import contacts
  import: async (connectionId, contactsList) => {
    const contacts = contactsList.map(contact => ({
      connection_id: connectionId,
      contact: contact.toString().trim().replace(/\D/g, '')
    }));
    
    // Gunakan metode insert dengan penanganan error
    try {
      // Coba insert semua contacts
      const { data, error } = await supabase
        .from('broadcast_contacts')
        .insert(contacts);
      
      if (error) {
        // Jika error, insert satu per satu untuk menangani duplikat
        console.warn('Bulk insert failed, trying one by one to handle duplicates');
        const results = [];
        
        for (const contact of contacts) {
          try {
            // Cek apakah contact sudah ada
            const { data: existingContact } = await supabase
              .from('broadcast_contacts')
              .select('id')
              .eq('connection_id', contact.connection_id)
              .eq('contact', contact.contact)
              .maybeSingle();
              
            if (existingContact) {
              // Contact sudah ada, skip
              results.push(existingContact);
            } else {
              // Contact belum ada, insert baru
              const { data: newContact, error: insertError } = await supabase
                .from('broadcast_contacts')
                .insert(contact)
                .select()
                .maybeSingle();
                
              if (insertError) {
                console.error(`Error inserting contact ${contact.contact}:`, insertError);
              } else if (newContact) {
                results.push(newContact);
              }
            }
          } catch (contactError) {
            console.error(`Error processing contact ${contact.contact}:`, contactError);
          }
        }
        
        return results;
      }
      
      return data;
    } catch (importError) {
      console.error('Error importing contacts:', importError);
      throw importError;
    }
  },

  // Get all contacts
  getAll: async (connectionId) => {
    const { data, error } = await supabase
      .from('broadcast_contacts')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('is_blacklisted', false);
    
    if (error) throw error;
    return data;
  },

  // Add to blacklist
  blacklist: async (connectionId, contactsList) => {
    const { data, error } = await supabase
      .from('broadcast_contacts')
      .update({ is_blacklisted: true })
      .eq('connection_id', connectionId)
      .in('contact', contactsList)
      .select();
    
    if (error) throw error;
    return data;
  },

  // Remove from blacklist
  unblacklist: async (connectionId, contactsList) => {
    const { data, error } = await supabase
      .from('broadcast_contacts')
      .update({ is_blacklisted: false })
      .eq('connection_id', connectionId)
      .in('contact', contactsList)
      .select();
    
    if (error) throw error;
    return data;
  },

  // Get blacklisted contacts
  getBlacklist: async (connectionId) => {
    const { data, error } = await supabase
      .from('broadcast_contacts')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('is_blacklisted', true);
    
    if (error) throw error;
    return data;
  }
};

export {
  supabase,
  broadcastJobs,
  messages,
  contacts
}; 