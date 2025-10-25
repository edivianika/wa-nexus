-- Migration untuk menambahkan kolom metadata ke tabel drip_subscribers
-- Eksekusi di Supabase SQL Editor

-- Tambahkan kolom metadata dengan tipe JSONB
ALTER TABLE "public"."drip_subscribers"
ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}'::jsonb;

-- Tambahkan indeks untuk pencarian di dalam metadata (opsional, untuk performa)
CREATE INDEX IF NOT EXISTS idx_drip_subscribers_metadata 
ON "public"."drip_subscribers" USING GIN ("metadata");

-- Komentar untuk dokumentasi
COMMENT ON COLUMN "public"."drip_subscribers"."metadata" IS 'Metadata fleksibel dalam format JSON untuk menyimpan informasi tambahan subscriber'; 