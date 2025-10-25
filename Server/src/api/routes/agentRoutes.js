import express from 'express';
import * as agentController from '../controllers/agentController.js';

const router = express.Router();

// Update agent pada koneksi
router.post('/api/connections/:connectionId/agent', agentController.updateAgent);

export default router; 