/**
 * Asset API Routes
 * 
 * Endpoint untuk mengelola asset media
 */

import express from 'express';
const router = express.Router();
import multer from 'multer';
import assetService from '../../services/assetService.js';
import { authenticateUser } from '../../middleware/auth.js';

// Middleware untuk ekstrak user dari token
router.use(authenticateUser);

// Konfigurasi multer untuk handle file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

// Route untuk upload asset
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { assetType, customFilename, description, tags } = req.body;
    const userId = req.user.id;
    
    // Prepare metadata
    const metadata = {
      description: description || '',
      tags: tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [],
      extraData: {}
    };
    
    // Upload to Supabase and create record
    const asset = await assetService.uploadAsset(
      req.file.buffer,
      customFilename || req.file.originalname,
      req.file.mimetype,
      userId,
      metadata
    );
    
    res.json({ success: true, asset });
  } catch (error) {
    console.error('Asset upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route untuk get asset list
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, search, tags, limit, offset, sort } = req.query;
    
    // Parse tags if present
    let parsedTags = tags;
    if (tags && typeof tags === 'string') {
      try {
        parsedTags = tags.split(',');
      } catch (e) {
        parsedTags = [];
      }
    }
    
    const filters = {
      type,
      search,
      tags: parsedTags,
      limit: limit ? parseInt(limit) : 20,
      offset: offset ? parseInt(offset) : 0,
      sort: sort || 'created_at:desc'
    };
    
    const result = await assetService.findAssets(userId, filters);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Get assets error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route untuk get asset detail
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const asset = await assetService.getAssetById(id, userId);
    res.json({ success: true, asset });
  } catch (error) {
    console.error('Get asset detail error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route untuk delete asset
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    await assetService.deleteAsset(id, userId);
    res.json({ success: true, message: 'Asset deleted successfully' });
  } catch (error) {
    console.error('Delete asset error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route untuk update metadata
router.put('/:id/metadata', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { tags, ...extraData } = req.body;
    
    const metadata = {
      tags: tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [],
      extraData
    };
    
    const asset = await assetService.updateAssetMetadata(id, userId, metadata);
    res.json({ success: true, asset });
  } catch (error) {
    console.error('Update metadata error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route untuk get asset usage
router.get('/:id/usage', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const asset = await assetService.getAssetById(id, userId);
    res.json({ success: true, usage: asset.usage });
  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route untuk get asset statistics
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const stats = await assetService.getAssetStatistics(userId);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route untuk record asset usage
router.post('/:id/usage', async (req, res) => {
  try {
    const { id } = req.params;
    const { entityType, entityId } = req.body;
    
    if (!entityType || !entityId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Entity type and entity ID are required' 
      });
    }
    
    const usage = await assetService.recordAssetUsage(id, entityType, entityId);
    res.json({ success: true, usage });
  } catch (error) {
    console.error('Record usage error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route untuk batch operations
router.post('/batch', async (req, res) => {
  try {
    const { operation, assetIds } = req.body;
    const userId = req.user.id;
    
    if (!operation || !assetIds || !Array.isArray(assetIds)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Operation and asset IDs array are required' 
      });
    }
    
    const results = {
      success: true,
      processed: 0,
      failed: 0,
      errors: []
    };
    
    if (operation === 'delete') {
      // Batch delete assets
      for (const assetId of assetIds) {
        try {
          await assetService.deleteAsset(assetId, userId);
          results.processed++;
        } catch (error) {
          results.failed++;
          results.errors.push({ assetId, error: error.message });
        }
      }
    } else {
      return res.status(400).json({ 
        success: false, 
        error: `Unsupported batch operation: ${operation}` 
      });
    }
    
    res.json(results);
  } catch (error) {
    console.error('Batch operation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router; 