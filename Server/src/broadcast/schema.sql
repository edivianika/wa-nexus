-- Drop existing tables if they exist
DROP TABLE IF EXISTS broadcast_messages;
DROP TABLE IF EXISTS broadcast_jobs;

-- Create broadcast_jobs table
CREATE TABLE IF NOT EXISTS broadcast_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    connection_id TEXT,
    type TEXT NOT NULL DEFAULT 'text',
    template_name TEXT,
    variables JSONB,
    contacts TEXT[] DEFAULT '{}',
    message TEXT,
    media_url TEXT,
    caption TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER DEFAULT 0,
    total_contacts INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    schedule TIMESTAMP WITH TIME ZONE,
    speed TEXT DEFAULT 'normal',
    is_group BOOLEAN DEFAULT false,
    group_tag TEXT,
    broadcast_name TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create broadcast_messages table with correct columns
CREATE TABLE IF NOT EXISTS broadcast_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID REFERENCES broadcast_jobs(id) ON DELETE CASCADE,
    contact TEXT NOT NULL,
    message TEXT,
    type TEXT DEFAULT 'text',
    media_url TEXT,
    caption TEXT,
    status TEXT DEFAULT 'pending',
    message_id TEXT,
    error TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create broadcast_contacts table
CREATE TABLE IF NOT EXISTS broadcast_contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    connection_id TEXT NOT NULL,
    contact TEXT NOT NULL,
    group_tag TEXT,
    is_blacklisted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(connection_id, contact)
);

-- Create broadcast_templates table
CREATE TABLE IF NOT EXISTS broadcast_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    connection_id TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    media_url TEXT,
    caption TEXT,
    variables JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(connection_id, name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_connection_id ON broadcast_jobs(connection_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_status ON broadcast_jobs(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_schedule ON broadcast_jobs(schedule);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_job_id ON broadcast_messages(job_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_contact ON broadcast_messages(contact);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_status ON broadcast_messages(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_message_id ON broadcast_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_contacts_connection_id ON broadcast_contacts(connection_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_contacts_group_tag ON broadcast_contacts(group_tag);
CREATE INDEX IF NOT EXISTS idx_broadcast_contacts_blacklist ON broadcast_contacts(is_blacklisted);
CREATE INDEX IF NOT EXISTS idx_broadcast_templates_connection_id ON broadcast_templates(connection_id);

-- Add RLS policies
ALTER TABLE broadcast_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for authenticated users" ON broadcast_jobs
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON broadcast_jobs
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON broadcast_jobs
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for authenticated users" ON broadcast_messages
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON broadcast_messages
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON broadcast_messages
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for authenticated users" ON broadcast_contacts
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON broadcast_contacts
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON broadcast_contacts
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for authenticated users" ON broadcast_templates
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON broadcast_templates
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON broadcast_templates
    FOR UPDATE USING (auth.role() = 'authenticated'); 