-- Migration to add drip_subscriber_id to drip_logs table

-- Step 1: Add the new column to the drip_logs table.
-- This column will store the foreign key to the drip_subscribers table.
ALTER TABLE public.drip_logs
ADD COLUMN drip_subscriber_id UUID;

-- Step 2: Create a foreign key constraint.
-- This links drip_logs to drip_subscribers, ensuring that every log entry
-- is associated with a valid subscriber.
-- Using ON DELETE SET NULL means that if a subscriber is deleted, the
-- corresponding log entries will not be deleted but their drip_subscriber_id will be set to NULL.
-- This can be changed to ON DELETE CASCADE if logs should be deleted with the subscriber.
ALTER TABLE public.drip_logs
ADD CONSTRAINT fk_drip_subscriber
FOREIGN KEY (drip_subscriber_id)
REFERENCES public.drip_subscribers(id)
ON DELETE SET NULL;

-- Step 3: Create an index on the new column.
-- This will improve the performance of queries that filter or join on drip_subscriber_id.
CREATE INDEX idx_drip_logs_drip_subscriber_id
ON public.drip_logs(drip_subscriber_id);

-- Optional Step 4: Backfill the new column with existing data.
-- This query attempts to match existing logs to subscribers based on campaign_id and contact_id.
-- This is a best-effort update and might not cover all edge cases if there are
-- duplicate contact_ids within the same campaign.
UPDATE public.drip_logs l
SET drip_subscriber_id = s.id
FROM public.drip_subscribers s
WHERE l.drip_campaign_id = s.drip_campaign_id
  AND l.contact_id = s.contact_id
  AND l.drip_subscriber_id IS NULL; -- Only update logs that haven't been filled yet.

-- Log completion of migration
SELECT 'Migration to add drip_subscriber_id to drip_logs completed successfully.'; 