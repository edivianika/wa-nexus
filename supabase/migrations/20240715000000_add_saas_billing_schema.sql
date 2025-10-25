-- File: supabase/migrations/20240715000000_add_saas_billing_schema.sql
-- Migrasi untuk menambahkan skema SaaS billing

-- Fungsi untuk mengecek apakah extension sudah terinstall
CREATE OR REPLACE FUNCTION check_extension_exists(ext_name TEXT) RETURNS BOOLEAN AS $$
DECLARE
    ext_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = ext_name
    ) INTO ext_exists;
    
    RETURN ext_exists;
END;
$$ LANGUAGE plpgsql;

-- Pastikan uuid-ossp extension sudah terinstall
DO $$
BEGIN
    IF NOT (SELECT check_extension_exists('uuid-ossp')) THEN
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    END IF;
END $$;

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
    user_id UUID NOT NULL,
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
    user_id UUID NOT NULL,
    feature_key TEXT NOT NULL, -- 'messages_sent', 'contacts_imported'
    usage_count INT NOT NULL DEFAULT 0,
    period_starts_at TIMESTAMPTZ NOT NULL,
    UNIQUE(user_id, feature_key, period_starts_at)
);
COMMENT ON TABLE public.usage_counters IS 'Tracks feature usage per billing period.';

-- Indeks untuk meningkatkan performa query
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_usage_counters_user_id_feature ON public.usage_counters(user_id, feature_key);
CREATE INDEX IF NOT EXISTS idx_usage_counters_period ON public.usage_counters(period_starts_at);

-- Enable RLS
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow public read access to active plans" ON public.plans FOR SELECT USING (is_active = true);
CREATE POLICY "Allow users to view their own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Allow users to view their own usage" ON public.usage_counters FOR SELECT USING (auth.uid() = user_id);

-- Fungsi untuk menambah usage counter
CREATE OR REPLACE FUNCTION increment_usage_counter(
    p_user_id UUID,
    p_feature_key TEXT,
    p_increment INT DEFAULT 1
) RETURNS VOID AS $$
DECLARE
    current_period TIMESTAMPTZ;
BEGIN
    -- Dapatkan periode saat ini (bulan)
    SELECT date_trunc('month', NOW()) INTO current_period;
    
    -- Upsert usage counter
    INSERT INTO public.usage_counters (user_id, feature_key, usage_count, period_starts_at)
    VALUES (p_user_id, p_feature_key, p_increment, current_period)
    ON CONFLICT (user_id, feature_key, period_starts_at)
    DO UPDATE SET usage_count = usage_counters.usage_count + p_increment;
END;
$$ LANGUAGE plpgsql;

-- Fungsi untuk mengecek apakah user masih dalam batas kuota
CREATE OR REPLACE FUNCTION check_usage_limit(
    p_user_id UUID,
    p_feature_key TEXT,
    p_increment INT DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
    v_limit INT;
    v_current_usage INT;
    v_current_period TIMESTAMPTZ;
    v_plan_id UUID;
BEGIN
    -- Dapatkan periode saat ini
    SELECT date_trunc('month', NOW()) INTO v_current_period;
    
    -- Dapatkan plan ID dari subscription yang aktif
    SELECT plan_id INTO v_plan_id
    FROM public.subscriptions
    WHERE user_id = p_user_id AND status = 'active'
    AND (current_period_ends_at IS NULL OR current_period_ends_at > NOW())
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Jika tidak ada subscription aktif, return false
    IF v_plan_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Dapatkan limit dari plan
    SELECT (limits->>p_feature_key)::INT INTO v_limit
    FROM public.plans
    WHERE id = v_plan_id;
    
    -- Jika limit tidak ditemukan atau -1 (unlimited), return true
    IF v_limit IS NULL OR v_limit = -1 THEN
        RETURN TRUE;
    END IF;
    
    -- Dapatkan current usage
    SELECT COALESCE(usage_count, 0) INTO v_current_usage
    FROM public.usage_counters
    WHERE user_id = p_user_id
    AND feature_key = p_feature_key
    AND period_starts_at = v_current_period;
    
    -- Cek apakah masih dalam batas
    RETURN (v_current_usage + p_increment) <= v_limit;
END;
$$ LANGUAGE plpgsql;

-- Seeding data untuk paket-paket
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
        "drip_campaigns": -1,
        "max_speed_msg_per_min": 20
    }',
    '{
        "has_webhook": true,
        "has_api_access": false,
        "has_watermark": false
    }'
),
(
    'starter',
    'Starter',
    199000,
    '{
        "messages_per_period": 20000,
        "active_devices": 2,
        "kanban_boards": -1,
        "drip_campaigns": -1,
        "max_speed_msg_per_min": 40
    }',
    '{
        "has_webhook": true,
        "has_api_access": true,
        "has_watermark": false,
        "has_ai_typing": true
    }'
),
(
    'growth',
    'Growth',
    399000,
    '{
        "messages_per_period": 60000,
        "active_devices": 4,
        "kanban_boards": -1,
        "drip_campaigns": -1,
        "max_speed_msg_per_min": 80,
        "team_members": 3
    }',
    '{
        "has_webhook": true,
        "has_api_access": true,
        "has_watermark": false,
        "has_ai_typing": true,
        "has_scheduled_campaigns": true
    }'
);

-- Trigger untuk update timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger untuk subscriptions
DROP TRIGGER IF EXISTS update_subscriptions_timestamp ON public.subscriptions;
CREATE TRIGGER update_subscriptions_timestamp
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE PROCEDURE update_timestamp(); 