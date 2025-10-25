-- Fungsi untuk menghitung jumlah drip campaign yang terkait dengan setiap kontak
CREATE OR REPLACE FUNCTION count_contact_drip_campaigns_batch(contact_ids text[])
RETURNS TABLE (
  contact_id text,
  campaign_count bigint
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ds.contact_id,
    COUNT(DISTINCT ds.drip_campaign_id) as campaign_count
  FROM 
    drip_subscribers ds
  JOIN
    drip_campaigns dc ON ds.drip_campaign_id = dc.id
  WHERE 
    ds.contact_id = ANY(contact_ids)
    AND ds.status = 'active'
    AND dc.status IN ('Active', 'ACTIVE', 'active')
  GROUP BY 
    ds.contact_id;
END;
$$;

-- Fungsi untuk mendapatkan detail drip campaign yang terkait dengan kontak tertentu
CREATE OR REPLACE FUNCTION get_contact_drip_campaigns(p_contact_id text)
RETURNS TABLE (
  drip_campaign_id uuid,
  campaign_name text,
  status text,
  last_message_order integer,
  last_message_sent_at timestamptz,
  subscribed_at timestamptz
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id as drip_campaign_id,
    dc.name as campaign_name,
    LOWER(dc.status) as status,
    ds.last_message_order_sent as last_message_order,
    ds.last_message_sent_at,
    ds.created_at as subscribed_at
  FROM 
    drip_subscribers ds
  JOIN 
    drip_campaigns dc ON ds.drip_campaign_id = dc.id
  WHERE 
    ds.contact_id = p_contact_id
  ORDER BY 
    ds.created_at DESC;
END;
$$; 