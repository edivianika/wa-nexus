-- Migration untuk mengubah nama kolom dari "order" menjadi "message_order" di tabel drip_messages
-- dan memperbarui stored procedure get_first_drip_message

-- 1. Rename kolom pada tabel drip_messages
ALTER TABLE "public"."drip_messages" RENAME COLUMN "order" TO "message_order";

-- 2. Drop stored procedure yang lama
DROP FUNCTION IF EXISTS "public"."get_first_drip_message"(campaign_id_input uuid);

-- 3. Buat kembali stored procedure dengan nama kolom yang baru
CREATE OR REPLACE FUNCTION "public"."get_first_drip_message"(campaign_id_input uuid)
RETURNS SETOF "public"."drip_messages" 
LANGUAGE "plpgsql" 
AS $$
BEGIN
  RETURN QUERY SELECT * FROM "public"."drip_messages" 
    WHERE "drip_campaign_id" = campaign_id_input 
    AND "message_order" = 1 
    LIMIT 1;
END;
$$;

-- 4. Berikan izin pada stored procedure baru
GRANT EXECUTE ON FUNCTION "public"."get_first_drip_message"(uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_first_drip_message"(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_first_drip_message"(uuid) TO "service_role"; 