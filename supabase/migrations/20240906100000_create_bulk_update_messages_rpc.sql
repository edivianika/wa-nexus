-- Fungsi ini menerima sebuah job_id dan array JSON dari pembaruan pesan.
-- Ini akan melakukan iterasi melalui array dan memperbarui setiap pesan dalam satu transaksi.
CREATE OR REPLACE FUNCTION bulk_update_broadcast_messages(
    p_job_id UUID,
    p_updates JSONB
)
RETURNS void AS $$
DECLARE
    update_item JSONB;
BEGIN
    FOR update_item IN (SELECT * FROM jsonb_array_elements(p_updates))
    LOOP
        UPDATE broadcast_messages
        SET
            status = update_item->>'status',
            error = update_item->>'error',
            message_id = update_item->>'message_id',
            -- Pastikan untuk menangani message_ids yang mungkin null atau tidak ada
            message_ids = CASE
                              WHEN update_item ? 'message_ids' THEN (update_item->'message_ids')::JSONB
                              ELSE NULL
                          END,
            sent_at = CASE
                          WHEN (update_item->>'status') = 'sent' THEN NOW()
                          ELSE sent_at
                      END,
            updated_at = NOW()
        WHERE
            job_id = p_job_id AND
            contact = update_item->>'contact';
    END LOOP;
END;
$$ LANGUAGE plpgsql; 