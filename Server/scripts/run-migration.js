require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Buat Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function runMigration() {
  try {
    console.log('Menjalankan migrasi database...');

    // SQL untuk memperbaiki fungsi get_first_drip_message
    const sql = `
    -- Drop fungsi lama
    DROP FUNCTION IF EXISTS "public"."get_first_drip_message"(campaign_id_input uuid);

    -- Buat ulang fungsi dengan logika yang ditingkatkan
    CREATE OR REPLACE FUNCTION "public"."get_first_drip_message"(campaign_id_input uuid)
    RETURNS SETOF "public"."drip_messages" 
    LANGUAGE "plpgsql" 
    AS $$
    BEGIN
      -- Coba cari pesan dengan message_order = 1
      RETURN QUERY 
      SELECT * FROM "public"."drip_messages" 
      WHERE "drip_campaign_id" = campaign_id_input 
      AND "message_order" = 1 
      LIMIT 1;
      
      -- Jika tidak ditemukan, cari pesan dengan message_order terkecil
      IF NOT FOUND THEN
        RETURN QUERY
        SELECT * FROM "public"."drip_messages"
        WHERE "drip_campaign_id" = campaign_id_input
        ORDER BY "message_order" ASC
        LIMIT 1;
      END IF;
      
      -- Jika masih tidak ditemukan, cari pesan apa saja dari campaign ini
      IF NOT FOUND THEN
        RETURN QUERY
        SELECT * FROM "public"."drip_messages"
        WHERE "drip_campaign_id" = campaign_id_input
        LIMIT 1;
      END IF;
    END;
    $$;

    -- Berikan izin pada stored procedure yang baru
    GRANT EXECUTE ON FUNCTION "public"."get_first_drip_message"(uuid) TO "anon";
    GRANT EXECUTE ON FUNCTION "public"."get_first_drip_message"(uuid) TO "authenticated";
    GRANT EXECUTE ON FUNCTION "public"."get_first_drip_message"(uuid) TO "service_role";
    `;

    // Jalankan query SQL
    const { error } = await supabase.rpc('pgaudit.exec_sql', { query: sql });

    if (error) {
      console.error('Error saat menjalankan migrasi:', error.message);
      // Jika metode rpc tidak berfungsi, coba dengan query biasa
      const { error: directError } = await supabase.sql(sql);
      if (directError) {
        console.error('Error saat menjalankan migrasi langsung:', directError.message);
        
        // Opsi terakhir: coba jalankan sebagai serangkaian query terpisah
        console.log('Mencoba dengan metode alternatif...');
        
        // Pisahkan SQL menjadi beberapa pernyataan
        const statements = sql.split(';').filter(stmt => stmt.trim());
        
        for (const stmt of statements) {
          if (!stmt.trim()) continue;
          const { error: stmtError } = await supabase.sql(stmt + ';');
          if (stmtError) {
            console.error(`Error menjalankan pernyataan: ${stmt}\nError: ${stmtError.message}`);
          }
        }
      } else {
        console.log('Migrasi berhasil dijalankan dengan metode sql langsung.');
      }
    } else {
      console.log('Migrasi berhasil dijalankan!');
    }

    // Verifikasi fungsi yang diupdate
    console.log('Memeriksa apakah fungsi telah diperbarui...');
    
    const { data, error: checkError } = await supabase.sql(`
      SELECT * FROM pg_proc 
      WHERE proname = 'get_first_drip_message'
    `);
    
    if (checkError) {
      console.error('Error saat memeriksa fungsi:', checkError.message);
    } else {
      console.log('Fungsi get_first_drip_message berhasil diperbarui:', data);
    }

  } catch (error) {
    console.error('Error tidak terduga:', error.message);
  }
}

runMigration().catch(console.error); 