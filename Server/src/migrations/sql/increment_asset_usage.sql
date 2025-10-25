-- Function to increment asset usage count
CREATE OR REPLACE FUNCTION increment_asset_usage(asset_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.asset_library
  SET 
    usage_count = usage_count + 1,
    last_used_at = now()
  WHERE id = asset_id;
END;
$$ LANGUAGE plpgsql; 