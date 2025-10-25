-- Migrasi untuk memperbaiki struktur tabel kanban
-- Dibuat pada 30 Juni 2024

-- Periksa apakah tabel kanban_boards ada, jika tidak, buat tabel tersebut
CREATE TABLE IF NOT EXISTS public.kanban_boards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    owner_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Periksa apakah tabel kanban_columns ada, jika tidak, buat tabel tersebut
CREATE TABLE IF NOT EXISTS public.kanban_columns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_id UUID NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    owner_id UUID NOT NULL,
    drip_campaign_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tambahkan kolom kanban_column_id ke tabel contacts jika belum ada
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'contacts' 
        AND column_name = 'kanban_column_id'
    ) THEN
        ALTER TABLE public.contacts
        ADD COLUMN kanban_column_id UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Disable RLS untuk kedua tabel
ALTER TABLE public.kanban_boards DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns DISABLE ROW LEVEL SECURITY;

-- Buat indeks untuk mempercepat pencarian
CREATE INDEX IF NOT EXISTS kanban_boards_owner_idx ON public.kanban_boards(owner_id);
CREATE INDEX IF NOT EXISTS kanban_columns_board_idx ON public.kanban_columns(board_id);
CREATE INDEX IF NOT EXISTS contacts_kanban_column_idx ON public.contacts(kanban_column_id);

-- Tambahkan trigger untuk memperbarui updated_at pada kanban boards
DROP TRIGGER IF EXISTS set_updated_at_on_kanban_boards ON public.kanban_boards;
CREATE TRIGGER set_updated_at_on_kanban_boards
BEFORE UPDATE ON public.kanban_boards
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Tambahkan trigger untuk memperbarui updated_at pada kanban columns
DROP TRIGGER IF EXISTS set_updated_at_on_kanban_columns ON public.kanban_columns;
CREATE TRIGGER set_updated_at_on_kanban_columns
BEFORE UPDATE ON public.kanban_columns
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Pastikan fungsi set_updated_at ada
CREATE OR REPLACE FUNCTION public.set_updated_at() 
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql; 