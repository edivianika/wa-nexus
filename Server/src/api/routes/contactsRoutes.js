import express from 'express';
const router = express.Router();
import * as contactsController from '../controllers/contactsController.js';
import leadScoreService from '../services/leadScoreService.js';
import { loggerUtils as logger } from '../../utils/logger.js';
import { supabase } from '../../utils/supabaseClient.js';

// Endpoint hapus kontak dari Redis
router.post('/delete', contactsController.deleteContact);

// Endpoint untuk update lead score
router.put('/api/contacts/:id/lead-score', async (req, res) => {
  try {
    const { id } = req.params;
    const { score } = req.body;
    const userId = req.headers['x-user-id'];
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID tidak ditemukan' });
    }
    
    if (score === undefined) {
      return res.status(400).json({ success: false, message: 'Score harus disertakan' });
    }
    
    const newScore = await leadScoreService.updateScoreManually(id, userId, score);
    res.json({ success: true, score: newScore });
  } catch (error) {
    logger.error('Error updating lead score', { error: error.message, contactId: req.params.id });
    res.status(500).json({ success: false, message: 'Gagal memperbarui lead score', error: error.message });
  }
});

// Endpoint untuk mendapatkan kategori lead score
router.get('/api/contacts/:id/lead-score-category', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID tidak ditemukan' });
    }
    
    // Ambil lead score dari database
    const { data, error } = await supabase
      .from('contacts')
      .select('lead_score')
      .eq('id', id)
      .eq('owner_id', userId)
      .single();
      
    if (error) {
      throw error;
    }
    
    if (!data) {
      return res.status(404).json({ success: false, message: 'Kontak tidak ditemukan' });
    }
    
    const score = data.lead_score || 0;
    const category = leadScoreService.getScoreCategory(score);
    
    res.json({ success: true, score, category });
  } catch (error) {
    logger.error('Error getting lead score category', { error: error.message, contactId: req.params.id });
    res.status(500).json({ success: false, message: 'Gagal mendapatkan kategori lead score', error: error.message });
  }
});

export default router; 