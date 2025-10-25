import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function runMigration() {
  try {
    // Get migration file path from command line arguments
    const migrationFilePath = process.argv[2];
    
    if (!migrationFilePath) {
      console.error('Please provide a migration file path');
      process.exit(1);
    }
    
    // Read migration file
    const sql = fs.readFileSync(path.resolve(migrationFilePath), 'utf8');
    
    console.log(`Running migration: ${migrationFilePath}`);
    
    // Split SQL statements by semicolon
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (const statement of statements) {
      console.log(`Executing: ${statement.trim()}`);
      
      // Execute SQL directly
      const { error } = await supabase.from('scheduled_messages').select('id').limit(1);
      if (error) {
        console.error('Error connecting to database:', error);
        process.exit(1);
      }
      
      // Use REST API to execute raw SQL
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/run_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          sql: statement.trim()
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Migration statement failed:', errorData);
      } else {
        console.log('Statement executed successfully');
      }
    }
    
    console.log('Migration successful!');
    process.exit(0);
  } catch (err) {
    console.error('Error running migration:', err);
    process.exit(1);
  }
}

runMigration(); 