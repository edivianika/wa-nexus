/**
 * Contact action handler for message triggers
 * Saves contact information to the database
 */

/**
 * Adds a contact to the database based on the message sender
 * @param {object} action - The save_contact action configuration
 * @param {object} context - Message context containing all relevant message data
 * @returns {Promise<object>} - Result of the contact save operation
 */
async function execute(action, context) {
  const { connection, alldata, user_id } = context;

  if (!connection) {
    throw new Error('Connection object is missing in context');
  }
  
  const redis = connection.configManager?.redis;
  const supabase = connection.supabase;
  
  if (!redis || !supabase) {
    throw new Error('Missing required services: redis or supabase from connection');
  }

  if (!user_id) {
    throw new Error('User ID is missing from context and is required to save contacts');
  }
  
  const phoneNumber = alldata.key.remoteJid.split('@')[0];
  const senderName = alldata.pushName || alldata.businessName || 'Unknown';
  const connectionId = connection.id || null;
  
  let contactName = action.contact_name || senderName;
  if (typeof contactName === 'string' && contactName.includes('{{sender_name}}')) {
    contactName = contactName.replace(/{{sender_name}}/g, senderName);
  }
  
  // Ensure labels is an array
  let labels = [];
  if (Array.isArray(action.label)) {
    labels = [...action.label]; // Create a copy of the array
  } else if (typeof action.label === 'string' && action.label.trim()) {
    labels = [action.label.trim()];
  } else if (action.labels && Array.isArray(action.labels)) {
    // Check if there's a 'labels' property instead of 'label'
    labels = [...action.labels];
  }
  
  // Ensure labels is a valid Postgres array
  if (!Array.isArray(labels)) {
    labels = [];
  }
  
  const agentId = connection.aiAgentId || connection.agentId || null;
  const redisSetKey = `contacts:${user_id}`;
  
  try {
    const added = await redis.sadd(redisSetKey, phoneNumber);
    
    if (added === 1) {
      // Coba insert terlebih dahulu
      try {
        const { data, error } = await supabase.from('contacts').insert({
          phone_number: phoneNumber,
          contact_name: contactName,
          owner_id: user_id,
          agent_id: agentId,
          connection_id: connectionId,
          labels: labels 
        }).select();
        
        if (error && error.code === '23505') { // Duplicate key error code
          // Jika duplicate key, update data yang sudah ada
          const { data: updateData, error: updateError } = await supabase
            .from('contacts')
            .update({
              contact_name: contactName,
              agent_id: agentId,
              connection_id: connectionId,
              labels: labels
            })
            .eq('phone_number', phoneNumber)
            .eq('owner_id', user_id)
            .select();
          
          if (updateError) {
            console.error('[TRIGGER:Contact] DB update error:', updateError);
            throw updateError;
          }
          
          return { success: true, isNew: false, contact: updateData };
        } else if (error) {
          console.error('[TRIGGER:Contact] DB insert error:', error);
          throw error;
        }
        
        return { success: true, isNew: true, contact: data };
      } catch (dbError) {
        console.error('[TRIGGER:Contact] Database operation error:', dbError.message);
        throw dbError;
      }
    } else {
      // Contact already exists in Redis, but we should still update labels
      const updatePayload2 = {
        contact_name: contactName,
        agent_id: agentId,
        connection_id: connectionId,
      };

      if (labels.length > 0) {
        const { data: existingContact2, error: fetchErr2 } = await supabase
          .from('contacts')
          .select('labels')
          .eq('phone_number', phoneNumber)
          .eq('owner_id', user_id)
          .single();
        if (!fetchErr2 && existingContact2) {
          const existingLabels2 = Array.isArray(existingContact2.labels) ? existingContact2.labels : [];
          const merged2 = Array.from(new Set([...existingLabels2, ...labels]));
          if (merged2.length !== existingLabels2.length) {
            updatePayload2.labels = merged2;
          }
        } else if (fetchErr2) {
          console.error('[TRIGGER:Contact] Error fetching existing labels (path2):', fetchErr2.message);
          updatePayload2.labels = labels;
        }
      }

      const { data: updateData, error: updateError } = await supabase
        .from('contacts')
        .update(updatePayload2)
        .eq('phone_number', phoneNumber)
        .eq('owner_id', user_id)
        .select();
      
      if (updateError) {
        console.error('[TRIGGER:Contact] DB update error for existing contact:', updateError);
        throw updateError;
      }
      
      return { success: true, isNew: false, contact: updateData };
    }
  } catch (err) {
    console.error('[TRIGGER:Contact] Error:', err.message);
    throw err;
  }
}

export default {
  execute
}; 