-- Membuat tabel files untuk menyimpan metadata file yang diupload
CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT NOT NULL,
  mimetype TEXT,
  size BIGINT,
  file_path TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Buat index untuk mempercepat pencarian
CREATE INDEX IF NOT EXISTS files_user_id_idx ON public.files (user_id);
CREATE INDEX IF NOT EXISTS files_agent_id_idx ON public.files (agent_id);

-- Enable Row Level Security
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Buat kebijakan RLS untuk membatasi akses ke file berdasarkan user_id
DO $$
BEGIN
    -- Select policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'files' 
        AND policyname = 'files_select_policy'
    ) THEN
        CREATE POLICY files_select_policy ON public.files
        FOR SELECT TO authenticated
        USING (auth.uid() = user_id);
    END IF;
    
    -- Insert policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'files' 
        AND policyname = 'files_insert_policy'
    ) THEN
        CREATE POLICY files_insert_policy ON public.files
        FOR INSERT TO authenticated
        WITH CHECK (auth.uid() = user_id);
    END IF;
    
    -- Update policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'files' 
        AND policyname = 'files_update_policy'
    ) THEN
        CREATE POLICY files_update_policy ON public.files
        FOR UPDATE TO authenticated
        USING (auth.uid() = user_id);
    END IF;
    
    -- Delete policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'files' 
        AND policyname = 'files_delete_policy'
    ) THEN
        CREATE POLICY files_delete_policy ON public.files
        FOR DELETE TO authenticated
        USING (auth.uid() = user_id);
    END IF;
END
$$;

-- Berikan izin akses ke tabel files
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.files TO authenticated;

-- Membuat fungsi untuk membuat tabel jika belum ada (untuk dijalankan dari kode klien)
CREATE OR REPLACE FUNCTION public.create_files_table_if_not_exists()
RETURNS VOID AS $$
BEGIN
    -- Cek apakah tabel files sudah ada
    IF NOT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'files'
    ) THEN
        -- Buat tabel files
        CREATE TABLE public.files (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            filename TEXT NOT NULL,
            mimetype TEXT,
            size BIGINT,
            file_path TEXT NOT NULL,
            user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
            agent_id UUID REFERENCES public.ai_agents(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        -- Buat index
        CREATE INDEX files_user_id_idx ON public.files (user_id);
        CREATE INDEX files_agent_id_idx ON public.files (agent_id);
        
        -- Enable RLS
        ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
        
        -- Buat policies
        CREATE POLICY files_select_policy ON public.files
            FOR SELECT TO authenticated
            USING (auth.uid() = user_id);
            
        CREATE POLICY files_insert_policy ON public.files
            FOR INSERT TO authenticated
            WITH CHECK (auth.uid() = user_id);
            
        CREATE POLICY files_update_policy ON public.files
            FOR UPDATE TO authenticated
            USING (auth.uid() = user_id);
            
        CREATE POLICY files_delete_policy ON public.files
            FOR DELETE TO authenticated
            USING (auth.uid() = user_id);
            
        -- Berikan izin
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.files TO authenticated;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Tambahkan tabel files ke definisi tipe Database
COMMENT ON TABLE public.files IS 'Tabel untuk menyimpan metadata file yang diupload untuk agen AI'; 