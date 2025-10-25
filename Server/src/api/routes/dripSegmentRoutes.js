import express from 'express';
const router = express.Router();
import * as dripSegmentController from '../controllers/dripSegmentController.js';

// Middleware to extract user_id from a custom header
const extractUserId = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized', 
      message: "User identification is missing." 
    });
  }
  req.user = { id: userId }; // Attach user object to the request
  next();
};

// Apply middleware to all routes
router.use(extractUserId);

// Routes for Drip Contact Segments
router.get('/', dripSegmentController.handleGetAllSegments);
router.post('/', dripSegmentController.handleCreateSegment);
router.get('/:segmentId', dripSegmentController.handleGetSegmentById);
router.put('/:segmentId', dripSegmentController.handleUpdateSegment);
router.delete('/:segmentId', dripSegmentController.handleDeleteSegment);

// Routes for Contacts within a Segment
router.get('/:segmentId/contacts', dripSegmentController.handleGetContactsInSegment);
router.post('/:segmentId/contacts', dripSegmentController.handleAddContactToSegment);

// Untuk menghapus kontak dari segmen, kita menggunakan ID dari tabel drip_segment_contacts
// Jadi route-nya mungkin lebih baik di level root atau sub-resource tersendiri jika mengikuti RESTful yang ketat.
// Namun, untuk kemudahan, bisa juga seperti ini, atau /contacts/:segmentContactId
router.delete('/contacts/:segmentContactId', dripSegmentController.handleRemoveContactFromSegment);
// Alternatif route untuk delete kontak:
// router.delete('/:segmentId/contacts/:contactId', dripSegmentController.handleRemoveContactFromSegmentByContactId); 
// Ini memerlukan fungsi controller dan service yang berbeda jika menggunakan ID kontak, bukan ID link.

export default router; 