/**
 * Middleware untuk memeriksa kuota dan batasan plan
 */

import billingService from '../api/services/billingService.js';
import { loggerUtils } from '../utils/logger.js';

/**
 * Middleware untuk memeriksa kuota dan batasan plan
 * @param {string} featureKey - Kunci fitur (messages_per_period, active_devices, dll)
 * @param {number} increment - Jumlah increment yang akan dilakukan
 */
const quotaGuard = (featureKey, increment = 1) => {
    return async (req, res, next) => {
        try {
            // Pastikan user ID tersedia
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Unauthorized',
                    message: 'User ID tidak ditemukan'
                });
            }

            // Cek apakah user memiliki subscription aktif
            const subscription = await billingService.getActiveSubscription(userId);
            if (!subscription) {
                return res.status(402).json({
                    success: false,
                    error: 'Payment Required',
                    message: 'Anda tidak memiliki paket aktif. Silakan berlangganan terlebih dahulu.'
                });
            }

            // Cek apakah masih dalam batas kuota
            const isWithinLimit = await billingService.checkUsageLimit(userId, featureKey, increment);
            if (!isWithinLimit) {
                return res.status(429).json({
                    success: false,
                    error: 'Quota Exceeded',
                    message: `Anda telah mencapai batas kuota untuk ${featureKey}. Silakan upgrade paket Anda.`,
                    feature: featureKey
                });
            }

            // Simpan informasi untuk increment usage setelah request berhasil
            req.usageToIncrement = {
                userId,
                featureKey,
                increment
            };

            // Lanjutkan ke handler berikutnya
            next();
        } catch (error) {
            loggerUtils.error(`Error in quotaGuard middleware: ${error.message}`, { error, featureKey, increment });
            return res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: 'Terjadi kesalahan saat memeriksa kuota'
            });
        }
    };
};

/**
 * Middleware untuk increment usage setelah request berhasil
 */
const incrementUsageAfterRequest = async (req, res, next) => {
    // Simpan referensi ke method asli end()
    const originalEnd = res.end;

    // Override method end()
    res.end = async function(...args) {
        // Jika request berhasil dan ada usage yang perlu diincrement
        if (res.statusCode >= 200 && res.statusCode < 300 && req.usageToIncrement) {
            const { userId, featureKey, increment } = req.usageToIncrement;
            try {
                await billingService.incrementUsage(userId, featureKey, increment);
                loggerUtils.debug(`Incremented usage for user ${userId}, feature ${featureKey} by ${increment}`);
            } catch (error) {
                loggerUtils.error(`Failed to increment usage: ${error.message}`, { error, userId, featureKey, increment });
            }
        }

        // Panggil method asli end()
        originalEnd.apply(this, args);
    };

    next();
};

/**
 * Middleware untuk memeriksa fitur premium
 * @param {string} featureKey - Kunci fitur (has_webhook, has_api_access, dll)
 */
const featureGuard = (featureKey) => {
    return async (req, res, next) => {
        try {
            // Pastikan user ID tersedia
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Unauthorized',
                    message: 'User ID tidak ditemukan'
                });
            }
            
            // Bypass feature check and always allow access
            return next();

        } catch (error) {
            loggerUtils.error(`Error in featureGuard middleware: ${error.message}`, { error, featureKey });
            return res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: 'Terjadi kesalahan saat memeriksa fitur'
            });
        }
    };
};

/**
 * Middleware untuk menambahkan watermark ke pesan jika diperlukan
 */
const addWatermarkIfNeeded = async (req, res, next) => {
    // This middleware is effectively disabled by removing it from routes.
    // The code is left here in case it needs to be re-enabled in the future.
    try {
        // Pastikan user ID tersedia
        const userId = req.user?.id;
        if (!userId) {
            return next(); // Skip jika tidak ada user ID
        }

        // Cek apakah user memiliki subscription aktif
        const subscription = await billingService.getActiveSubscription(userId);
        if (!subscription) {
            return next(); // Skip jika tidak ada subscription
        }

        // Cek apakah paket memerlukan watermark
        const needsWatermark = subscription.plans_new.features?.has_watermark === true;
        if (needsWatermark && req.body.message) {
            // Tambahkan watermark ke pesan
            req.body.message = `${req.body.message}\n\n---\nSent via WhatsApp Automation Suite`;
        }

        next();
    } catch (error) {
        loggerUtils.error(`Error in addWatermarkIfNeeded middleware: ${error.message}`, { error });
        next(); // Lanjutkan meskipun ada error
    }
};

export {
  quotaGuard,
  incrementUsageAfterRequest,
  featureGuard,
  addWatermarkIfNeeded
};