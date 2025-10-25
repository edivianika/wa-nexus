-- This migration alters the existing function to correctly handle the message_ids type.
-- It converts a JSONB array of texts into a PostgreSQL text[] array.
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
            -- FIXED: Convert JSONB array to text[] before updating.
            message_ids = (
                SELECT array_agg(value)
                FROM jsonb_array_elements_text(update_item->'message_ids')
            ),
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