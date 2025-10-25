-- Jika tabel files sudah ada, hapus terlebih dahulu
DROP TABLE IF EXISTS files;

-- Buat tabel files baru dengan struktur yang benar
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  original_filename TEXT,
  mimetype TEXT,
  size BIGINT DEFAULT 0,
  file_path TEXT NOT NULL,
  user_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending'
);

-- Buat indeks untuk mempercepat pencarian berdasarkan agent_id dan user_id
CREATE INDEX files_agent_id_idx ON files (agent_id);
CREATE INDEX files_user_id_idx ON files (user_id);

-- Contoh query untuk menghapus semua baris dengan file path yang sama
-- Ini bisa digunakan untuk membersihkan data duplikat jika diperlukan
-- DELETE FROM files WHERE file_path IN (
--   SELECT file_path FROM files GROUP BY file_path HAVING COUNT(*) > 1
-- ) AND id NOT IN (
--   SELECT MIN(id) FROM files GROUP BY file_path HAVING COUNT(*) > 1
-- );

-- Contoh membuat trigger untuk update timestamp saat file dimodifikasi
-- Aktifkan jika Anda ingin menambah kolom updated_at nanti
-- 
-- ALTER TABLE files ADD COLUMN updated_at TIMESTAMPTZ;
-- 
-- CREATE OR REPLACE FUNCTION update_files_timestamp()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   NEW.updated_at = NOW();
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
-- 
-- CREATE TRIGGER set_files_timestamp
-- BEFORE UPDATE ON files
-- FOR EACH ROW
-- EXECUTE FUNCTION update_files_timestamp(); 