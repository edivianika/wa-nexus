# Panduan Implementasi Paket Hemat - WhatsApp Automation Suite

Dokumen ini menjelaskan langkah-langkah teknis untuk mengimplementasikan model bisnis SaaS dengan paket harga terjangkau pada aplikasi WhatsApp Automation Suite.

**Tujuan:** Meluncurkan paket "Micro" (Rp 49k) dan "Lite" (Rp 99k) untuk menjangkau pasar UKM mikro di Indonesia, sambil memastikan profitabilitas dan skalabilitas infrastruktur.

**Stack Teknologi:** Node.js/Express, Supabase (Postgres), Redis, BullMQ, Xendit.

---

## Phase 1: Fondasi Backend & Database (Target: Minggu 1)

Fokus pada penyesuaian skema data untuk mendukung multi-tenancy berbasis langganan dan throttling.

### 1.1. Migrasi Skema Database (Supabase)

Buat file migrasi SQL baru di Supabase untuk menambahkan tabel `plans`, `subscriptions`, dan `usage_counters`.

```sql
-- File: supabase/migrations/YYYYMMDDHHMMSS_add_billing_schema.sql

-- Tabel untuk menyimpan detail semua paket yang ditawarkan
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL, -- e.g., 'micro', 'lite', 'starter'
    name TEXT NOT NULL,
    price INT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'IDR',
    limits JSONB NOT NULL, -- { "messages_per_period": 2500, "active_devices": 1, "max_speed": 10 }
    features JSONB, -- { "has_webhook": false, "has_api_access": false }
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.plans IS 'Master table for all subscription plans.';

-- Tabel untuk melacak langganan setiap tenant/user
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    plan_id UUID NOT NULL REFERENCES public.plans(id),
    xendit_invoice_id TEXT,
    status TEXT NOT NULL, -- 'trialing', 'active', 'past_due', 'canceled'
    trial_ends_at TIMESTAMPTZ,
    current_period_starts_at TIMESTAMPTZ,
    current_period_ends_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.subscriptions IS 'Tracks user subscriptions to plans.';

-- Tabel untuk menghitung penggunaan fitur (akan di-reset setiap periode)
CREATE TABLE IF NOT EXISTS public.usage_counters (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    feature_key TEXT NOT NULL, -- 'messages_sent', 'contacts_imported'
    usage_count INT NOT NULL DEFAULT 0,
    period_starts_at TIMESTAMPTZ NOT NULL,
    UNIQUE(user_id, feature_key, period_starts_at)
);
COMMENT ON TABLE public.usage_counters IS 'Tracks feature usage per billing period.';

-- Enable RLS
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow public read access to active plans" ON public.plans FOR SELECT USING (is_active = true);
CREATE POLICY "Allow users to view their own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Allow users to view their own usage" ON public.usage_counters FOR SELECT USING (auth.uid() = user_id);

```

### 1.2. Seeding Data Paket Baru

Masukkan data untuk paket "Micro" dan "Lite" ke dalam tabel `plans`.

```sql
-- Insert new low-cost plans
INSERT INTO public.plans (code, name, price, limits, features)
VALUES
(
    'micro',
    'Micro',
    49000,
    '{
        "messages_per_period": 2500,
        "active_devices": 1,
        "kanban_boards": 1,
        "drip_campaigns": 1,
        "max_speed_msg_per_min": 10
    }',
    '{
        "has_webhook": false,
        "has_api_access": false,
        "has_watermark": true
    }'
),
(
    'lite',
    'Lite',
    99000,
    '{
        "messages_per_period": 7500,
        "active_devices": 1,
        "kanban_boards": 5,
        "drip_campaigns": -1, -- -1 for unlimited
        "max_speed_msg_per_min": 20
    }',
    '{
        "has_webhook": true,
        "has_api_access": false,
        "has_watermark": false
    }'
);
```

### 1.3. Implementasi Rate Limiter di Worker

Gunakan `bullmq` Rate Limiter untuk membatasi kecepatan pengiriman pesan sesuai `max_speed_msg_per_min` dari plan.

```javascript
// Server/src/workers/broadcastWorker.js

const { Worker, RateLimiter } = require('bullmq');
const IORedis = require('ioredis');

// ... (connection to redis)

const processJob = async (job) => {
    const { tenantId, planDetails, messageData } = job.data;

    // Initialize rate limiter based on the user's plan
    const rateLimiter = new RateLimiter('broadcast-limiter', {
        connection: new IORedis(),
        max: planDetails.limits.max_speed_msg_per_min || 10, // Default to 10 if not set
        duration: 60, // Per 60 seconds
        id: `tenant:${tenantId}` // Unique limiter for each tenant
    });

    // Check if the job can proceed
    const isAllowed = await rateLimiter.get(1);
    if (!isAllowed) {
        // If rate limited, re-queue the job with a delay
        await job.moveToDelayed(Date.now() + 5000, job.token);
        throw new Error(`Rate limited for tenant ${tenantId}. Re-queuing.`);
    }

    // ... (rest of the message sending logic)
};

const worker = new Worker('broadcastQueue', processJob, { connection });
```

---

## Phase 2: Integrasi Billing & Onboarding (Target: Minggu 2)

Menghubungkan aplikasi dengan Xendit untuk proses pembayaran otomatis.

### 2.1. Halaman Pricing & Logika Pemilihan Paket

Buat komponen di frontend (React/Vue/etc.) yang me-render daftar paket dari endpoint `/api/plans`. Saat user memilih paket, panggil backend untuk membuat invoice.

### 2.2. Membuat Invoice Xendit

Buat endpoint di backend untuk membuat invoice di Xendit.

```javascript
// Server/src/api/routes/billingRoutes.js
const express = require('express');
const router = express.Router();
const Xendit = require('xendit-node');
const { getPlanByCode, createSubscription } = require('../services/billingService');

// Initialize Xendit
const x = new Xendit({ secretKey: process.env.XENDIT_SECRET_KEY });
const { Invoice } = x;

router.post('/create-invoice', async (req, res) => {
    const { planCode } = req.body;
    const userId = req.user.id;

    const plan = await getPlanByCode(planCode);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    // Create a subscription record in 'pending' state
    const subscription = await createSubscription(userId, plan.id, 'pending');

    try {
        const invoice = await Invoice.createInvoice({
            externalID: `sub-${subscription.id}`,
            payerEmail: req.user.email,
            description: `Pembayaran untuk paket ${plan.name}`,
            amount: plan.price,
            currency: 'IDR',
            successRedirectURL: `${process.env.APP_URL}/dashboard?payment=success`,
            failureRedirectURL: `${process.env.APP_URL}/pricing?payment=failed`,
            paymentMethods: ['QRIS', 'EWALLET'], // Focus on low-cost methods
        });

        // Save invoice_id to subscription for tracking
        await updateSubscription(subscription.id, { xendit_invoice_id: invoice.id });

        res.json({ invoice_url: invoice.invoice_url });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
```

### 2.3. Menangani Webhook Xendit

Buat endpoint untuk menerima notifikasi dari Xendit saat pembayaran berhasil atau gagal.

```javascript
// Server/src/api/routes/webhookRoutes.js

// Middleware to verify Xendit callback token
const verifyXenditSignature = (req, res, next) => {
    if (req.headers['x-callback-token'] !== process.env.XENDIT_CALLBACK_TOKEN) {
        return res.status(401).send('Invalid callback token');
    }
    next();
};

router.post('/xendit', verifyXenditSignature, async (req, res) => {
    const payload = req.body; // { external_id, status, amount, ... }

    if (payload.status === 'PAID') {
        const subscriptionId = payload.external_id.replace('sub-', '');
        
        // Activate the subscription in your database
        await activateSubscription(subscriptionId);

        // TODO: Trigger a welcome email/drip campaign
    }

    res.status(200).send('OK');
});

// In billingService.js
async function activateSubscription(subscriptionId) {
    // Logic to update subscription status to 'active'
    // and set current_period_starts_at and current_period_ends_at
}
```

---

## Phase 3: Optimalisasi & Feature Gating (Target: Minggu 3)

Menerapkan logika bisnis di aplikasi untuk membedakan fitur antar paket.

### 3.1. Menambahkan Watermark (Opsional)

Di worker pengiriman pesan, periksa plan user. Jika plan memiliki `has_watermark: true`, tambahkan footer ke pesan.

```javascript
// Server/src/workers/broadcastWorker.js
// Inside processJob function...

let messageContent = messageData.text;
if (planDetails.features.has_watermark) {
    messageContent += "\n\n---\nSent via MySaaSApp";
}

// Send 'messageContent'
```

### 3.2. Middleware `quotaGuard`

Buat middleware untuk memeriksa kuota sebelum mengizinkan aksi.

```javascript
// Server/src/middleware/quotaGuard.js
const { getUsage, getSubscription } = require('../services/billingService');

const quotaGuard = (featureKey, incrementBy = 1) => {
    return async (req, res, next) => {
        const userId = req.user.id;
        const subscription = await getSubscription(userId);
        const limit = subscription.plan.limits[featureKey] ?? -1;

        if (limit === -1) { // Unlimited
            return next();
        }

        const currentUsage = await getUsage(userId, featureKey);
        
        if ((currentUsage + incrementBy) > limit) {
            return res.status(429).json({
                error: 'Quota exceeded',
                message: `Anda telah mencapai batas kuota untuk ${featureKey}. Silakan upgrade paket Anda.`
            });
        }
        
        // Simpan increment ke request object untuk di-commit setelah proses berhasil
        req.usageIncrement = { key: featureKey, value: incrementBy };
        next();
    };
};

// Penggunaan di route:
// router.post('/send-broadcast', quotaGuard('messages_per_period', 1), broadcastController.send);
```

---

## Phase 4: Go-to-Market & Final Checks (Target: Minggu 4)

Persiapan akhir sebelum peluncuran paket baru.

1.  **UI/UX:**
    *   Pastikan halaman pricing sudah final.
    *   Buat banner "Upgrade" di dashboard yang muncul saat kuota mendekati 90%.
    *   Tampilkan sisa kuota (`limit - usage`) secara jelas di dashboard.

2.  **Marketing & Sales:**
    *   Siapkan materi promosi untuk "Early Bird".
    *   Buat grup Telegram/Discord untuk komunitas pengguna.

3.  **Final Testing:**
    *   Lakukan tes E2E: Pendaftaran -> Pilih Paket -> Bayar (gunakan test card Xendit) -> Verifikasi Aktivasi -> Kirim Pesan -> Cek Kuota Berkurang.
    *   Uji skenario pembayaran gagal dan invoice expired.
    *   Verifikasi rate limiter berfungsi sesuai plan.

---

Dengan mengikuti panduan ini, aplikasi Anda akan siap untuk meluncurkan model bisnis SaaS dengan paket harga yang kompetitif dan fundamental teknis yang solid. 