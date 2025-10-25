-- Function to execute arbitrary SQL (for migrations)
-- WARNING: This function should only be used by admins with service role key
CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
RETURNS void AS $$
BEGIN
  EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 