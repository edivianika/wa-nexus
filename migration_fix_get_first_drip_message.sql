-- Migration untuk memperbaiki stored procedure get_first_drip_message
-- agar bisa menangani kasus tidak ada pesan dengan message_order=1

-- Drop fungsi lama
DROP FUNCTION IF EXISTS "public"."get_first_drip_message"(campaign_id_input uuid);

-- Buat ulang fungsi dengan logika yang ditingkatkan
CREATE OR REPLACE FUNCTION "public"."get_first_drip_message"(campaign_id_input uuid)
RETURNS SETOF "public"."drip_messages" 
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

-- Berikan izin pada stored procedure yang baru
GRANT EXECUTE ON FUNCTION "public"."get_first_drip_message"(uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_first_drip_message"(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_first_drip_message"(uuid) TO "service_role"; 