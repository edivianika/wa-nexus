-- Function to create the asset_library table
CREATE OR REPLACE FUNCTION create_asset_library_table()
RETURNS void AS $$
BEGIN
  -- Check if table exists
  IF NOT EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'asset_library'
  ) THEN
    -- Create the asset_library table
    CREATE TABLE public.asset_library (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      duration INTEGER,
      thumbnail_path TEXT,
      tags TEXT[] DEFAULT '{}',
      metadata JSONB DEFAULT '{}'::jsonb,
      usage_count INTEGER DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      last_used_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );

    -- Create indexes
    CREATE INDEX idx_asset_library_user_id ON public.asset_library(user_id);
    CREATE INDEX idx_asset_library_content_hash ON public.asset_library(content_hash);
    CREATE INDEX idx_asset_library_asset_type ON public.asset_library(asset_type);
    CREATE INDEX idx_asset_library_tags ON public.asset_library USING GIN(tags);
    
    -- Add comments
    COMMENT ON TABLE public.asset_library IS 'Stores metadata for uploaded media assets';
    COMMENT ON COLUMN public.asset_library.id IS 'Unique identifier for the asset';
    COMMENT ON COLUMN public.asset_library.user_id IS 'User who owns this asset';
    COMMENT ON COLUMN public.asset_library.content_hash IS 'Hash of the file content for deduplication';
    COMMENT ON COLUMN public.asset_library.asset_type IS 'Type of asset (image, video, audio, document)';
  END IF;
END;
$$ LANGUAGE plpgsql; 