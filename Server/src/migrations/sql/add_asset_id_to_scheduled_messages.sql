-- Function to add asset_id column to scheduled_messages table
CREATE OR REPLACE FUNCTION add_asset_id_to_scheduled_messages()
RETURNS void AS $$
BEGIN
  -- Check if column exists
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scheduled_messages'
    AND column_name = 'asset_id'
  ) THEN
    -- Add the asset_id column
    ALTER TABLE public.scheduled_messages
    ADD COLUMN asset_id UUID REFERENCES public.asset_library(id) ON DELETE SET NULL;
    
    -- Add comment
    COMMENT ON COLUMN public.scheduled_messages.asset_id IS 'Reference to the asset used in this message';
  END IF;
END;
$$ LANGUAGE plpgsql; 