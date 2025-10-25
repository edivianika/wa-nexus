/**
 * Database optimization migration
 * Adds indexes to frequently accessed columns to improve query performance
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * Apply database optimizations
 */
async function applyOptimizations() {
  console.log('Starting database optimization migration...');
  
  try {
    // Create indexes on scheduled_messages table
    console.log('Creating indexes on scheduled_messages table...');
    await supabase.rpc('create_index_if_not_exists', {
      index_name: 'idx_scheduled_messages_status',
      table_name: 'scheduled_messages',
      column_name: 'status'
    });
    
    await supabase.rpc('create_index_if_not_exists', {
      index_name: 'idx_scheduled_messages_scheduled_at',
      table_name: 'scheduled_messages',
      column_name: 'scheduled_at'
    });
    
    await supabase.rpc('create_index_if_not_exists', {
      index_name: 'idx_scheduled_messages_owner_id',
      table_name: 'scheduled_messages',
      column_name: 'owner_id'
    });
    
    await supabase.rpc('create_index_if_not_exists', {
      index_name: 'idx_scheduled_messages_status_scheduled_at',
      table_name: 'scheduled_messages',
      column_name: 'status, scheduled_at'
    });
    
    // Create indexes on broadcast_jobs table
    console.log('Creating indexes on broadcast_jobs table...');
    await supabase.rpc('create_index_if_not_exists', {
      index_name: 'idx_broadcast_jobs_status',
      table_name: 'broadcast_jobs',
      column_name: 'status'
    });
    
    await supabase.rpc('create_index_if_not_exists', {
      index_name: 'idx_broadcast_jobs_owner_id',
      table_name: 'broadcast_jobs',
      column_name: 'owner_id'
    });
    
    await supabase.rpc('create_index_if_not_exists', {
      index_name: 'idx_broadcast_jobs_created_at',
      table_name: 'broadcast_jobs',
      column_name: 'created_at'
    });
    
    // Create indexes on drip_messages table
    console.log('Creating indexes on drip_messages table...');
    await supabase.rpc('create_index_if_not_exists', {
      index_name: 'idx_drip_messages_campaign_id',
      table_name: 'drip_messages',
      column_name: 'campaign_id'
    });
    
    await supabase.rpc('create_index_if_not_exists', {
      index_name: 'idx_drip_messages_message_order',
      table_name: 'drip_messages',
      column_name: 'message_order'
    });
    
    // Create indexes on contacts table
    console.log('Creating indexes on contacts table...');
    await supabase.rpc('create_index_if_not_exists', {
      index_name: 'idx_contacts_phone_number',
      table_name: 'contacts',
      column_name: 'phone_number'
    });
    
    await supabase.rpc('create_index_if_not_exists', {
      index_name: 'idx_contacts_owner_id',
      table_name: 'contacts',
      column_name: 'owner_id'
    });
    
    // Create stored procedure for checking pending messages efficiently
    console.log('Creating stored procedure for efficient message checking...');
    await supabase.rpc('execute_sql', {
      sql: `
        CREATE OR REPLACE FUNCTION get_pending_messages_due(limit_count INTEGER DEFAULT 100)
        RETURNS TABLE (
          id UUID,
          connection_id UUID,
          contact_id VARCHAR,
          message TEXT,
          scheduled_at TIMESTAMPTZ,
          type VARCHAR,
          media_url TEXT,
          caption TEXT,
          asset_id UUID,
          status VARCHAR,
          owner_id UUID
        )
        LANGUAGE plpgsql
        AS $$
        BEGIN
          RETURN QUERY
          SELECT 
            sm.id,
            sm.connection_id,
            sm.contact_id,
            sm.message,
            sm.scheduled_at,
            sm.type,
            sm.media_url,
            sm.caption,
            sm.asset_id,
            sm.status,
            sm.owner_id
          FROM 
            scheduled_messages sm
          WHERE 
            sm.status = 'pending' 
            AND sm.scheduled_at <= now()
          ORDER BY 
            sm.scheduled_at ASC
          LIMIT limit_count;
        END;
        $$;
      `
    });
    
    console.log('Database optimization migration completed successfully!');
  } catch (error) {
    console.error('Error applying database optimizations:', error);
    throw error;
  }
}

// Create the RPC function if it doesn't exist
async function createHelperFunctions() {
  try {
    await supabase.rpc('execute_sql', {
      sql: `
        CREATE OR REPLACE FUNCTION create_index_if_not_exists(
          index_name text,
          table_name text,
          column_name text
        ) RETURNS void AS $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE indexname = index_name
          ) THEN
            EXECUTE format('CREATE INDEX %I ON %I (%s)', 
                          index_name, table_name, column_name);
            RAISE NOTICE 'Created index %', index_name;
          ELSE
            RAISE NOTICE 'Index % already exists', index_name;
          END IF;
        END;
        $$ LANGUAGE plpgsql;
        
        CREATE OR REPLACE FUNCTION execute_sql(sql text) RETURNS void AS $$
        BEGIN
          EXECUTE sql;
        END;
        $$ LANGUAGE plpgsql;
      `
    });
    console.log('Helper functions created successfully');
  } catch (error) {
    console.error('Error creating helper functions:', error);
    throw error;
  }
}

async function runMigration() {
  try {
    await createHelperFunctions();
    await applyOptimizations();
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  runMigration();
}

export { runMigration }; 