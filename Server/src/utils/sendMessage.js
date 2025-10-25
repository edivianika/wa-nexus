import { createClient } from '@supabase/supabase-js';
import { sendDirectMessage } from './directMessageSender.js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Kirim pesan WhatsApp ke contact_id tertentu dengan device tertentu
 * @param {number} contactId
 * @param {string} message
 * @param {string} connectionId
 */
async function sendMessageToContact(contactId, message, connectionId) {
  // Cari nomor telepon dari contact
  const { data: contact, error } = await supabase
    .from('contacts')
    .select('phone_number')
    .eq('id', contactId)
    .single();
  if (error || !contact) throw new Error('Contact not found');
  if (!connectionId) throw new Error('Missing connection_id');

  // Kirim pesan
  return sendDirectMessage({
    connectionId,
    to: contact.phone_number,
    type: 'text',
    message
  });
}

export { sendMessageToContact }; 