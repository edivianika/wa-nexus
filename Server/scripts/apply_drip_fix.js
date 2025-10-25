/**
 * Script to apply drip campaign display fix migration
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function applyMigration() {
  try {
    console.log('Reading migration file...');
    const migrationPath = path.join(__dirname, '../migrations/fix_drip_campaign_display.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Applying migration...');
    const { error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.error('Error applying migration:', error);
      return;
    }
    
    console.log('Migration applied successfully!');
    console.log('Drip campaign display functions have been updated.');
    console.log('The contact list page will now display drip campaigns more consistently.');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Execute the migration
applyMigration(); 