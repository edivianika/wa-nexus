/**
 * Routes untuk mengelola billing dan subscription
 */

import express from 'express';
const router = express.Router();
import billingService from '../services/billingService.js';
import { loggerUtils as logger } from '../../utils/logger.js';
import { supabase, supabaseAdmin } from '../../utils/supabaseClient.js';

// Middleware untuk ekstrak user ID
const extractUserId = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'User ID tidak ditemukan di header x-user-id'
        });
    }
    req.user = { id: userId };
    next();
};

// Middleware untuk verifikasi admin
const verifyAdmin = async (req, res, next) => {
    const userId = req.user.id; 

    try {
        const { data, error } = await supabaseAdmin.rpc('check_admin_status', {
            user_id: userId
        });

        if (error || !data) {
            return res.status(403).json({ message: 'Forbidden: Admins only' });
        }

        next();
    } catch (error) {
        console.error('Error checking admin status:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// Protect all routes with user ID extraction
router.use(extractUserId);

/**
 * @route GET /api/billing/plans
 * @desc Mendapatkan semua paket yang aktif
 * @access Public
 */
router.get('/plans', async (req, res) => {
    try {
        const plans = await billingService.getAllPlans();
        res.json({
            success: true,
            data: plans
        });
    } catch (error) {
        logger.error('Error getting plans', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

/**
 * @route GET /api/billing/subscription
 * @desc Mendapatkan subscription aktif untuk user
 * @access Private
 */
router.get('/subscription', async (req, res) => {
    try {
        const userId = req.user.id;
        const subscription = await billingService.getActiveSubscription(userId);
        
        if (!subscription) {
            return res.json({
                success: true,
                data: null,
                message: 'Tidak ada subscription aktif'
            });
        }
        
        res.json({
            success: true,
            data: subscription
        });
    } catch (error) {
        logger.error(`Error getting active subscription for user: ${req.user.id}`, { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

/**
 * @route GET /api/billing/credit
 * @desc Mendapatkan saldo kredit user
 * @access Private
 */
router.get('/credit', async (req, res) => {
    try {
        const userId = req.user.id;
        const balance = await billingService.getUserCredit(userId);
        
        res.json({
            success: true,
            data: {
                balance
            }
        });
    } catch (error) {
        logger.error(`Error getting credit balance for user: ${req.user.id}`, { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

/**
 * @route GET /api/billing/credit/transactions
 * @desc Mendapatkan riwayat transaksi kredit user
 * @access Private
 */
router.get('/credit/transactions', async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;
        
        const result = await billingService.getCreditTransactions(userId, limit, offset);
        
        res.json({
            success: true,
            data: result.transactions,
            total: result.total
        });
    } catch (error) {
        logger.error(`Error getting credit transactions for user: ${req.user.id}`, { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

/**
 * @route POST /api/billing/credit/add
 * @desc Menambahkan kredit user (hanya untuk admin)
 * @access Admin
 */
router.post('/credit/add', verifyAdmin, async (req, res) => {
    try {
        const { userId, amount, description } = req.body;
        const adminId = req.user.id;
        
        if (!userId || !amount || !description) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'userId, amount, dan description diperlukan'
            });
        }
        
        if (amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Amount harus lebih dari 0'
            });
        }
        
        const transactionId = await billingService.addCredit(userId, amount, description, adminId);
        
        res.json({
            success: true,
            message: `Berhasil menambahkan ${amount} kredit ke user ${userId}`,
            data: {
                transactionId
            }
        });
    } catch (error) {
        logger.error(`Error adding credit`, { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

/**
 * @route POST /api/billing/subscribe
 * @desc Berlangganan paket dengan kredit
 * @access Private
 */
router.post('/subscribe', async (req, res) => {
    try {
        const { planCode } = req.body;
        const userId = req.user.id;
        
        if (!planCode) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'planCode diperlukan'
            });
        }
        
        // Dapatkan plan
        const plan = await billingService.getPlanByCode(planCode);
        if (!plan) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: `Plan dengan kode ${planCode} tidak ditemukan`
            });
        }
        
        // Dapatkan saldo kredit user
        const balance = await billingService.getUserCredit(userId);
        
        // Cek apakah saldo cukup
        if (balance < plan.price) {
            return res.status(402).json({
                success: false,
                error: 'Payment Required',
                message: `Saldo kredit tidak cukup. Dibutuhkan ${plan.price}, saldo Anda ${balance}`,
                data: {
                    required: plan.price,
                    balance: balance,
                    shortfall: plan.price - balance
                }
            });
        }
        
        // Berlangganan dengan kredit
        const subscription = await billingService.subscribeWithCredit(userId, planCode);
        
        res.json({
            success: true,
            message: `Berhasil berlangganan paket ${plan.name}`,
            data: {
                subscription,
                remainingBalance: balance - plan.price
            }
        });
    } catch (error) {
        logger.error(`Error subscribing with credit for user: ${req.user.id}`, { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

/**
 * @route GET /api/billing/usage/:featureKey
 * @desc Mendapatkan penggunaan fitur
 * @access Private
 */
router.get('/usage/:featureKey', async (req, res) => {
    try {
        const { featureKey } = req.params;
        const userId = req.user.id;
        
        // Dapatkan subscription untuk mendapatkan limit
        const subscription = await billingService.getActiveSubscription(userId);
        if (!subscription) {
            return res.json({
                success: true,
                data: {
                    usage: 0,
                    limit: 0,
                    percentage: 0
                }
            });
        }
        
        // Dapatkan limit dari plan
        const limit = subscription.plans.limits?.[featureKey] || 0;
        
        // Dapatkan penggunaan saat ini
        const usage = await billingService.getUsage(userId, featureKey);
        
        // Hitung persentase penggunaan
        const percentage = limit > 0 ? Math.min(100, Math.round((usage / limit) * 100)) : 0;
        
        res.json({
            success: true,
            data: {
                usage,
                limit,
                percentage,
                unlimited: limit === -1
            }
        });
    } catch (error) {
        logger.error(`Error getting usage for user: ${req.user.id}, feature: ${req.params.featureKey}`, { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

/**
 * @route POST /api/billing/cancel
 * @desc Batalkan subscription
 * @access Private
 */
router.post('/cancel', async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Dapatkan subscription aktif
        const subscription = await billingService.getActiveSubscription(userId);
        if (!subscription) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Tidak ada subscription aktif untuk dibatalkan'
            });
        }
        
        // Batalkan subscription
        await billingService.cancelSubscription(subscription.id);
        
        res.json({
            success: true,
            message: 'Subscription berhasil dibatalkan'
        });
    } catch (error) {
        logger.error(`Error canceling subscription for user: ${req.user.id}`, { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

export default router; 