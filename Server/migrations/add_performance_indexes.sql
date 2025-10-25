-- Migration to add performance indexes to frequently queried columns.
-- This improves query performance for filtering and joining operations.

-- Index for foreign key on connections table
CREATE INDEX IF NOT EXISTS idx_connections_ai_agent_id ON public.connections (ai_agent_id);

-- Indexes for broadcast_jobs table
CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_status ON public.broadcast_jobs (status);
CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_user_id ON public.broadcast_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_connection_id ON public.broadcast_jobs (connection_id);

-- Indexes for broadcast_messages table
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_job_id ON public.broadcast_messages (job_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_status ON public.broadcast_messages (status);

COMMENT ON INDEX public.idx_connections_ai_agent_id IS 'Improves performance when fetching agent details for a connection.';
COMMENT ON INDEX public.idx_broadcast_jobs_status IS 'Speeds up filtering jobs by their status (e.g., queued, active, completed).';
COMMENT ON INDEX public.idx_broadcast_jobs_user_id IS 'Speeds up fetching jobs created by a specific user.';
COMMENT ON INDEX public.idx_broadcast_jobs_connection_id IS 'Speeds up fetching jobs for a specific WhatsApp connection.';
COMMENT ON INDEX public.idx_broadcast_messages_job_id IS 'Improves performance when retrieving all messages for a specific broadcast job.';
COMMENT ON INDEX public.idx_broadcast_messages_status IS 'Speeds up filtering messages by their status (e.g., sent, failed).'; 