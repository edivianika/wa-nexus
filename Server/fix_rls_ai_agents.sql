-- Nonaktifkan RLS untuk tabel ai_agents
ALTER TABLE public.ai_agents DISABLE ROW LEVEL SECURITY;
-- Hapus policy RLS yang ada (jika ada)
DROP POLICY IF EXISTS "Enable read access for users" ON public.ai_agents;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.ai_agents;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.ai_agents;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.ai_agents;
-- Insert data dari SQL dump (menggunakan ON CONFLICT)
INSERT INTO public.ai_agents (id, name, description, type, status, user_id, created_at, settings, agent_url) VALUES ('24eb6aab-376c-49ef-ba3d-d2beb17dad90', 'test', '', 'customer-service', 'active', '237971ba-dd8b-45b1-9641-92eb7199906a', '2025-04-23 06:09:53.14406+00', '{"behaviour":{"tone":"friendly","greeting":"Halo, saya adalah asisten test. Ada yang bisa saya bantu?","response_time":"quick"},"knowledge":{"sources":[],"custom_data":""},"integration":{"auto_reply":true,"webhook_url":"","notification":true},"more_settings":{"multi_bubble_chat":false,"humanlike_behaviour":true,"stop_ai_if_cs_replied":true}}', 'http://localhost:5678/webhook/agenchatddd') ON CONFLICT (id) DO UPDATE SET agent_url = EXCLUDED.agent_url;
-- Pastikan koneksi terhubung ke agent yang benar
UPDATE public.connections SET ai_agent_id = '24eb6aab-376c-49ef-ba3d-d2beb17dad90' WHERE id = '521ebd3136da518c12228948af4796b6';
-- Buat RLS baru yang lebih permisif
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access" ON public.ai_agents USING (true) WITH CHECK (true);
