-- Fix drip_subscribers table - add missing columns
-- This script adds the missing columns that were causing the error

-- Add missing status column
ALTER TABLE public.drip_subscribers 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';

-- Add other required columns
ALTER TABLE public.drip_subscribers 
ADD COLUMN IF NOT EXISTS subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.drip_subscribers 
ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.drip_subscribers 
ADD COLUMN IF NOT EXISTS next_message_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.drip_subscribers 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_drip_subscribers_status ON public.drip_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_drip_subscribers_next_message_at ON public.drip_subscribers(next_message_at);

-- Verify the table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'drip_subscribers' 
AND table_schema = 'public'
ORDER BY ordinal_position;
