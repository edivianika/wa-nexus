# Scheduled Messages Feature

## Overview

The Scheduled Messages feature allows users to schedule WhatsApp messages to be sent at specific times to individual contacts. This feature leverages the existing broadcast message infrastructure but is designed for individual contact messaging with scheduling capabilities.

Key features include:
- Schedule messages to be sent at a specific date and time
- Support for recurring messages (daily, weekly, monthly)
- View, edit, and delete scheduled messages
- Track the status of scheduled messages (pending, sent, failed)
- Reuse the existing broadcast worker for efficient message delivery

## Technical Implementation

### Database Structure

The feature uses a new table in the Supabase database:

```sql
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id TEXT NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  caption TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  message_id TEXT,
  error TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern TEXT,
  next_scheduled_at TIMESTAMPTZ,
  media JSON
);
```

### Components

1. **ScheduledMessageDialog** - A React component that provides the user interface for creating, viewing, editing, and deleting scheduled messages.

2. **scheduledMessageWorker.js** - A Node.js worker that runs as a cron job to check for pending scheduled messages and process them.

3. **Database Function** - A Supabase function `get_pending_scheduled_messages()` that retrieves messages that are due to be sent.

### Message Flow

1. User creates a scheduled message through the UI
2. The message is stored in the `scheduled_messages` table with status `pending`
3. The scheduled message worker runs every minute to check for pending messages
4. When a message's scheduled time is reached, the worker:
   - Updates the message status to `processing`
   - Creates a broadcast job using the existing broadcast infrastructure
   - Updates the message status to `sent` or `failed` based on the result
   - For recurring messages, schedules the next occurrence

## Setup Instructions

### 1. Database Migration

Run the following SQL to create the necessary table and functions:

```sql
-- Create scheduled_messages table
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id TEXT NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  caption TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  message_id TEXT,
  error TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern TEXT,
  next_scheduled_at TIMESTAMPTZ,
  media JSON
);

-- Create index for scheduled messages
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status ON public.scheduled_messages(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_scheduled_at ON public.scheduled_messages(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_contact_id ON public.scheduled_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_connection_id ON public.scheduled_messages(connection_id);

-- Create RLS policies
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own scheduled messages
CREATE POLICY scheduled_messages_select_policy ON public.scheduled_messages 
  FOR SELECT USING (created_by = auth.uid());

-- Allow users to insert their own scheduled messages
CREATE POLICY scheduled_messages_insert_policy ON public.scheduled_messages 
  FOR INSERT WITH CHECK (created_by = auth.uid());

-- Allow users to update their own scheduled messages
CREATE POLICY scheduled_messages_update_policy ON public.scheduled_messages 
  FOR UPDATE USING (created_by = auth.uid());

-- Allow users to delete their own scheduled messages
CREATE POLICY scheduled_messages_delete_policy ON public.scheduled_messages 
  FOR DELETE USING (created_by = auth.uid());

-- Create function to get pending scheduled messages
CREATE OR REPLACE FUNCTION public.get_pending_scheduled_messages()
RETURNS SETOF public.scheduled_messages
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM public.scheduled_messages
  WHERE status = 'pending'
  AND scheduled_at <= now()
  ORDER BY scheduled_at ASC;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_pending_scheduled_messages() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_scheduled_messages() TO service_role;
```

### 2. Install Dependencies

Make sure to install the required dependencies:

```bash
npm install node-cron
```

### 3. Start the Worker

The scheduled message worker can be started in several ways:

**Development mode:**
```bash
npm run dev:scheduled
```

**Production mode with PM2:**
```bash
npm run workers:scheduled:start
```

**Start all workers:**
```bash
npm run workers:start
```

## Usage

### Creating a Scheduled Message

1. Navigate to the Contacts page at `/dashboard/contacts`
2. Find the contact you want to message
3. Click the clock icon in the "Scheduled" column
4. In the dialog that opens, click the "Create New" tab
5. Fill in the message details:
   - Select a WhatsApp connection
   - Enter your message
   - Set the date and time
   - Optionally, make it recurring (daily, weekly, monthly)
6. Click "Schedule Message"

### Managing Scheduled Messages

1. Open the Scheduled Messages dialog for a contact
2. In the "View Messages" tab, you can:
   - See all scheduled messages for this contact
   - View the status of each message (pending, sent, failed)
   - Edit messages that haven't been sent yet
   - Delete messages

### Recurring Messages

When creating a scheduled message, you can make it recurring by:
1. Checking the "Recurring Message" checkbox
2. Selecting a recurrence pattern (daily, weekly, monthly)

The system will automatically create the next occurrence after the current message is sent.

## Troubleshooting

### Common Issues

1. **Messages not being sent at the scheduled time**
   - Check if the scheduled message worker is running
   - Verify that the message status is "pending" in the database
   - Ensure the scheduled time is in the correct timezone

2. **Failed messages**
   - Check the error message in the UI
   - Look at the worker logs for more details
   - Verify that the WhatsApp connection is active

3. **Worker not starting**
   - Check if Redis is running
   - Verify that the environment variables are set correctly
   - Look for errors in the console output

## Integration with Broadcast System

The scheduled message feature leverages the existing broadcast system for message delivery. When a scheduled message is due to be sent:

1. The worker creates a broadcast job with a single recipient
2. The job is processed by the broadcast worker
3. The message is sent using the same optimized direct message sending mechanism

This approach ensures consistency in message delivery and allows for reuse of existing infrastructure.

## Future Enhancements

Potential future enhancements for the scheduled messages feature:

1. **Template support** - Allow users to create message templates for quick scheduling
2. **Bulk scheduling** - Schedule the same message to multiple contacts at once
3. **Advanced recurrence patterns** - Support for more complex patterns like "every weekday" or "first Monday of the month"
4. **Message variables** - Support for dynamic content in messages using variables
5. **Media attachments** - Allow scheduling messages with images, videos, or documents 