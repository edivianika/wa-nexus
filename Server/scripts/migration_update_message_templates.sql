-- Migration untuk mengubah beberapa pesan menjadi template dengan metadata
-- Eksekusi di Supabase SQL Editor

-- Contoh penggunaan template metadata dalam pesan
-- Pastikan campaign ID disesuaikan dengan data yang ada di database Anda

-- Contoh 1: Pesan sambutan dengan nama kontak
UPDATE "public"."drip_messages"
SET "message" = 'Halo {{contact_name}}, terima kasih telah bergabung dengan kampanye ini!'
WHERE "message_order" = 1 AND "type" = 'text'
LIMIT 5; -- Batasi jumlah row yang diupdate untuk keamanan

-- Contoh 2: Pesan dengan detail kontak
UPDATE "public"."drip_messages"
SET "message" = 'Informasi kontak kami telah mencatat:
- Nama: {{contact_name}}
- Profesi: {{profession}}
- Perusahaan: {{company}}

Silakan konfirmasi jika ada perubahan.'
WHERE "message_order" = 2 AND "type" = 'text'
LIMIT 5;

-- Contoh 3: Template untuk caption media
UPDATE "public"."drip_messages"
SET "caption" = 'Halo {{contact_name}}, berikut adalah materi yang Anda minta.'
WHERE "type" IN ('image', 'document', 'video') AND "caption" IS NOT NULL
LIMIT 5;

-- Log migrasi
INSERT INTO "public"."migration_logs" ("description", "executed_at")
VALUES ('Memperbarui pesan drip campaign dengan template metadata', NOW()); 