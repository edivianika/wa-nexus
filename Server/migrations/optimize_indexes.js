/**
 * optimize_indexes.js
 * Migration script to add performance-enhancing indexes for broadcast media handling
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Starting migration: Adding performance indexes for broadcast media handling');

  try {
    // Add index on asset_library for faster media retrieval
    console.log('Adding index on asset_library table...');
    await supabase.rpc('exec', {
      query: `
        CREATE INDEX IF NOT EXISTS idx_asset_library_id ON asset_library (id);
        CREATE INDEX IF NOT EXISTS idx_asset_library_storage_path ON asset_library (storage_path);
        CREATE INDEX IF NOT EXISTS idx_asset_library_bucket_name ON asset_library (bucket_name);
      `
    });

    // Add index on broadcast_messages for faster status updates
    console.log('Adding index on broadcast_messages table...');
    await supabase.rpc('exec', {
      query: `
        CREATE INDEX IF NOT EXISTS idx_broadcast_messages_job_id ON broadcast_messages (job_id);
        CREATE INDEX IF NOT EXISTS idx_broadcast_messages_contact ON broadcast_messages (contact);
        CREATE INDEX IF NOT EXISTS idx_broadcast_messages_status ON broadcast_messages (status);
      `
    });

    // Add index on broadcast_jobs for faster job processing
    console.log('Adding index on broadcast_jobs table...');
    await supabase.rpc('exec', {
      query: `
        CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_status ON broadcast_jobs (status);
        CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_connection_id ON broadcast_jobs (connection_id);
        CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_created_at ON broadcast_jobs (created_at);
      `
    });

    // Add validation constraint to ensure connection_id is not null
    console.log('Adding validation constraint for connection_id...');
    await supabase.rpc('exec', {
      query: `
        ALTER TABLE broadcast_jobs 
        ADD CONSTRAINT broadcast_jobs_connection_id_not_null 
        CHECK (connection_id IS NOT NULL);
      `
    });

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

run(); 