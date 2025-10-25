# Simplified Broadcast Module Database Structure

## Overview

This document provides a simplified database structure for the WhatsApp Broadcast Module, focusing on the core functionality:
- Scheduling broadcasts
- Tracking broadcast history
- Managing contacts and blacklists
- Monitoring message status

## Core Database Tables

### 1. broadcast_jobs

Central table for tracking broadcast jobs and schedules.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key, unique identifier for the job |
| connection_id | text | ID of the WhatsApp connection |
| message | text | The message content (can include template variables) |
| type | text | Message type: 'text' or 'media' |
| media_url | text | URL of media (if type is 'media') |
| schedule | timestamptz | Scheduled time for the broadcast |
| speed | text | Sending speed: 'fast', 'normal', 'slow' |
| status | text | Job status: 'queued', 'active', 'completed', 'failed' |
| progress | integer | Progress percentage (0-100) |
| total_contacts | integer | Total number of contacts in the job |
| sent_count | integer | Number of messages successfully sent |
| failed_count | integer | Number of messages that failed to send |
| broadcast_name | text | (Optional) Name/label for the broadcast job |
| created_at | timestamptz | Time when the job was created |
| completed_at | timestamptz | Time when the job was completed |

### 2. broadcast_messages

Tracks individual message status for each contact in a broadcast job.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| job_id | uuid | Foreign key to broadcast_jobs.id |
| contact | text | Recipient phone number |
| status | text | Message status: 'sent', 'failed', 'waiting', 'skipped' |
| message_id | text | WhatsApp message ID (if sent) |
| error | text | Error message (if failed) |
| created_at | timestamptz | Time when the record was created |

### 3. broadcast_contacts

Stores contacts for broadcast.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| connection_id | text | ID of the WhatsApp connection |
| contact | text | Contact phone number |
| is_blacklisted | boolean | Whether the contact is blacklisted |
| created_at | timestamptz | Time when the contact was added |

## SQL Migration

```sql
-- Create broadcast_jobs table
CREATE TABLE broadcast_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    connection_id TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text',
    media_url TEXT,
    schedule TIMESTAMPTZ,
    speed TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0,
    total_contacts INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    broadcast_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Create indexes for broadcast_jobs
CREATE INDEX idx_broadcast_jobs_connection_id ON broadcast_jobs(connection_id);
CREATE INDEX idx_broadcast_jobs_status ON broadcast_jobs(status);
CREATE INDEX idx_broadcast_jobs_schedule ON broadcast_jobs(schedule);

-- Create broadcast_messages table
CREATE TABLE broadcast_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES broadcast_jobs(id) ON DELETE CASCADE,
    contact TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    message_id TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for broadcast_messages
CREATE INDEX idx_broadcast_messages_job_id ON broadcast_messages(job_id);
CREATE INDEX idx_broadcast_messages_contact ON broadcast_messages(contact);
CREATE INDEX idx_broadcast_messages_status ON broadcast_messages(status);

-- Create broadcast_contacts table
CREATE TABLE broadcast_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    connection_id TEXT NOT NULL,
    contact TEXT NOT NULL,
    is_blacklisted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(connection_id, contact)
);

-- Create indexes for broadcast_contacts
CREATE INDEX idx_broadcast_contacts_connection_id ON broadcast_contacts(connection_id);
CREATE INDEX idx_broadcast_contacts_blacklisted ON broadcast_contacts(is_blacklisted);
```

## Redis Keys (Simplified)

For real-time tracking and queue management:

- `broadcast:queue` - List of queued broadcast jobs
- `broadcast:active` - Set of currently active broadcast jobs
- `broadcast:job:{jobId}` - Hash of job metadata
- `broadcast:status:{jobId}` - Hash of message statuses by contact

## Example Queries

### Get Scheduled Broadcasts

```sql
SELECT * FROM broadcast_jobs 
WHERE status = 'queued' 
AND schedule > NOW() 
ORDER BY schedule ASC;
```

### Get Broadcast History

```sql
SELECT * FROM broadcast_jobs 
WHERE connection_id = 'your_connection_id'
ORDER BY created_at DESC;
```

### Get Message Status Summary

```sql
SELECT 
  status, 
  COUNT(*) as count 
FROM broadcast_messages 
WHERE job_id = 'job_uuid'
GROUP BY status;
```

### Get Failed Messages

```sql
SELECT * FROM broadcast_messages
WHERE job_id = 'job_uuid'
AND status = 'failed';
```

## Integration with Supabase

The broadcast module uses Supabase for data storage and retrieval. Here's a simplified client implementation:

```javascript
// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// Create a new broadcast job
async function createBroadcast(connectionId, message, contacts, schedule = null) {
  const { data, error } = await supabase
    .from('broadcast_jobs')
    .insert([{
      connection_id: connectionId,
      message: message,
      total_contacts: contacts.length,
      schedule: schedule
    }])
    .select();
  
  if (error) throw error;
  
  // Create message entries for each contact
  const messages = contacts.map(contact => ({
    job_id: data[0].id,
    contact: contact
  }));
  
  await supabase.from('broadcast_messages').insert(messages);
  
  return data[0];
}

// Get broadcast history
async function getBroadcastHistory(connectionId) {
  const { data, error } = await supabase
    .from('broadcast_jobs')
    .select('*')
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
}
``` 