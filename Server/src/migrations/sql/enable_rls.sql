-- Function to enable RLS on a table
CREATE OR REPLACE FUNCTION enable_rls(table_name text)
RETURNS void AS $$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 