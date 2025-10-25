-- Pastikan ekstensi yang diperlukan sudah aktif
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Berikan izin penggunaan pada postres, user default untuk cron
GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA extensions TO postgres;

-- Buat atau perbarui jadwal untuk menjalankan fungsi setiap 3 jam
-- cron.schedule akan memperbarui jadwal yang ada jika namanya sama
-- '0 */3 * * *' artinya: pada menit ke-0, setiap 3 jam, setiap hari
SELECT cron.schedule(
  'cleanup_old_files',
  '0 */3 * * *',
  $$
    SELECT net.http_post(
      -- URL untuk memanggil Edge Function Anda
      url:='https://ovscsiulvdgwamhlkwkq.supabase.co/functions/v1/cleanup-storage',
      -- Header otorisasi
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92c2NzaXVsdmRnd2FtaGxrd2txIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjU2NjgyMSwiZXhwIjoyMDU4MTQyODIxfQ.KYQpapt5AFoAxkactmx9ST3k9D1z9LO0CPhn2Tb0e8E"}'::jsonb,
      -- Body request (bisa kosong)
      body:='{}'::jsonb
    )
  $$
); 