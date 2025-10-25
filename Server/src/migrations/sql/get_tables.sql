-- Function to get all tables in the public schema
CREATE OR REPLACE FUNCTION get_tables()
RETURNS TABLE(tablename text) AS $$
BEGIN
  RETURN QUERY
  SELECT pg_tables.tablename::text
  FROM pg_tables
  WHERE schemaname = 'public';
END;
$$ LANGUAGE plpgsql; 