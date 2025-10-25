-- Add scheduled_in_queue column to scheduled_messages table
ALTER TABLE scheduled_messages
ADD COLUMN IF NOT EXISTS scheduled_in_queue BOOLEAN DEFAULT NULL;

-- Add comment to explain the purpose of the column
COMMENT ON COLUMN scheduled_messages.scheduled_in_queue IS 'Flag to track if message has been scheduled in BullMQ queue';

-- Update existing records to set scheduled_in_queue to false
UPDATE scheduled_messages 
SET scheduled_in_queue = false 
WHERE status = 'pending'; 