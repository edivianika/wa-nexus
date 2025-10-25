-- File: supabase/migrations/20240625000000_add_credit_system.sql
-- Migrasi untuk menambahkan sistem kredit sebagai pengganti Xendit

-- Tabel untuk menyimpan saldo kredit user
CREATE TABLE IF NOT EXISTS public.user_credits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    balance INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);
COMMENT ON TABLE public.user_credits IS 'Menyimpan saldo kredit user untuk pembelian paket.';

-- Tabel untuk mencatat riwayat transaksi kredit
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    amount INT NOT NULL, -- Positif untuk topup, negatif untuk penggunaan
    balance_after INT NOT NULL, -- Saldo setelah transaksi
    description TEXT NOT NULL,
    transaction_type TEXT NOT NULL, -- 'topup', 'subscription', 'refund', dll
    reference_id UUID, -- ID subscription atau transaksi lain yang terkait
    status TEXT NOT NULL DEFAULT 'completed', -- 'pending', 'completed', 'failed', 'canceled'
    admin_id UUID, -- ID admin yang memproses topup (jika manual)
    created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.credit_transactions IS 'Mencatat semua transaksi kredit user.';

-- Tambahkan kolom payment_method ke tabel subscriptions
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'credit';
COMMENT ON COLUMN public.subscriptions.payment_method IS 'Metode pembayaran: credit, manual, dll';

-- Tambahkan kolom credit_transaction_id ke tabel subscriptions
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS credit_transaction_id UUID REFERENCES public.credit_transactions(id);
COMMENT ON COLUMN public.subscriptions.credit_transaction_id IS 'Referensi ke transaksi kredit untuk subscription ini';

-- Fungsi untuk menambah kredit user
CREATE OR REPLACE FUNCTION add_user_credit(
    p_user_id UUID,
    p_amount INT,
    p_description TEXT,
    p_transaction_type TEXT DEFAULT 'topup',
    p_reference_id UUID DEFAULT NULL,
    p_admin_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_new_balance INT;
    v_transaction_id UUID;
BEGIN
    -- Insert or update user credit balance
    INSERT INTO public.user_credits (user_id, balance)
    VALUES (p_user_id, p_amount)
    ON CONFLICT (user_id)
    DO UPDATE SET 
        balance = user_credits.balance + p_amount,
        updated_at = NOW()
    RETURNING balance INTO v_new_balance;
    
    -- Record transaction
    INSERT INTO public.credit_transactions (
        user_id, 
        amount, 
        balance_after, 
        description, 
        transaction_type, 
        reference_id, 
        admin_id
    )
    VALUES (
        p_user_id, 
        p_amount, 
        v_new_balance, 
        p_description, 
        p_transaction_type, 
        p_reference_id, 
        p_admin_id
    )
    RETURNING id INTO v_transaction_id;
    
    RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Fungsi untuk menggunakan kredit user
CREATE OR REPLACE FUNCTION use_user_credit(
    p_user_id UUID,
    p_amount INT,
    p_description TEXT,
    p_transaction_type TEXT DEFAULT 'subscription',
    p_reference_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_current_balance INT;
    v_new_balance INT;
    v_transaction_id UUID;
BEGIN
    -- Get current balance
    SELECT balance INTO v_current_balance
    FROM public.user_credits
    WHERE user_id = p_user_id;
    
    -- Check if user has enough credit
    IF v_current_balance IS NULL OR v_current_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient credit balance';
    END IF;
    
    -- Update user credit balance
    UPDATE public.user_credits
    SET 
        balance = balance - p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;
    
    -- Record transaction (negative amount for usage)
    INSERT INTO public.credit_transactions (
        user_id, 
        amount, 
        balance_after, 
        description, 
        transaction_type, 
        reference_id
    )
    VALUES (
        p_user_id, 
        -p_amount, 
        v_new_balance, 
        p_description, 
        p_transaction_type, 
        p_reference_id
    )
    RETURNING id INTO v_transaction_id;
    
    RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow users to view their own credit" ON public.user_credits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Allow users to view their own transactions" ON public.credit_transactions FOR SELECT USING (auth.uid() = user_id);

-- Allow admins to view and update all credits (you'll need to define who admins are)
CREATE POLICY "Allow admins to manage all credits" ON public.user_credits USING (
    auth.jwt() ? 'is_admin' AND auth.jwt()->>'is_admin' = 'true'
);
CREATE POLICY "Allow admins to view all transactions" ON public.credit_transactions USING (
    auth.jwt() ? 'is_admin' AND auth.jwt()->>'is_admin' = 'true'
);

-- Indeks untuk meningkatkan performa query
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON public.credit_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at); 