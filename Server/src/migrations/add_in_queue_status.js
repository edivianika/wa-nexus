import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

async function runMigration() {
  console.log('Running migration: Add in_queue status to scheduled_messages table');

  // Initialize Supabase client
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  );

  try {
    // First, check if the scheduled_messages table exists by trying to select from it
    console.log('Checking if scheduled_messages table exists...');
    const { data: tableCheck, error: tableError } = await supabase
      .from('scheduled_messages')
      .select('id')
      .limit(1);
    
    if (tableError && tableError.code !== 'PGRST116') {
      console.error('Error checking table:', tableError);
      return;
    }
    
    if (tableError && tableError.code === 'PGRST116') {
      console.log('Table scheduled_messages does not exist');
      return;
    }
    
    console.log('Table scheduled_messages exists, checking status column...');
    
    // Check if we can query the status column
    const { data: statusCheck, error: statusError } = await supabase
      .from('scheduled_messages')
      .select('status')
      .limit(1);
    
    if (statusError) {
      console.error('Error checking status column:', statusError);
      return;
    }
    
    console.log('Status column exists');
    
    // Get a sample record to understand the schema
    const { data: sampleData, error: sampleError } = await supabase
      .from('scheduled_messages')
      .select('*')
      .limit(1);
      
    if (sampleError) {
      console.error('Error getting sample data:', sampleError);
      return;
    }
    
    if (!sampleData || sampleData.length === 0) {
      console.log('No sample data available, cannot continue');
      return;
    }
    
    console.log('Sample record:', sampleData);
    
    // Check if the enum already includes 'in_queue'
    console.log('Checking if enum already includes in_queue status...');
    
    // Get the current enum values by querying the pg_enum table
    // We can't do this directly with Supabase REST API, so we'll try a different approach
    
    // Try to update an existing record to use 'in_queue' status
    // If it fails with an enum error, we know we need to add the value
    try {
      // Use the sample record's ID
      const sampleId = sampleData[0].id;
      const originalStatus = sampleData[0].status;
      
      console.log(`Trying to update record ${sampleId} to in_queue status...`);
      
      const { error: updateError } = await supabase
        .from('scheduled_messages')
        .update({ status: 'in_queue' })
        .eq('id', sampleId);
      
      if (updateError) {
        if (updateError.message && updateError.message.includes('invalid input value for enum')) {
          console.log('Enum does not include in_queue status, need to update it');
          
          // We can't directly modify the enum through the REST API
          console.log('Please run the following SQL in your database:');
          console.log('ALTER TYPE public.scheduled_message_status ADD VALUE IF NOT EXISTS \'in_queue\';');
          
          console.log('Alternatively, you can use the Supabase dashboard SQL editor to run this command.');
        } else {
          console.error('Unexpected error during update test:', updateError);
        }
      } else {
        console.log('Successfully updated record to in_queue status, enum already supports it');
        
        // Restore the original status
        await supabase
          .from('scheduled_messages')
          .update({ status: originalStatus })
          .eq('id', sampleId);
      }
    } catch (error) {
      console.error('Error during update test:', error);
    }
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

export { runMigration }; 