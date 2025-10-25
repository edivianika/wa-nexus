-- Function to create the asset_usage table
CREATE OR REPLACE FUNCTION create_asset_usage_table()
RETURNS void AS $$
BEGIN
  -- Check if table exists
  IF NOT EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'asset_usage'
  ) THEN
    -- Create the asset_usage table
    CREATE TABLE public.asset_usage (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      asset_id UUID NOT NULL REFERENCES public.asset_library(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL, -- 'drip_message', 'scheduled_message', 'broadcast', etc.
      entity_id TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );

    -- Create indexes
    CREATE INDEX idx_asset_usage_asset_id ON public.asset_usage(asset_id);
    CREATE INDEX idx_asset_usage_entity ON public.asset_usage(entity_type, entity_id);
    
    -- Add comments
    COMMENT ON TABLE public.asset_usage IS 'Tracks usage of assets in different entities';
    COMMENT ON COLUMN public.asset_usage.asset_id IS 'Reference to the asset being used';
    COMMENT ON COLUMN public.asset_usage.entity_type IS 'Type of entity using the asset (drip_message, scheduled_message, etc.)';
    COMMENT ON COLUMN public.asset_usage.entity_id IS 'ID of the entity using the asset';
  END IF;
END;
$$ LANGUAGE plpgsql; 