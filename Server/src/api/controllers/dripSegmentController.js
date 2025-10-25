import * as dripSegmentService from '../services/dripSegmentService.js';
import { loggerUtils as logger } from '../../utils/logger.js';

export const handleGetAllSegments = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User ID is required' });
    }
    const segments = await dripSegmentService.getAllSegments(userId);
    res.json({ success: true, segments });
  } catch (error) {
    logger.error('Controller error getting all drip segments:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get segments' });
  }
};

export const handleCreateSegment = async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User ID is required' });
    }
    if (!name) {
      return res.status(400).json({ success: false, error: 'Segment name is required' });
    }
    const segmentData = { name, description, owner_id: userId };
    const newSegment = await dripSegmentService.createSegment(segmentData);
    res.status(201).json({ success: true, segment: newSegment });
  } catch (error) {
    logger.error('Controller error creating drip segment:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create segment' });
  }
};

export const handleGetSegmentById = async (req, res) => {
  try {
    const { segmentId } = req.params;
    const segment = await dripSegmentService.getSegmentById(segmentId);
    if (!segment) {
      return res.status(404).json({ success: false, error: 'Segment not found' });
    }
    res.json({ success: true, segment });
  } catch (error) {
    logger.error(`Controller error getting drip segment ${req.params.segmentId}:`, error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get segment details' });
  }
};

export const handleUpdateSegment = async (req, res) => {
  try {
    const { segmentId } = req.params;
    const { name, description } = req.body;

    // Validasi dasar
    if (!name && description === undefined) {
      return res.status(400).json({ success: false, error: 'Name or description must be provided for update.'});
    }

    const updatedSegment = await dripSegmentService.updateSegment(segmentId, { name, description });
    if (!updatedSegment) { // Jika service mengembalikan null karena tidak ditemukan
        return res.status(404).json({ success: false, error: 'Segment not found for update.' });
    }
    res.json({ success: true, segment: updatedSegment });
  } catch (error) {
    logger.error(`Controller error updating drip segment ${req.params.segmentId}:`, error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update segment' });
  }
};

export const handleDeleteSegment = async (req, res) => {
  try {
    const { segmentId } = req.params;
    const deletedSegment = await dripSegmentService.deleteSegment(segmentId);
    if (!deletedSegment) { // Jika service mengembalikan null karena tidak ditemukan
        return res.status(404).json({ success: false, error: 'Segment not found for deletion.' });
    }
    res.json({ success: true, message: 'Segment deleted successfully', segment: deletedSegment });
  } catch (error) {
    logger.error(`Controller error deleting drip segment ${req.params.segmentId}:`, error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete segment' });
  }
};

// --- Contact Management Controllers ---

export const handleGetContactsInSegment = async (req, res) => {
  try {
    const { segmentId } = req.params;
    const contacts = await dripSegmentService.getContactsInSegment(segmentId);
    res.json({ success: true, contacts });
  } catch (error) {
    logger.error(`Controller error getting contacts for segment ${req.params.segmentId}:`, error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get contacts' });
  }
};

export const handleAddContactToSegment = async (req, res) => {
  try {
    const { segmentId } = req.params;
    const { contact_number, contact_name } = req.body;

    // Pastikan segment ada dulu (opsional)
    const segmentExists = await dripSegmentService.getSegmentById(segmentId);
    if (!segmentExists) {
        return res.status(404).json({ success: false, error: 'Segment not found' });
    }

    if (!contact_number) {
      return res.status(400).json({ success: false, error: 'Contact number is required' });
    }
    const newContactLink = await dripSegmentService.addContactToSegment(segmentId, { contact_number, contact_name });
    res.status(201).json({ success: true, contact_link: newContactLink });
  } catch (error) {
    logger.error(`Controller error adding contact to segment ${req.params.segmentId}:`, error);
    if (error.message.includes('sudah ada di segmen ini')) {
        return res.status(409).json({ success: false, error: error.message }); // 409 Conflict
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to add contact to segment' });
  }
};

export const handleRemoveContactFromSegment = async (req, res) => {
  try {
    // Perhatikan: Frontend mengirim ID dari tabel drip_segment_contacts, bukan ID kontak itu sendiri
    const { segmentContactId } = req.params; 
    const removedContactLink = await dripSegmentService.removeContactFromSegment(segmentContactId);
    if (!removedContactLink) {
        return res.status(404).json({ success: false, error: 'Contact link in segment not found for deletion.' });
    }
    res.json({ success: true, message: 'Contact removed from segment successfully', contact_link: removedContactLink });
  } catch (error) {
    logger.error(`Controller error removing contact (link id ${req.params.segmentContactId}) from segment:`, error);
    res.status(500).json({ success: false, error: error.message || 'Failed to remove contact from segment' });
  }
}; 