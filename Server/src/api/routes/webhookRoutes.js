/**
 * Routes untuk webhook dari layanan eksternal
 */

import express from 'express';
const router = express.Router();
import billingService from '../services/billingService.js';
import { loggerUtils as logger } from '../../utils/logger.js';

/**
 * Middleware untuk verifikasi callback token Xendit
 */
const verifyXenditSignature = (req, res, next) => {
    const callbackToken = req.headers['x-callback-token'];
    const expectedToken = process.env.XENDIT_CALLBACK_TOKEN;

    if (!expectedToken) {
        logger.error('XENDIT_CALLBACK_TOKEN not set in environment variables');
        return res.status(500).json({ error: 'Server misconfiguration' });
    }

    if (callbackToken !== expectedToken) {
        logger.warn('Invalid Xendit callback token', { 
            received: callbackToken ? callbackToken.substring(0, 4) + '...' : 'none'
        });
        return res.status(401).json({ error: 'Invalid callback token' });
    }

    next();
};

/**
 * @route POST /api/webhooks/xendit
 * @desc Webhook untuk menerima notifikasi dari Xendit
 * @access Private (protected by callback token)
 */
router.post('/xendit', verifyXenditSignature, async (req, res) => {
    try {
        const payload = req.body;
        logger.info('Received webhook from Xendit', { 
            external_id: payload.external_id,
            status: payload.status
        });

        // Pastikan webhook memiliki data yang diperlukan
        if (!payload.external_id || !payload.status) {
            logger.error('Invalid webhook payload from Xendit', { payload });
            return res.status(400).json({ error: 'Invalid payload' });
        }

        // Format external_id: sub-{subscription_id}
        if (!payload.external_id.startsWith('sub-')) {
            logger.warn('Unknown external_id format', { external_id: payload.external_id });
            return res.status(200).json({ message: 'Ignored' }); // Tetap return 200 untuk webhook lain
        }

        const subscriptionId = payload.external_id.replace('sub-', '');

        // Proses berdasarkan status
        switch (payload.status) {
            case 'PAID':
                // Aktivasi subscription
                await billingService.activateSubscription(subscriptionId);
                logger.info(`Subscription ${subscriptionId} activated`);
                break;
            
            case 'EXPIRED':
                // Jika invoice expired, batalkan subscription
                await billingService.updateSubscription(subscriptionId, { 
                    status: 'canceled',
                    canceled_at: new Date()
                });
                logger.info(`Subscription ${subscriptionId} canceled due to expired invoice`);
                break;
            
            default:
                logger.info(`Received webhook with status ${payload.status}, no action needed`);
        }

        // Selalu kembalikan 200 untuk webhook
        res.status(200).json({ message: 'Webhook processed successfully' });
    } catch (error) {
        logger.error('Error processing Xendit webhook', { error: error.message });
        // Tetap kembalikan 200 agar Xendit tidak mencoba lagi
        res.status(200).json({ message: 'Error processed', error: error.message });
    }
});

export default router; 