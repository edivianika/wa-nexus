import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function checkConfig() {
  try {
    // Check active connections and their agents
    console.log('\n=== Checking Active Connections ===');
    const { data: connections, error: connError } = await supabase
      .from('connections')
      .select(`
        id,
        api_key,
        connected,
        phone_number,
        ai_agents (
          id,
          name,
          agent_url,
          settings
        )
      `)
      .eq('connected', true);

    if (connError) {
      console.error('Error fetching connections:', connError);
    } else {
      console.log('Active Connections:');
      console.log(JSON.stringify(connections, null, 2));
    }

    // Check broadcast jobs
    console.log('\n=== Checking Recent Broadcast Jobs ===');
    const { data: jobs, error: jobsError } = await supabase
      .from('broadcast_jobs')
      .select(`
        id,
        connection_id,
        status,
        progress,
        total_contacts,
        sent_count,
        failed_count,
        skipped_count,
        created_at,
        completed_at
      `)
      .in('status', ['active', 'queued', 'failed'])
      .order('created_at', { ascending: false })
      .limit(5);

    if (jobsError) {
      console.error('Error fetching jobs:', jobsError);
    } else {
      console.log('Recent Jobs:');
      console.log(JSON.stringify(jobs, null, 2));
    }

    // Check recent messages
    console.log('\n=== Checking Recent Messages ===');
    const { data: messages, error: msgError } = await supabase
      .from('broadcast_messages')
      .select(`
        id,
        job_id,
        contact,
        status,
        message_id,
        error,
        sent_at,
        created_at
      `)
      .gt('created_at', new Date(Date.now() - 3600000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    if (msgError) {
      console.error('Error fetching messages:', msgError);
    } else {
      console.log('Recent Messages:');
      console.log(JSON.stringify(messages, null, 2));
    }

    // Check environment variables
    console.log('\n=== Checking Environment Variables ===');
    console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Set' : '❌ Not Set');
    console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ Set' : '❌ Not Set');
    console.log('SEND_MESSAGE_API_URL:', process.env.SEND_MESSAGE_API_URL ? '✅ Set' : '❌ Not Set');
    console.log('REDIS_HOST:', process.env.REDIS_HOST || 'localhost');
    console.log('REDIS_PORT:', process.env.REDIS_PORT || '6379');

  } catch (err) {
    console.error('Error checking config:', err);
  }
}

checkConfig(); 