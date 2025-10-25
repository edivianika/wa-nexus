-- Function to create a policy on a table
CREATE OR REPLACE FUNCTION create_policy(
  table_name text,
  policy_name text,
  policy_definition text,
  policy_operation text DEFAULT 'ALL',
  policy_command text DEFAULT 'CREATE'
)
RETURNS void AS $$
BEGIN
  -- Check if policy exists
  IF policy_command = 'CREATE' AND EXISTS (
    SELECT 1 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = table_name 
    AND policyname = policy_name
  ) THEN
    -- Drop existing policy
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
  END IF;
  
  -- Create policy
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR %s TO authenticated USING (%s)',
    policy_name, 
    table_name,
    policy_operation,
    policy_definition
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 