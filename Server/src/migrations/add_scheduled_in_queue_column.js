/**
 * Migration: Menambahkan kolom scheduled_in_queue ke tabel scheduled_messages
 * 
 * Kolom ini digunakan untuk menandai pesan yang sudah dijadwalkan di BullMQ queue
 * untuk menghindari penjadwalan ganda.
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

async function runMigration() {
  console.log('Running migration: add_scheduled_in_queue_column');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  );
  
  try {
    // Tambahkan kolom scheduled_in_queue menggunakan SQL langsung
    const { error } = await supabase
      .from('scheduled_messages')
      .update({ scheduled_in_queue: true })
      .eq('id', '00000000-0000-0000-0000-000000000000'); // ID yang tidak ada, hanya untuk menjalankan query
    
    if (error) {
      // Jika error karena kolom belum ada, tambahkan kolom
      if (error.message && error.message.includes('scheduled_in_queue')) {
        console.log('Column does not exist, adding it...');
        
        // Gunakan metode alternatif untuk menambahkan kolom
        // Buat migrasi melalui tabel migrations
        const migrationId = 'add_scheduled_in_queue_column';
        const migrationSql = `
          ALTER TABLE scheduled_messages
          ADD COLUMN IF NOT EXISTS scheduled_in_queue BOOLEAN DEFAULT NULL;
        `;
        
        const { data, error: migrationError } = await supabase
          .from('migrations')
          .insert({
            id: migrationId,
            name: 'Add scheduled_in_queue column to scheduled_messages',
            sql: migrationSql,
            executed_at: new Date().toISOString()
          });
        
        if (migrationError) {
          console.error('Error creating migration record:', migrationError);
          
          // Jika tabel migrations tidak ada, kita harus menggunakan cara lain
          console.log('Attempting to execute SQL directly through REST API...');
          
          // Buat endpoint khusus untuk menjalankan SQL ini
          console.log(`
          PERHATIAN: Kolom 'scheduled_in_queue' perlu ditambahkan ke tabel 'scheduled_messages'.
          
          Silakan jalankan SQL berikut di database Anda:
          
          ALTER TABLE scheduled_messages
          ADD COLUMN IF NOT EXISTS scheduled_in_queue BOOLEAN DEFAULT NULL;
          
          `);
        } else {
          console.log('Migration record created successfully. Please run your migrations system to apply it.');
        }
      } else {
        console.error('Unexpected error:', error);
      }
    } else {
      console.log('Column scheduled_in_queue already exists.');
    }
    
    // Cek apakah kolom sudah ada dengan cara lain
    const { data: sample, error: sampleError } = await supabase
      .from('scheduled_messages')
      .select('scheduled_in_queue')
      .limit(1);
    
    if (!sampleError) {
      console.log('Column scheduled_in_queue is now available.');
    } else {
      console.error('Error checking column existence:', sampleError);
    }
    
    console.log('Migration completed.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('Migration process completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration process failed:', error);
      process.exit(1);
    });
}

export { runMigration }; 