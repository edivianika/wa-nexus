-- Add asset_id column to scheduled_messages table to track assets used in scheduled messages
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS asset_id UUID;

-- Add foreign key constraint to link to asset_library table
ALTER TABLE scheduled_messages 
ADD CONSTRAINT fk_scheduled_message_asset 
FOREIGN KEY (asset_id) 
REFERENCES asset_library(id) 
ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_asset_id ON scheduled_messages(asset_id);

-- Update documentation comment for the table
COMMENT ON TABLE scheduled_messages IS 'Stores scheduled messages with optional asset references'; 