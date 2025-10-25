require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Script untuk menjalankan migrasi database
async function runMigration() {
  try {
    console.log('Menjalankan migrasi database...');

    // Ambil kredensial dari environment
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_KEY/SUPABASE_ANON_KEY harus diatur dalam .env');
    }

    // Buat Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    // Jalankan SQL
    console.log('Menjalankan SQL...');
    
    // Metode 1: Menggunakan stored procedure pgaudit.exec_sql jika tersedia
    try {
      const { data, error } = await supabase.rpc('pgaudit.exec_sql', { query: sql });
      if (error) throw error;
      console.log('Migrasi berhasil dengan pgaudit.exec_sql!');
      return;
    } catch (e) {
      console.log('pgaudit.exec_sql tidak tersedia, mencoba metode lain...');
    }

    // Metode 2: Gunakan supabase.function jika tersedia (versi baru)
    try {
      const { data, error } = await supabase.functions.invoke('db-migration', {
        body: { sql }
      });
      if (error) throw error;
      console.log('Migrasi berhasil dengan functions.invoke!');
      return;
    } catch (e) {
      console.log('functions.invoke tidak tersedia, mencoba metode terakhir...');
    }
    
    // Metode 3: Manual update melalui beberapa RPC dan query
    console.log('Menjalankan migrasi manual...');

    // 1. Drop fungsi lama
    await supabase
      .from('_migration_temp')
      .insert([{ step: 'Dropping old function' }])
      .select()
      .then(({ error }) => {
        if (error) console.log('Error pada tabel temporary, tapi tetap lanjut');
      });

    // 2. Pisahkan SQL menjadi bagian-bagian yang dapat dikelola
    // Tulis ke file terpisah yang bisa dijalankan lewat Supabase dashboard

    console.log(`
INSTRUKSI MANUAL:
1. Buka Supabase Dashboard
2. Buka tab SQL Editor
3. Jalankan SQL ini:

${sql}

4. Verifikasi dengan menjalankan:
   SELECT proname, prosrc FROM pg_proc WHERE proname = 'get_first_drip_message';
`);

  } catch (error) {
    console.error('Error saat menjalankan migrasi:', error.message);
  }
}

runMigration().catch(console.error); 