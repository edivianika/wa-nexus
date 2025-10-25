-- Migrasi untuk mengubah struktur tabel broadcast_jobs
-- Mengubah dari media_url, media_fullpath, caption menjadi satu kolom media TEXT

-- Periksa apakah kolom media sudah ada
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'broadcast_jobs' 
        AND column_name = 'media'
    ) THEN
        -- Tambahkan kolom media baru
        ALTER TABLE broadcast_jobs 
        ADD COLUMN media TEXT DEFAULT NULL;
        
        -- Tambahkan komentar untuk dokumentasi
        COMMENT ON COLUMN broadcast_jobs.media IS 'JSON array of media objects with url, fullPath, filename, mimetype, and caption';
        
        -- Migrasi data yang ada ke kolom baru (jika ada)
        -- Ini akan mengubah media_url, media_fullpath, caption menjadi JSON dalam kolom media
        UPDATE broadcast_jobs
        SET media = (
            CASE 
                WHEN media_url IS NOT NULL OR media_fullpath IS NOT NULL THEN
                    json_build_array(
                        json_build_object(
                            'url', media_url,
                            'fullPath', media_fullpath,
                            'caption', caption
                        )
                    )::TEXT
                ELSE NULL
            END
        )
        WHERE type = 'media' AND (media_url IS NOT NULL OR media_fullpath IS NOT NULL);
        
        -- Kita menyimpan kolom lama untuk backward compatibility
        -- tetapi menandainya sebagai deprecated
        COMMENT ON COLUMN broadcast_jobs.media_url IS 'DEPRECATED: Use media column instead';
        COMMENT ON COLUMN broadcast_jobs.media_fullpath IS 'DEPRECATED: Use media column instead';
        COMMENT ON COLUMN broadcast_jobs.caption IS 'DEPRECATED: Use media column instead';
    END IF;
END
$$; 