-- Add rate limit fields to drip_campaigns table
ALTER TABLE public.drip_campaigns
ADD COLUMN IF NOT EXISTS message_rate_limit INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS rate_limit_window INTEGER DEFAULT 60000,
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority in ('high', 'normal', 'low'));

-- Documentation comment
COMMENT ON COLUMN public.drip_campaigns.message_rate_limit IS 'Batas jumlah pesan per window - default 10';
COMMENT ON COLUMN public.drip_campaigns.rate_limit_window IS 'Window waktu dalam milidetik untuk rate limit - default 60000 (1 menit)';
COMMENT ON COLUMN public.drip_campaigns.priority IS 'Prioritas kampanye: high, normal, low - menentukan urutan eksekusi';

-- Create index for priority for faster job scheduling
CREATE INDEX IF NOT EXISTS idx_drip_campaigns_priority ON public.drip_campaigns(priority);

-- Update any existing rows with default values
UPDATE public.drip_campaigns
SET message_rate_limit = 10,
    rate_limit_window = 60000,
    priority = 'normal'
WHERE message_rate_limit IS NULL 
   OR rate_limit_window IS NULL
   OR priority IS NULL; 