import express from 'express';
const router = express.Router();
import * as scheduledMessageService from '../services/scheduledMessageService.js';
import { authenticateApiKey } from '../../utils/middleware.js';

/**
 * @swagger
 * /api/scheduled-messages:
 *   post:
 *     summary: Create a new scheduled message
 *     description: Schedule a message to be sent at a specific time
 *     tags: [Scheduled Messages]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - connection_id
 *               - contact_id
 *               - message
 *               - scheduled_at
 *             properties:
 *               connection_id:
 *                 type: string
 *                 description: ID of the connection to use
 *               contact_id:
 *                 type: string
 *                 description: ID of the contact to send the message to
 *               message:
 *                 type: string
 *                 description: Message content
 *               scheduled_at:
 *                 type: string
 *                 format: date-time
 *                 description: When to send the message (ISO format)
 *               type:
 *                 type: string
 *                 enum: [text, image, video, document, audio]
 *                 default: text
 *                 description: Message type
 *               media_url:
 *                 type: string
 *                 description: URL to media (for non-text messages)
 *               caption:
 *                 type: string
 *                 description: Caption for media messages
 *               asset_id:
 *                 type: string
 *                 description: ID of the asset to use for the media
 *               is_recurring:
 *                 type: boolean
 *                 default: false
 *                 description: Whether this is a recurring message
 *               recurrence_pattern:
 *                 type: string
 *                 enum: [daily, weekly, monthly]
 *                 description: Pattern for recurring messages
 *     responses:
 *       201:
 *         description: Message scheduled successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized - invalid API key
 *       404:
 *         description: Connection or contact not found
 *       500:
 *         description: Server error
 */
router.post('/api/scheduled-messages', authenticateApiKey, scheduledMessageService.createScheduledMessage);

/**
 * @swagger
 * /api/scheduled-messages:
 *   get:
 *     summary: Get scheduled messages
 *     description: Get all scheduled messages with optional filtering
 *     tags: [Scheduled Messages]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: connection_id
 *         schema:
 *           type: string
 *         description: Filter by connection ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in_queue, sent, failed]
 *         description: Filter by status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of records to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of records to skip
 *     responses:
 *       200:
 *         description: List of scheduled messages
 *       401:
 *         description: Unauthorized - invalid API key
 *       500:
 *         description: Server error
 */
router.get('/api/scheduled-messages', authenticateApiKey, scheduledMessageService.getScheduledMessages);

/**
 * @swagger
 * /api/scheduled-messages/{id}:
 *   delete:
 *     summary: Delete a scheduled message
 *     description: Delete a scheduled message by ID
 *     tags: [Scheduled Messages]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Message ID to delete
 *     responses:
 *       200:
 *         description: Message deleted successfully
 *       401:
 *         description: Unauthorized - invalid API key
 *       404:
 *         description: Message not found
 *       500:
 *         description: Server error
 */
router.delete('/api/scheduled-messages/:id', authenticateApiKey, scheduledMessageService.deleteScheduledMessage);

export default router; 