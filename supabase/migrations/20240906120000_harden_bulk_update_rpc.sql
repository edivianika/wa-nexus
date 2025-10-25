-- This migration further improves the function's robustness.
-- It now checks if 'message_ids' is a valid JSON array before processing it,
-- preventing 'cannot extract elements from a scalar' errors when the value is null.
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
            -- FIXED: Only process message_ids if it's a non-null JSON array.
            message_ids = CASE
                              WHEN jsonb_typeof(update_item->'message_ids') = 'array' THEN (
                                  SELECT array_agg(value)
                                  FROM jsonb_array_elements_text(update_item->'message_ids')
                              )
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