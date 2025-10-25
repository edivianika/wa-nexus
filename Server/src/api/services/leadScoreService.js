import { supabase } from '../../utils/supabaseClient.js';
import { loggerUtils } from '../../utils/logger.js';

class LeadScoreService {
  // Update lead score saat pesan dibaca
  async updateScoreOnMessageRead(contactId, ownerId) {
    try {
      // Ambil skor saat ini
      const { data: contact, error } = await supabase
        .from('contacts')
        .select('lead_score')
        .eq('id', contactId)
        .eq('owner_id', ownerId)
        .single();
      
      if (error) throw error;
      
      // Tambahkan 10 poin, maksimal 100
      const newScore = Math.min(100, (contact.lead_score || 0) + 10);
      
      // Update skor
      await supabase
        .from('contacts')
        .update({ lead_score: newScore })
        .eq('id', contactId)
        .eq('owner_id', ownerId);
        
      return newScore;
    } catch (error) {
      loggerUtils.error('Error updating lead score on message read', { error: error.message, contactId });
      throw error;
    }
  }
  
  // Update lead score saat kontak membalas
  async updateScoreOnReply(contactId, ownerId) {
    try {
      // Ambil skor saat ini
      const { data: contact, error } = await supabase
        .from('contacts')
        .select('lead_score')
        .eq('id', contactId)
        .eq('owner_id', ownerId)
        .single();
      
      if (error) throw error;
      
      // Tambahkan 15 poin, maksimal 100
      const newScore = Math.min(100, (contact.lead_score || 0) + 15);
      
      // Update skor
      await supabase
        .from('contacts')
        .update({ lead_score: newScore })
        .eq('id', contactId)
        .eq('owner_id', ownerId);
        
      return newScore;
    } catch (error) {
      loggerUtils.error('Error updating lead score on reply', { error: error.message, contactId });
      throw error;
    }
  }
  
  // Jadwalkan penurunan skor untuk kontak yang tidak aktif
  async decreaseInactiveScores() {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      // Ambil kontak yang tidak aktif selama 7 hari
      const { data: inactiveContacts, error } = await supabase
        .from('contacts')
        .select('id, owner_id, lead_score')
        .lt('last_activity', sevenDaysAgo.toISOString())
        .gt('lead_score', 0);
      
      if (error) throw error;
      
      // Update skor untuk setiap kontak
      for (const contact of inactiveContacts) {
        const newScore = Math.max(0, contact.lead_score - 5);
        await supabase
          .from('contacts')
          .update({ lead_score: newScore })
          .eq('id', contact.id)
          .eq('owner_id', contact.owner_id);
      }
      
      return inactiveContacts.length;
    } catch (error) {
      loggerUtils.error('Error decreasing inactive lead scores', { error: error.message });
      throw error;
    }
  }
  
  // Update lead score manual
  async updateScoreManually(contactId, ownerId, score) {
    try {
      // Pastikan skor dalam rentang valid
      const validScore = Math.max(0, Math.min(100, parseInt(score)));
      
      // Update skor
      const { data, error } = await supabase
        .from('contacts')
        .update({ lead_score: validScore })
        .eq('id', contactId)
        .eq('owner_id', ownerId)
        .select('lead_score');
        
      if (error) throw error;
      
      return validScore;
    } catch (error) {
      loggerUtils.error('Error manually updating lead score', { error: error.message, contactId });
      throw error;
    }
  }

  // Get lead score category
  getScoreCategory(score) {
    if (score >= 71) return 'hot';
    if (score >= 31) return 'warm';
    return 'cold';
  }
}

export default new LeadScoreService(); 