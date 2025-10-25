/**
 * Service untuk mengelola billing dan subscription
 */

import { supabase, supabaseAdmin } from '../../utils/supabaseClient.js';
import { loggerUtils } from '../../utils/logger.js';

// Hapus inisialisasi Xendit karena kita menggunakan sistem kredit internal
// let xenditClient = null;
// if (process.env.XENDIT_SECRET_KEY) {
//     xenditClient = new Xendit({
//         secretKey: process.env.XENDIT_SECRET_KEY
//     });
// }

class BillingService {
    /**
     * Mendapatkan semua paket yang aktif
     */
    async getAllPlans() {
        try {
            const { data, error } = await supabase
                .from('plans')
                .select('*')
                .eq('is_active', true)
                .order('price', { ascending: true });

            if (error) throw new Error(error.message);
            return data;
        } catch (error) {
            loggerUtils.error('Error getting plans', { error: error.message });
            throw error;
        }
    }

    /**
     * Mendapatkan paket berdasarkan kode
     * @param {string} code - Kode paket (micro, lite, starter, growth)
     */
    async getPlanByCode(code) {
        try {
            const { data, error } = await supabase
                .from('plans')
                .select('*')
                .eq('code', code)
                .eq('is_active', true)
                .single();

            if (error) throw new Error(error.message);
            return data;
        } catch (error) {
            loggerUtils.error(`Error getting plan by code: ${code}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Mendapatkan paket berdasarkan ID
     * @param {string} id - ID paket
     */
    async getPlanById(id) {
        try {
            const { data, error } = await supabase
                .from('plans')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw new Error(error.message);
            return data;
        } catch (error) {
            loggerUtils.error(`Error getting plan by id: ${id}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Mendapatkan subscription aktif untuk user
     * @param {string} userId - ID user
     */
    async getActiveSubscription(userId) {
        try {
            const { data, error } = await supabaseAdmin
                .from('subscriptions')
                .select('*, plans(*)')
                .eq('user_id', userId)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                throw new Error(error.message);
            }
            
            return data;
        } catch (error) {
            loggerUtils.error(`Error getting active subscription for user: ${userId}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Membuat subscription baru
     * @param {string} userId - ID user
     * @param {string} planId - ID paket
     * @param {string} status - Status subscription (trialing, active, past_due, canceled)
     * @param {string} paymentMethod - Metode pembayaran (credit, manual)
     */
    async createSubscription(userId, planId, status = 'pending', paymentMethod = 'credit') {
        try {
            const { data, error } = await supabaseAdmin
                .from('subscriptions')
                .insert([{
                    user_id: userId,
                    plan_id: planId,
                    status: status,
                    payment_method: paymentMethod,
                    current_period_starts_at: status === 'active' ? new Date() : null,
                    current_period_ends_at: status === 'active' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null // 30 hari
                }])
                .select()
                .single();

            if (error) throw new Error(error.message);
            return data;
        } catch (error) {
            loggerUtils.error(`Error creating subscription for user: ${userId}, plan: ${planId}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Update subscription
     * @param {string} id - ID subscription
     * @param {object} updates - Field yang akan diupdate
     */
    async updateSubscription(id, updates) {
        try {
            const { data, error } = await supabaseAdmin
                .from('subscriptions')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw new Error(error.message);
            return data;
        } catch (error) {
            loggerUtils.error(`Error updating subscription: ${id}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Aktivasi subscription
     * @param {string} id - ID subscription
     */
    async activateSubscription(id) {
        try {
            const now = new Date();
            const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 hari

            const { data, error } = await supabase
                .from('subscriptions')
                .update({
                    status: 'active',
                    current_period_starts_at: now,
                    current_period_ends_at: periodEnd
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw new Error(error.message);
            return data;
        } catch (error) {
            loggerUtils.error(`Error activating subscription: ${id}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Batalkan subscription
     * @param {string} id - ID subscription
     */
    async cancelSubscription(id) {
        try {
            const { data, error } = await supabase
                .from('subscriptions')
                .update({
                    status: 'canceled',
                    canceled_at: new Date()
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw new Error(error.message);
            return data;
        } catch (error) {
            loggerUtils.error(`Error canceling subscription: ${id}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Mendapatkan penggunaan fitur
     * @param {string} userId - ID user
     * @param {string} featureKey - Kunci fitur (messages_sent, contacts_imported, dll)
     */
    async getUsage(userId, featureKey) {
        try {
            // Dapatkan periode saat ini (bulan)
            const currentPeriod = new Date();
            currentPeriod.setDate(1); // Set ke awal bulan
            currentPeriod.setHours(0, 0, 0, 0);

            const { data, error } = await supabase
                .from('usage_counters')
                .select('usage_count')
                .eq('user_id', userId)
                .eq('feature_key', featureKey)
                .eq('period_starts_at', currentPeriod.toISOString())
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                throw new Error(error.message);
            }
            
            return data ? data.usage_count : 0;
        } catch (error) {
            loggerUtils.error(`Error getting usage for user: ${userId}, feature: ${featureKey}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Increment penggunaan fitur
     * @param {string} userId - ID user
     * @param {string} featureKey - Kunci fitur (messages_sent, contacts_imported, dll)
     * @param {number} increment - Jumlah increment
     */
    async incrementUsage(userId, featureKey, increment = 1) {
        try {
            // Gunakan RPC function dari Supabase
            const { error } = await supabase.rpc('increment_usage_counter', {
                p_user_id: userId,
                p_feature_key: featureKey,
                p_increment: increment
            });

            if (error) throw new Error(error.message);
            return true;
        } catch (error) {
            loggerUtils.error(`Error incrementing usage for user: ${userId}, feature: ${featureKey}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Cek apakah user masih dalam batas kuota
     * @param {string} userId - ID user
     * @param {string} featureKey - Kunci fitur (messages_sent, contacts_imported, dll)
     * @param {number} increment - Jumlah increment yang akan dilakukan
     */
    async checkUsageLimit(userId, featureKey, increment = 1) {
        try {
            // Gunakan RPC function dari Supabase
            const { data, error } = await supabase.rpc('check_usage_limit', {
                p_user_id: userId,
                p_feature_key: featureKey,
                p_increment: increment
            });

            if (error) throw new Error(error.message);
            return data; // boolean
        } catch (error) {
            loggerUtils.error(`Error checking usage limit for user: ${userId}, feature: ${featureKey}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Mendapatkan saldo kredit user
     * @param {string} userId - ID user
     */
    async getUserCredit(userId) {
        try {
            const { data, error } = await supabase
                .from('user_credits')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                throw new Error(error.message);
            }
            
            return data ? data.balance : 0;
        } catch (error) {
            loggerUtils.error(`Error getting credit balance for user: ${userId}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Menambah kredit user
     * @param {string} userId - ID user
     * @param {number} amount - Jumlah kredit yang ditambahkan
     * @param {string} description - Deskripsi transaksi
     * @param {string} adminId - ID admin yang menambahkan kredit (opsional)
     */
    async addCredit(userId, amount, description, adminId = null) {
        try {
            // Gunakan supabaseAdmin untuk bypass RLS
            const { data, error } = await supabaseAdmin.rpc('add_user_credit', {
                p_user_id: userId,
                p_amount: amount,
                p_description: description,
                p_transaction_type: 'topup',
                p_admin_id: adminId
            });

            if (error) throw new Error(error.message);
            
            return data; // Transaction ID
        } catch (error) {
            loggerUtils.error(`Error adding credit for user: ${userId}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Menggunakan kredit user untuk berlangganan paket
     * @param {string} userId - ID user
     * @param {string} planCode - Kode paket
     */
    async subscribeWithCredit(userId, planCode) {
        try {
            // Dapatkan detail paket
            const plan = await this.getPlanByCode(planCode);
            if (!plan) throw new Error(`Plan not found: ${planCode}`);

            // Dapatkan saldo kredit user
            const creditBalance = await this.getUserCredit(userId);
            if (creditBalance < plan.price) {
                throw new Error('Insufficient credit balance');
            }

            // Buat subscription baru dengan status pending
            const subscription = await this.createSubscription(userId, plan.id, 'pending', 'credit');

            // Gunakan kredit user dengan supabaseAdmin untuk bypass RLS
            const { data: transactionId, error: creditError } = await supabaseAdmin.rpc('use_user_credit', {
                p_user_id: userId,
                p_amount: plan.price,
                p_description: `Pembayaran untuk paket ${plan.name}`,
                p_transaction_type: 'subscription',
                p_reference_id: subscription.id
            });

            if (creditError || !transactionId) {
                throw new Error(creditError?.message || 'Failed to process credit transaction');
            }

            // Update subscription dengan credit_transaction_id dan aktivasi
            await this.updateSubscription(subscription.id, {
                credit_transaction_id: transactionId,
                status: 'active',
                current_period_starts_at: new Date(),
                current_period_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 hari
            });

            // Dapatkan subscription yang sudah diupdate
            const { data: updatedSubscription, error } = await supabaseAdmin
                .from('subscriptions')
                .select('*, plans(*)')
                .eq('id', subscription.id)
                .single();

            if (error) throw new Error(error.message);
            
            return updatedSubscription;
        } catch (error) {
            loggerUtils.error(`Error subscribing with credit for user: ${userId}, plan: ${planCode}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Mendapatkan riwayat transaksi kredit user
     * @param {string} userId - ID user
     * @param {number} limit - Jumlah transaksi yang diambil
     * @param {number} offset - Offset untuk pagination
     */
    async getCreditTransactions(userId, limit = 10, offset = 0) {
        try {
            const { data, error, count } = await supabase
                .from('credit_transactions')
                .select('*', { count: 'exact' })
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) throw new Error(error.message);
            
            return { transactions: data, total: count };
        } catch (error) {
            loggerUtils.error(`Error getting credit transactions for user: ${userId}`, { error: error.message });
            throw error;
        }
    }
}

export default new BillingService(); 