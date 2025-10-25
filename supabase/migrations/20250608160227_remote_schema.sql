SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






CREATE OR REPLACE FUNCTION "public"."add_device_with_subscription_expiry"("device_id" "text", "name" "text", "user_id" "text", "webhook_config" "jsonb", "api_key" "text", "server" "text" DEFAULT 'http://localhost:3000'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_data RECORD;
  subscription_end TIMESTAMP WITH TIME ZONE;
  new_device RECORD;
BEGIN
  -- Ambil data user
  SELECT * INTO user_data 
  FROM auth.users 
  WHERE id = user_id::UUID;
  
  IF user_data IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User tidak ditemukan');
  END IF;
  
  -- Tentukan tanggal berakhir subscription
  IF user_data.raw_app_meta_data->>'user_type' = 'trial' THEN
    subscription_end := (user_data.raw_app_meta_data->>'trial_end_date')::TIMESTAMP WITH TIME ZONE;
  ELSE
    subscription_end := (user_data.raw_app_meta_data->>'subscription_end_date')::TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Jika tidak ada tanggal berakhir, gunakan default 3 hari (bukan 14 hari)
  IF subscription_end IS NULL THEN
    subscription_end := NOW() + INTERVAL '3 day';
  END IF;
  
  -- Insert device baru dengan expired_date yang sama dengan subscription
  INSERT INTO public.connections (
    id, 
    name, 
    user_id, 
    webhook_config, 
    api_key,
    server,
    expired_date,
    connected,
    created_at
  )
  VALUES (
    device_id,
    name,
    user_id,
    webhook_config,
    api_key,
    server,
    subscription_end,
    false,
    NOW()
  )
  RETURNING * INTO new_device;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Device berhasil ditambahkan',
    'data', row_to_json(new_device)
  );
END;
$$;


ALTER FUNCTION "public"."add_device_with_subscription_expiry"("device_id" "text", "name" "text", "user_id" "text", "webhook_config" "jsonb", "api_key" "text", "server" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_device_limit"("user_id" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  device_count INTEGER;
  user_device_limit INTEGER;
BEGIN
  -- Hitung jumlah koneksi saat ini
  SELECT COUNT(*) INTO device_count 
  FROM public.connections 
  WHERE user_id = $1;
  
  -- Dapatkan batas device dari metadata user - konversi TEXT ke UUID untuk mencari di auth.users
  SELECT COALESCE((raw_app_meta_data->>'device_limit')::INTEGER, 1) INTO user_device_limit 
  FROM auth.users 
  WHERE id::UUID = $1::UUID;
  
  -- Kembalikan true jika masih di bawah batas, false jika sudah mencapai batas
  RETURN device_count < user_device_limit;
END;
$_$;


ALTER FUNCTION "public"."check_device_limit"("user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_files_table_if_not_exists"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."create_files_table_if_not_exists"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_message_triggers_on_connection_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  DELETE FROM public.message_triggers WHERE connection_id = OLD.id;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."delete_message_triggers_on_connection_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_message_triggers_save_contact_on_connection_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  DELETE FROM public.message_triggers 
  WHERE connection_id = OLD.id
    AND action->>'type' = 'save_contact';
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."delete_message_triggers_save_contact_on_connection_delete"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."kupons" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "kode" "text" NOT NULL,
    "tipe" "text" NOT NULL,
    "durasi_hari" integer NOT NULL,
    "is_used" boolean DEFAULT false,
    "used_by" "uuid",
    "used_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "device_limit" integer DEFAULT 1
);


ALTER TABLE "public"."kupons" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_kupon"("jumlah" integer, "tipe" "text", "durasi_hari" integer) RETURNS SETOF "public"."kupons"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  i INTEGER;
  new_kupon public.kupons;
  random_string TEXT;
BEGIN
  -- Fungsi ini bisa dibatasi hanya untuk admin dengan menambahkan:
  -- IF NOT (SELECT raw_app_meta_data->>'role' = 'admin' FROM auth.users WHERE id = auth.uid()) THEN
  --   RAISE EXCEPTION 'Hanya admin yang dapat membuat kupon';
  -- END IF;
  
  FOR i IN 1..jumlah LOOP
    -- Generate kode kupon acak (format: XXXX-XXXX-XXXX)
    random_string := 
      upper(encode(gen_random_bytes(2), 'hex')) || '-' ||
      upper(encode(gen_random_bytes(2), 'hex')) || '-' ||
      upper(encode(gen_random_bytes(2), 'hex'));
    
    INSERT INTO public.kupons (kode, tipe, durasi_hari)
    VALUES (random_string, tipe, durasi_hari)
    RETURNING * INTO new_kupon;
    
    RETURN NEXT new_kupon;
  END LOOP;
  
  RETURN;
END;
$$;


ALTER FUNCTION "public"."generate_kupon"("jumlah" integer, "tipe" "text", "durasi_hari" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_kupon"("jumlah" integer, "tipe" "text", "durasi_hari" integer, "device_limit" integer DEFAULT 1) RETURNS SETOF "public"."kupons"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  i INTEGER;
  new_kupon public.kupons;
  random_string TEXT;
BEGIN
  FOR i IN 1..jumlah LOOP
    -- Generate kode kupon acak (format: XXXX-XXXX-XXXX)
    random_string := 
      upper(encode(gen_random_bytes(2), 'hex')) || '-' ||
      upper(encode(gen_random_bytes(2), 'hex')) || '-' ||
      upper(encode(gen_random_bytes(2), 'hex'));
    
    INSERT INTO public.kupons (kode, tipe, durasi_hari, device_limit)
    VALUES (random_string, tipe, durasi_hari, device_limit)
    RETURNING * INTO new_kupon;
    
    RETURN NEXT new_kupon;
  END LOOP;
  
  RETURN;
END;
$$;


ALTER FUNCTION "public"."generate_kupon"("jumlah" integer, "tipe" "text", "durasi_hari" integer, "device_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_uuid_without_hyphens"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.id := replace(uuid_generate_v4()::text, ''-'', '''');
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_uuid_without_hyphens"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_drip_message_by_order"("campaign_id_input" "uuid", "message_order_input" integer) RETURNS TABLE("id" "uuid", "message" "text", "type" "text", "media_url" "text", "caption" "text", "delay" integer, "order" integer)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    dm.id,
    dm.message,
    dm.type,
    dm.media_url,
    dm.caption,
    dm.delay,
    dm."order"
  FROM
    public.drip_messages AS dm
  WHERE
    dm.drip_campaign_id = campaign_id_input
    AND dm."order" = message_order_input
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_drip_message_by_order"("campaign_id_input" "uuid", "message_order_input" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drip_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "drip_campaign_id" "uuid",
    "message" "text" NOT NULL,
    "type" "text" DEFAULT 'text'::"text",
    "media_url" "text",
    "caption" "text",
    "delay" integer NOT NULL,
    "message_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."drip_messages" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_first_drip_message"("campaign_id_input" "uuid") RETURNS SETOF "public"."drip_messages"
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


ALTER FUNCTION "public"."get_first_drip_message"("campaign_id_input" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_subscription_status"() RETURNS "json"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    result JSON;
    user_id UUID := auth.uid();
    active_subscription RECORD;
    trial_connection RECORD;
    messages_limit INT;
    messages_usage INT;
BEGIN
    -- Cek subscription aktif
    SELECT s.id, s.status, s.current_period_ends_at, p.name AS plan_name, p.limits
    INTO active_subscription
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.user_id = user_id AND s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF FOUND THEN
        -- User dengan subscription aktif
        messages_limit := (active_subscription.limits->>'messages_per_period')::INT;
        
        SELECT COALESCE(usage_count, 0)
        INTO messages_usage
        FROM usage_counters
        WHERE usage_counters.user_id = user_id 
          AND feature_key = 'messages_per_period'
          AND period_starts_at = date_trunc('month', NOW());

        result := json_build_object(
            'user_type', 'premium',
            'plan_name', active_subscription.plan_name,
            'end_date', active_subscription.current_period_ends_at,
            'is_active', TRUE,
            'days_remaining', GREATEST(0, (active_subscription.current_period_ends_at::DATE - NOW()::DATE)),
            'messages_limit', messages_limit,
            'messages_usage', messages_usage
        );
    ELSE
        -- Cek koneksi trial
        SELECT id, expired_date
        INTO trial_connection
        FROM connections
        WHERE connections.user_id = user_id AND expired_date > NOW()
        ORDER BY created_at DESC
        LIMIT 1;

        IF FOUND THEN
            -- User dalam masa trial
            messages_limit := 100; -- Set trial limit

            SELECT COALESCE(usage_count, 0)
            INTO messages_usage
            FROM usage_counters
            WHERE usage_counters.user_id = user_id 
              AND feature_key = 'messages_per_period'
              AND period_starts_at = date_trunc('month', NOW());

            result := json_build_object(
                'user_type', 'trial',
                'plan_name', 'Trial',
                'end_date', trial_connection.expired_date,
                'is_active', TRUE,
                'days_remaining', GREATEST(0, (trial_connection.expired_date::DATE - NOW()::DATE)),
                'messages_limit', messages_limit,
                'messages_usage', messages_usage
            );
        ELSE
            -- User tidak punya subscription aktif maupun trial
            result := json_build_object(
                'user_type', 'inactive',
                'plan_name', 'N/A',
                'end_date', NULL,
                'is_active', FALSE,
                'days_remaining', 0,
                'messages_limit', 0,
                'messages_usage', 0
            );
        END IF;
    END IF;

    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_subscription_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Update metadata untuk user baru menjadi trial user
  -- dengan masa aktif 3 hari (bukan 14 hari seperti sebelumnya)
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || 
    jsonb_build_object(
      'user_type', 'trial', 
      'trial_end_date', (NOW() + INTERVAL '3 day')::TEXT,
      'device_limit', 1 -- Default hanya bisa 1 device
    )
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_message_trigger_on_new_connection"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO public.message_triggers (
    connection_id,
    trigger_name,
    status,
    trigger_source,
    action
  ) VALUES (
    NEW.id,
    'Save Contact',
    'active',
    '1',
    '{"type": "save_contact", "label": [], "contact_name": "{{sender_name}}"}'::jsonb
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."insert_message_trigger_on_new_connection"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_count" integer DEFAULT NULL::integer, "filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("id" bigint, "content" "text", "metadata" "jsonb", "similarity" double precision)
    LANGUAGE "plpgsql"
    AS $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;


ALTER FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_count" integer, "filter" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_kupon"("kode_kupon" "text") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  kupon_record RECORD;
  current_user_id UUID;
  current_end_date TIMESTAMP;
  new_end_date TIMESTAMP;
  current_device_limit INTEGER;
  raw_meta JSONB;
  end_date_key TEXT;
BEGIN
  -- Ambil data user saat ini (ganti variabel user_id menjadi current_user_id)
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'User tidak terautentikasi');
  END IF;
  
  -- Cek validitas kupon
  SELECT * INTO kupon_record FROM public.kupons 
  WHERE kode = kode_kupon AND is_used = FALSE;
  
  IF kupon_record IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Kode kupon tidak valid atau sudah digunakan');
  END IF;
  
  -- Dapatkan metadata dan device_limit saat ini
  SELECT raw_app_meta_data, COALESCE((raw_app_meta_data->>'device_limit')::integer, 1) 
  INTO raw_meta, current_device_limit 
  FROM auth.users WHERE id = current_user_id;
  
  -- Tentukan key untuk end_date berdasarkan tipe user
  IF raw_meta->>'user_type' = 'trial' THEN
    end_date_key := 'trial_end_date';
  ELSE
    end_date_key := 'subscription_end_date';
  END IF;
  
  -- Dapatkan tanggal berakhir saat ini
  IF raw_meta->>end_date_key IS NOT NULL THEN
    current_end_date := (raw_meta->>end_date_key)::TIMESTAMP;
  ELSE
    current_end_date := NOW();
  END IF;
  
  -- Hitung tanggal akhir baru dengan akumulasi
  -- Jika tanggal saat ini sudah berlalu, gunakan tanggal sekarang
  IF current_end_date < NOW() THEN
    new_end_date := NOW() + (kupon_record.durasi_hari * INTERVAL '1 day');
  ELSE
    -- Akumulasikan durasi kupon dengan tanggal akhir yang sudah ada
    new_end_date := current_end_date + (kupon_record.durasi_hari * INTERVAL '1 day');
  END IF;
  
  -- Gunakan nilai maksimum antara limit kupon dan limit saat ini
  current_device_limit := GREATEST(current_device_limit, kupon_record.device_limit);
  
  -- Buat objek JSON baru dengan semua nilai yang diperlukan
  raw_meta := raw_meta || jsonb_build_object(
    'user_type', kupon_record.tipe,
    'subscription_end_date', new_end_date::TEXT,
    'device_limit', current_device_limit
  );
  
  -- Update data user dengan objek JSON baru
  UPDATE auth.users
  SET raw_app_meta_data = raw_meta
  WHERE id = current_user_id;
  
  -- Tandai kupon sebagai terpakai
  UPDATE public.kupons
  SET is_used = TRUE, used_by = current_user_id, used_at = NOW()
  WHERE id = kupon_record.id;
  
  -- Update juga expired_date semua device
  -- Menggunakan string literal untuk nilai user_id (tidak referensi variabel langsung)
  UPDATE public.connections
  SET expired_date = new_end_date
  WHERE connections.user_id = current_user_id::text; -- Konversi UUID ke TEXT dengan ::text
  
  RETURN json_build_object(
    'success', true, 
    'message', 'Kupon berhasil digunakan. Masa aktif semua perangkat diperpanjang.', 
    'tipe', kupon_record.tipe,
    'device_limit', current_device_limit,
    'berlaku_hingga', new_end_date
  );
END;
$$;


ALTER FUNCTION "public"."redeem_kupon"("kode_kupon" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_contact_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_contact_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_devices_expired_date"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  subscription_end TIMESTAMP WITH TIME ZONE;
  updated_user_id UUID;
  user_id_text TEXT;
BEGIN
  -- Dapatkan user_id dari kupon yang baru digunakan
  updated_user_id := NEW.used_by;
  
  IF updated_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Konversi UUID ke TEXT
  user_id_text := updated_user_id::text;
  
  -- Dapatkan tanggal akhir langganan dari user
  SELECT
    CASE
      WHEN raw_app_meta_data->>'user_type' = 'trial' THEN (raw_app_meta_data->>'trial_end_date')::TIMESTAMP WITH TIME ZONE
      ELSE (raw_app_meta_data->>'subscription_end_date')::TIMESTAMP WITH TIME ZONE
    END INTO subscription_end
  FROM auth.users
  WHERE id = updated_user_id;
  
  IF subscription_end IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Update semua device milik user tersebut dengan expired_date yang baru
  -- Gunakan variabel lokal untuk menghindari konflik
  UPDATE public.connections
  SET expired_date = subscription_end
  WHERE connections.user_id = user_id_text;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_devices_expired_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_agents" (
    "id" "text" DEFAULT "replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text") NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "settings" "jsonb" DEFAULT '{"behaviour": "", "knowledge": "", "more_settings": {"multi_bubble_chat": false, "humanlike_behaviour": true, "stop_ai_if_cs_replied": true}}'::"jsonb",
    "agent_url" "text" DEFAULT 'http://localhost:5678/webhook/agenchat'::"text"
);


ALTER TABLE "public"."ai_agents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."broadcast_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "connection_id" "text" NOT NULL,
    "contact" "text" NOT NULL,
    "group_tag" "text",
    "is_blacklisted" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."broadcast_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."broadcast_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "connection_id" "text",
    "type" "text" DEFAULT 'text'::"text" NOT NULL,
    "template_name" "text",
    "variables" "jsonb",
    "contacts" "text"[] DEFAULT '{}'::"text"[],
    "message" "text",
    "media_url" "text",
    "caption" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "progress" integer DEFAULT 0,
    "total_contacts" integer DEFAULT 0,
    "sent_count" integer DEFAULT 0,
    "failed_count" integer DEFAULT 0,
    "skipped_count" integer DEFAULT 0,
    "schedule" timestamp with time zone,
    "speed" "text" DEFAULT 'normal'::"text",
    "is_group" boolean DEFAULT false,
    "group_tag" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "completed_at" timestamp with time zone,
    "user_id" "uuid",
    "isprivatemessage" boolean DEFAULT false,
    "contact_id" "text",
    "broadcast_name" "text"
);


ALTER TABLE "public"."broadcast_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."broadcast_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid",
    "contact" "text" NOT NULL,
    "message" "text",
    "type" "text" DEFAULT 'text'::"text",
    "media_url" "text",
    "caption" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "message_id" "text",
    "error" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "data" "jsonb",
    "message_ids" "text"[]
);


ALTER TABLE "public"."broadcast_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."broadcast_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "connection_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "content" "text" NOT NULL,
    "type" "text" DEFAULT 'text'::"text",
    "media_url" "text",
    "caption" "text",
    "variables" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."broadcast_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."connections" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "connected" boolean DEFAULT false,
    "qr" "text",
    "phone_number" "text",
    "webhook_config" "jsonb",
    "knowledge_base" "text",
    "system_message" "text",
    "user_id" "text",
    "api_key" character varying(255) DEFAULT ('wha_'::"text" || "substr"("md5"(("random"())::"text"), 1, 20)) NOT NULL,
    "expired_date" timestamp with time zone DEFAULT ("now"() + '2 days'::interval),
    "server" "text" DEFAULT '''''''http://localhost:80''''::text''::text'::"text",
    "status" "text",
    "ai_agent_id" "text"
);


ALTER TABLE "public"."connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" bigint NOT NULL,
    "owner_id" "uuid",
    "phone_number" character varying(20) NOT NULL,
    "contact_name" character varying(100),
    "email" character varying(100),
    "labels" "text"[] DEFAULT ARRAY[]::"text"[],
    "is_blocked" boolean DEFAULT false,
    "is_favorite" boolean DEFAULT false,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "agent_id" "text"
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."contacts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."contacts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."contacts_id_seq" OWNED BY "public"."contacts"."id";



CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" bigint NOT NULL,
    "content" "text",
    "metadata" "jsonb",
    "embedding" "public"."vector"(1536),
    "agent_id" "text"
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."documents_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."documents_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."documents_id_seq" OWNED BY "public"."documents"."id";



CREATE TABLE IF NOT EXISTS "public"."drip_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "segment_id" "uuid",
    "connection_id" "text",
    "status" "text" DEFAULT 'Draft'::"text"
);


ALTER TABLE "public"."drip_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drip_contact_segments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."drip_contact_segments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drip_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "drip_campaign_id" "uuid",
    "drip_message_id" "uuid",
    "contact_id" "text" NOT NULL,
    "status" "text" DEFAULT 'sent'::"text",
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "message_content" "text",
    "error_message" "text",
    "drip_subscriber_id" "uuid"
);


ALTER TABLE "public"."drip_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drip_segment_contacts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "segment_id" "uuid" NOT NULL,
    "contact_number" "text" NOT NULL,
    "contact_name" "text",
    "added_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."drip_segment_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drip_subscribers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "drip_campaign_id" "uuid",
    "contact_id" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "last_message_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_message_order_sent" integer,
    "connection_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."drip_subscribers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."drip_subscribers"."metadata" IS 'Metadata fleksibel dalam format JSON untuk menyimpan informasi tambahan subscriber';



CREATE TABLE IF NOT EXISTS "public"."files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "original_filename" "text",
    "mimetype" "text",
    "size" bigint DEFAULT 0,
    "file_path" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'Ready'::"text"
);


ALTER TABLE "public"."files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_triggers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "connection_id" "text",
    "trigger_name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "keyword" "jsonb",
    "action" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "trigger_source" "text" DEFAULT 'Messages from Customers'::"text"
);


ALTER TABLE "public"."message_triggers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."n8n_chat_histories" (
    "id" integer NOT NULL,
    "session_id" character varying(255) NOT NULL,
    "message" "jsonb" NOT NULL
);


ALTER TABLE "public"."n8n_chat_histories" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."n8n_chat_histories_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."n8n_chat_histories_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."n8n_chat_histories_id_seq" OWNED BY "public"."n8n_chat_histories"."id";



CREATE TABLE IF NOT EXISTS "public"."produk" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "nama" "text" NOT NULL,
    "deskripsi" "text",
    "harga" integer,
    "kategori" "text",
    "stok" integer,
    "image_urls" "jsonb",
    "fitur" "text"[],
    "spesifikasi" "jsonb",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."produk" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."produk_vector" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "produk_id" "uuid",
    "content" "text" NOT NULL,
    "embedding" "public"."vector"(1536),
    "metadata" "jsonb",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."produk_vector" OWNER TO "postgres";


ALTER TABLE ONLY "public"."contacts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."contacts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."documents" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."documents_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."n8n_chat_histories" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."n8n_chat_histories_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ai_agents"
    ADD CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."broadcast_contacts"
    ADD CONSTRAINT "broadcast_contacts_connection_id_contact_key" UNIQUE ("connection_id", "contact");



ALTER TABLE ONLY "public"."broadcast_contacts"
    ADD CONSTRAINT "broadcast_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."broadcast_jobs"
    ADD CONSTRAINT "broadcast_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."broadcast_messages"
    ADD CONSTRAINT "broadcast_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."broadcast_templates"
    ADD CONSTRAINT "broadcast_templates_connection_id_name_key" UNIQUE ("connection_id", "name");



ALTER TABLE ONLY "public"."broadcast_templates"
    ADD CONSTRAINT "broadcast_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."connections"
    ADD CONSTRAINT "connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_owner_id_phone_number_key" UNIQUE ("owner_id", "phone_number");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drip_campaigns"
    ADD CONSTRAINT "drip_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drip_contact_segments"
    ADD CONSTRAINT "drip_contact_segments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drip_logs"
    ADD CONSTRAINT "drip_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drip_messages"
    ADD CONSTRAINT "drip_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drip_segment_contacts"
    ADD CONSTRAINT "drip_segment_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drip_subscribers"
    ADD CONSTRAINT "drip_subscribers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kupons"
    ADD CONSTRAINT "kupons_kode_key" UNIQUE ("kode");



ALTER TABLE ONLY "public"."kupons"
    ADD CONSTRAINT "kupons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_triggers"
    ADD CONSTRAINT "message_triggers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."n8n_chat_histories"
    ADD CONSTRAINT "n8n_chat_histories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."produk"
    ADD CONSTRAINT "produk_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."produk_vector"
    ADD CONSTRAINT "produk_vector_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drip_segment_contacts"
    ADD CONSTRAINT "uq_segment_contact" UNIQUE ("segment_id", "contact_number");



CREATE INDEX "ai_agents_created_at_idx" ON "public"."ai_agents" USING "btree" ("created_at");



CREATE INDEX "ai_agents_user_id_idx" ON "public"."ai_agents" USING "btree" ("user_id");



CREATE INDEX "files_agent_id_idx" ON "public"."files" USING "btree" ("agent_id");



CREATE INDEX "files_user_id_idx" ON "public"."files" USING "btree" ("user_id");



CREATE INDEX "idx_broadcast_contacts_blacklist" ON "public"."broadcast_contacts" USING "btree" ("is_blacklisted");



CREATE INDEX "idx_broadcast_contacts_connection_id" ON "public"."broadcast_contacts" USING "btree" ("connection_id");



CREATE INDEX "idx_broadcast_contacts_group_tag" ON "public"."broadcast_contacts" USING "btree" ("group_tag");



CREATE INDEX "idx_broadcast_jobs_connection_id" ON "public"."broadcast_jobs" USING "btree" ("connection_id");



COMMENT ON INDEX "public"."idx_broadcast_jobs_connection_id" IS 'Speeds up fetching jobs for a specific WhatsApp connection.';



CREATE INDEX "idx_broadcast_jobs_schedule" ON "public"."broadcast_jobs" USING "btree" ("schedule");



CREATE INDEX "idx_broadcast_jobs_status" ON "public"."broadcast_jobs" USING "btree" ("status");



COMMENT ON INDEX "public"."idx_broadcast_jobs_status" IS 'Speeds up filtering jobs by their status (e.g., queued, active, completed).';



CREATE INDEX "idx_broadcast_jobs_user_id" ON "public"."broadcast_jobs" USING "btree" ("user_id");



COMMENT ON INDEX "public"."idx_broadcast_jobs_user_id" IS 'Speeds up fetching jobs created by a specific user.';



CREATE INDEX "idx_broadcast_messages_contact" ON "public"."broadcast_messages" USING "btree" ("contact");



CREATE INDEX "idx_broadcast_messages_job_id" ON "public"."broadcast_messages" USING "btree" ("job_id");



COMMENT ON INDEX "public"."idx_broadcast_messages_job_id" IS 'Improves performance when retrieving all messages for a specific broadcast job.';



CREATE INDEX "idx_broadcast_messages_message_id" ON "public"."broadcast_messages" USING "btree" ("message_id");



CREATE INDEX "idx_broadcast_messages_status" ON "public"."broadcast_messages" USING "btree" ("status");



COMMENT ON INDEX "public"."idx_broadcast_messages_status" IS 'Speeds up filtering messages by their status (e.g., sent, failed).';



CREATE INDEX "idx_broadcast_templates_connection_id" ON "public"."broadcast_templates" USING "btree" ("connection_id");



CREATE INDEX "idx_connections_ai_agent_id" ON "public"."connections" USING "btree" ("ai_agent_id");



COMMENT ON INDEX "public"."idx_connections_ai_agent_id" IS 'Improves performance when fetching agent details for a connection.';



CREATE INDEX "idx_contacts_flags" ON "public"."contacts" USING "btree" ("owner_id", "is_favorite", "is_blocked");



CREATE INDEX "idx_contacts_labels" ON "public"."contacts" USING "gin" ("labels");



CREATE INDEX "idx_contacts_owner" ON "public"."contacts" USING "btree" ("owner_id");



CREATE INDEX "idx_contacts_phone" ON "public"."contacts" USING "btree" ("phone_number");



CREATE INDEX "idx_drip_logs_drip_subscriber_id" ON "public"."drip_logs" USING "btree" ("drip_subscriber_id");



CREATE INDEX "idx_drip_logs_idempotency_check" ON "public"."drip_logs" USING "btree" ("drip_subscriber_id", "drip_message_id", "status");



CREATE INDEX "idx_drip_subscribers_metadata" ON "public"."drip_subscribers" USING "gin" ("metadata");



CREATE INDEX "idx_message_triggers_connection_id" ON "public"."message_triggers" USING "btree" ("connection_id");



CREATE INDEX "produk_vector_embedding_idx" ON "public"."produk_vector" USING "ivfflat" ("embedding" "public"."vector_cosine_ops") WITH ("lists"='100');



CREATE OR REPLACE TRIGGER "DB_Connection_Updated" AFTER DELETE OR UPDATE ON "public"."connections" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://akhivian.app.n8n.cloud/webhook-test/9c193934-7dc5-47b4-b42f-266e7b2f6d63', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "contacts_update_timestamp" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_contact_timestamp"();



CREATE OR REPLACE TRIGGER "trg_delete_message_triggers_on_connections" AFTER DELETE ON "public"."connections" FOR EACH ROW EXECUTE FUNCTION "public"."delete_message_triggers_save_contact_on_connection_delete"();



CREATE OR REPLACE TRIGGER "trg_insert_message_trigger_on_connections" AFTER INSERT ON "public"."connections" FOR EACH ROW EXECUTE FUNCTION "public"."insert_message_trigger_on_new_connection"();



CREATE OR REPLACE TRIGGER "update_devices_after_kupon_use" AFTER UPDATE ON "public"."kupons" FOR EACH ROW WHEN ((("old"."is_used" = false) AND ("new"."is_used" = true))) EXECUTE FUNCTION "public"."update_devices_expired_date"();



ALTER TABLE ONLY "public"."ai_agents"
    ADD CONSTRAINT "ai_agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."broadcast_jobs"
    ADD CONSTRAINT "broadcast_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."broadcast_messages"
    ADD CONSTRAINT "broadcast_messages_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."broadcast_jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connections"
    ADD CONSTRAINT "connections_ai_agent_id_fkey" FOREIGN KEY ("ai_agent_id") REFERENCES "public"."ai_agents"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id");



ALTER TABLE ONLY "public"."drip_campaigns"
    ADD CONSTRAINT "drip_campaigns_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id");



ALTER TABLE ONLY "public"."drip_logs"
    ADD CONSTRAINT "drip_logs_drip_campaign_id_fkey" FOREIGN KEY ("drip_campaign_id") REFERENCES "public"."drip_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drip_logs"
    ADD CONSTRAINT "drip_logs_drip_message_id_fkey" FOREIGN KEY ("drip_message_id") REFERENCES "public"."drip_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drip_messages"
    ADD CONSTRAINT "drip_messages_drip_campaign_id_fkey" FOREIGN KEY ("drip_campaign_id") REFERENCES "public"."drip_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drip_segment_contacts"
    ADD CONSTRAINT "drip_segment_contacts_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "public"."drip_contact_segments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drip_subscribers"
    ADD CONSTRAINT "drip_subscribers_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drip_subscribers"
    ADD CONSTRAINT "drip_subscribers_drip_campaign_id_fkey" FOREIGN KEY ("drip_campaign_id") REFERENCES "public"."drip_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drip_campaigns"
    ADD CONSTRAINT "fk_drip_campaigns_segment_id" FOREIGN KEY ("segment_id") REFERENCES "public"."drip_contact_segments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drip_logs"
    ADD CONSTRAINT "fk_drip_subscriber" FOREIGN KEY ("drip_subscriber_id") REFERENCES "public"."drip_subscribers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kupons"
    ADD CONSTRAINT "kupons_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."message_triggers"
    ADD CONSTRAINT "message_triggers_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."produk"
    ADD CONSTRAINT "produk_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."produk_vector"
    ADD CONSTRAINT "produk_vector_produk_id_fkey" FOREIGN KEY ("produk_id") REFERENCES "public"."produk"("id") ON DELETE CASCADE;



CREATE POLICY "Allow full access" ON "public"."ai_agents" USING (true) WITH CHECK (true);



CREATE POLICY "Enable insert access for authenticated users" ON "public"."broadcast_contacts" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert access for authenticated users" ON "public"."broadcast_jobs" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert access for authenticated users" ON "public"."broadcast_messages" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert access for authenticated users" ON "public"."broadcast_templates" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for authenticated users" ON "public"."broadcast_contacts" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for authenticated users" ON "public"."broadcast_jobs" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for authenticated users" ON "public"."broadcast_messages" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for authenticated users" ON "public"."broadcast_templates" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable update access for authenticated users" ON "public"."broadcast_contacts" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable update access for authenticated users" ON "public"."broadcast_jobs" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable update access for authenticated users" ON "public"."broadcast_messages" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable update access for authenticated users" ON "public"."broadcast_templates" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."ai_agents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_agents_delete_policy" ON "public"."ai_agents" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "ai_agents_insert_policy" ON "public"."ai_agents" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "ai_agents_select_policy" ON "public"."ai_agents" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "ai_agents_update_policy" ON "public"."ai_agents" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."broadcast_contacts" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";




















































































































































































GRANT ALL ON FUNCTION "public"."add_device_with_subscription_expiry"("device_id" "text", "name" "text", "user_id" "text", "webhook_config" "jsonb", "api_key" "text", "server" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_device_with_subscription_expiry"("device_id" "text", "name" "text", "user_id" "text", "webhook_config" "jsonb", "api_key" "text", "server" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_device_with_subscription_expiry"("device_id" "text", "name" "text", "user_id" "text", "webhook_config" "jsonb", "api_key" "text", "server" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_device_limit"("user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_device_limit"("user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_device_limit"("user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_files_table_if_not_exists"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_files_table_if_not_exists"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_files_table_if_not_exists"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_message_triggers_on_connection_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_message_triggers_on_connection_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_message_triggers_on_connection_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_message_triggers_save_contact_on_connection_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_message_triggers_save_contact_on_connection_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_message_triggers_save_contact_on_connection_delete"() TO "service_role";



GRANT ALL ON TABLE "public"."kupons" TO "anon";
GRANT ALL ON TABLE "public"."kupons" TO "authenticated";
GRANT ALL ON TABLE "public"."kupons" TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_kupon"("jumlah" integer, "tipe" "text", "durasi_hari" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_kupon"("jumlah" integer, "tipe" "text", "durasi_hari" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_kupon"("jumlah" integer, "tipe" "text", "durasi_hari" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_kupon"("jumlah" integer, "tipe" "text", "durasi_hari" integer, "device_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_kupon"("jumlah" integer, "tipe" "text", "durasi_hari" integer, "device_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_kupon"("jumlah" integer, "tipe" "text", "durasi_hari" integer, "device_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_uuid_without_hyphens"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_uuid_without_hyphens"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_uuid_without_hyphens"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_drip_message_by_order"("campaign_id_input" "uuid", "message_order_input" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_drip_message_by_order"("campaign_id_input" "uuid", "message_order_input" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_drip_message_by_order"("campaign_id_input" "uuid", "message_order_input" integer) TO "service_role";



GRANT ALL ON TABLE "public"."drip_messages" TO "anon";
GRANT ALL ON TABLE "public"."drip_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."drip_messages" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_first_drip_message"("campaign_id_input" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_first_drip_message"("campaign_id_input" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_first_drip_message"("campaign_id_input" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_subscription_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_subscription_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_subscription_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_message_trigger_on_new_connection"() TO "anon";
GRANT ALL ON FUNCTION "public"."insert_message_trigger_on_new_connection"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_message_trigger_on_new_connection"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_count" integer, "filter" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_count" integer, "filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_count" integer, "filter" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."redeem_kupon"("kode_kupon" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."redeem_kupon"("kode_kupon" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_kupon"("kode_kupon" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_contact_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_contact_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_contact_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_devices_expired_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_devices_expired_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_devices_expired_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";


















GRANT ALL ON TABLE "public"."ai_agents" TO "anon";
GRANT ALL ON TABLE "public"."ai_agents" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_agents" TO "service_role";



GRANT ALL ON TABLE "public"."broadcast_contacts" TO "anon";
GRANT ALL ON TABLE "public"."broadcast_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."broadcast_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."broadcast_jobs" TO "anon";
GRANT ALL ON TABLE "public"."broadcast_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."broadcast_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."broadcast_messages" TO "anon";
GRANT ALL ON TABLE "public"."broadcast_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."broadcast_messages" TO "service_role";



GRANT ALL ON TABLE "public"."broadcast_templates" TO "anon";
GRANT ALL ON TABLE "public"."broadcast_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."broadcast_templates" TO "service_role";



GRANT ALL ON TABLE "public"."connections" TO "anon";
GRANT ALL ON TABLE "public"."connections" TO "authenticated";
GRANT ALL ON TABLE "public"."connections" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contacts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contacts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contacts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."documents_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."documents_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."documents_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."drip_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."drip_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."drip_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."drip_contact_segments" TO "anon";
GRANT ALL ON TABLE "public"."drip_contact_segments" TO "authenticated";
GRANT ALL ON TABLE "public"."drip_contact_segments" TO "service_role";



GRANT ALL ON TABLE "public"."drip_logs" TO "anon";
GRANT ALL ON TABLE "public"."drip_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."drip_logs" TO "service_role";



GRANT ALL ON TABLE "public"."drip_segment_contacts" TO "anon";
GRANT ALL ON TABLE "public"."drip_segment_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."drip_segment_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."drip_subscribers" TO "anon";
GRANT ALL ON TABLE "public"."drip_subscribers" TO "authenticated";
GRANT ALL ON TABLE "public"."drip_subscribers" TO "service_role";



GRANT ALL ON TABLE "public"."files" TO "anon";
GRANT ALL ON TABLE "public"."files" TO "authenticated";
GRANT ALL ON TABLE "public"."files" TO "service_role";



GRANT ALL ON TABLE "public"."message_triggers" TO "anon";
GRANT ALL ON TABLE "public"."message_triggers" TO "authenticated";
GRANT ALL ON TABLE "public"."message_triggers" TO "service_role";



GRANT ALL ON TABLE "public"."n8n_chat_histories" TO "anon";
GRANT ALL ON TABLE "public"."n8n_chat_histories" TO "authenticated";
GRANT ALL ON TABLE "public"."n8n_chat_histories" TO "service_role";



GRANT ALL ON SEQUENCE "public"."n8n_chat_histories_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."n8n_chat_histories_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."n8n_chat_histories_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."produk" TO "anon";
GRANT ALL ON TABLE "public"."produk" TO "authenticated";
GRANT ALL ON TABLE "public"."produk" TO "service_role";



GRANT ALL ON TABLE "public"."produk_vector" TO "anon";
GRANT ALL ON TABLE "public"."produk_vector" TO "authenticated";
GRANT ALL ON TABLE "public"."produk_vector" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
