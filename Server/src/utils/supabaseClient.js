/**
 * Shared Supabase client untuk digunakan di seluruh aplikasi
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Client standar dengan anon key
const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false
    }
  }
);

// Client dengan service role untuk operasi admin
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY 
  ? createClient(
      process.env.SUPABASE_URL, 
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false
        }
      }
    )
  : supabase;
 
export { 
  supabase,
  supabaseAdmin
}; 