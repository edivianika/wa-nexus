require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// SQL to update the get_subscription_status function
const sql = `
-- Update the get_subscription_status function to include drip_campaigns and kanban_boards limits
CREATE OR REPLACE FUNCTION public.get_subscription_status()
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    result JSON;
    user_id UUID := auth.uid();
    active_subscription RECORD;
    trial_connection RECORD;
    messages_limit INT;
    messages_usage INT;
    drip_campaigns_limit INT;
    kanban_boards_limit INT;
BEGIN
    -- Cek subscription aktif
    SELECT s.id, s.status, s.current_period_ends_at, p.name AS plan_name, p.limits
    INTO active_subscription
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.user_id = user_id AND s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF FOUND THEN
        -- User dengan subscription aktif
        messages_limit := (active_subscription.limits->>'messages_per_period')::INT;
        drip_campaigns_limit := COALESCE((active_subscription.limits->>'drip_campaigns')::INT, 1);
        kanban_boards_limit := COALESCE((active_subscription.limits->>'kanban_boards')::INT, 1);
        
        SELECT COALESCE(usage_count, 0)
        INTO messages_usage
        FROM usage_counters
        WHERE usage_counters.user_id = user_id 
          AND feature_key = 'messages_per_period'
          AND period_starts_at = date_trunc('month', NOW());

        result := json_build_object(
            'user_type', 'premium',
            'plan_name', active_subscription.plan_name,
            'end_date', active_subscription.current_period_ends_at,
            'is_active', TRUE,
            'days_remaining', GREATEST(0, (active_subscription.current_period_ends_at::DATE - NOW()::DATE)),
            'limits', json_build_object(
                'messages_per_period', messages_limit,
                'drip_campaigns', drip_campaigns_limit,
                'kanban_boards', kanban_boards_limit
            ),
            'usage', json_build_object(
                'messages_per_period', messages_usage
            )
        );
    ELSE
        -- Cek koneksi trial
        SELECT id, expired_date
        INTO trial_connection
        FROM connections
        WHERE connections.user_id = user_id AND expired_date > NOW()
        ORDER BY created_at DESC
        LIMIT 1;

        IF FOUND THEN
            -- User dalam masa trial
            messages_limit := 100; -- Set trial limit
            drip_campaigns_limit := 1; -- Trial users get 1 drip campaign
            kanban_boards_limit := 1; -- Trial users get 1 kanban board

            SELECT COALESCE(usage_count, 0)
            INTO messages_usage
            FROM usage_counters
            WHERE usage_counters.user_id = user_id 
              AND feature_key = 'messages_per_period'
              AND period_starts_at = date_trunc('month', NOW());

            result := json_build_object(
                'user_type', 'trial',
                'plan_name', 'Trial',
                'end_date', trial_connection.expired_date,
                'is_active', TRUE,
                'days_remaining', GREATEST(0, (trial_connection.expired_date::DATE - NOW()::DATE)),
                'limits', json_build_object(
                    'messages_per_period', messages_limit,
                    'drip_campaigns', drip_campaigns_limit,
                    'kanban_boards', kanban_boards_limit
                ),
                'usage', json_build_object(
                    'messages_per_period', messages_usage
                )
            );
        ELSE
            -- User tidak punya subscription aktif maupun trial
            result := json_build_object(
                'user_type', 'inactive',
                'plan_name', 'N/A',
                'end_date', NULL,
                'is_active', FALSE,
                'days_remaining', 0,
                'limits', json_build_object(
                    'messages_per_period', 0,
                    'drip_campaigns', 0,
                    'kanban_boards', 0
                ),
                'usage', json_build_object(
                    'messages_per_period', 0
                )
            );
        END IF;
    END IF;

    RETURN result;
END;
$$;

-- Grant permissions to the updated function
GRANT EXECUTE ON FUNCTION public.get_subscription_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_status() TO service_role;
`;

async function updateFunction() {
  try {
    console.log('Updating get_subscription_status function...');
    
    // Execute the SQL directly
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.error('Error updating function:', error);
      console.log('\nPlease run this SQL manually in the Supabase SQL editor:');
      console.log(sql);
      process.exit(1);
    }
    
    console.log('Function updated successfully!', data);
  } catch (error) {
    console.error('Unexpected error:', error);
    console.log('\nPlease run this SQL manually in the Supabase SQL editor:');
    console.log(sql);
    process.exit(1);
  }
}

updateFunction(); 