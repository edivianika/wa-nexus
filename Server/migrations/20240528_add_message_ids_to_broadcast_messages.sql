-- Menambahkan kolom message_ids ke tabel broadcast_messages
-- Kolom ini akan menyimpan array JSON dari message_id untuk multiple media

-- Periksa apakah kolom message_ids sudah ada
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'broadcast_messages' 
        AND column_name = 'message_ids'
    ) THEN
        -- Tambahkan kolom message_ids untuk menyimpan multiple message ID
        ALTER TABLE broadcast_messages 
        ADD COLUMN message_ids TEXT DEFAULT NULL;
        
        -- Tambahkan komentar untuk dokumentasi
        COMMENT ON COLUMN broadcast_messages.message_ids IS 'JSON array of message IDs for multiple media messages';
    END IF;
END
$$; 