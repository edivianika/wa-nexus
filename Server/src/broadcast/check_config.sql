-- Check active connections and their agents
SELECT 
    c.id as connection_id,
    c.api_key,
    c.connected,
    c.phone_number,
    a.id as agent_id,
    a.name as agent_name,
    a.agent_url,
    a.settings
FROM connections c
LEFT JOIN ai_agents a ON c.ai_agent_id = a.id
WHERE c.connected = true;

-- Check broadcast jobs status
SELECT 
    bj.id as job_id,
    bj.connection_id,
    bj.status,
    bj.progress,
    bj.total_contacts,
    bj.sent_count,
    bj.failed_count,
    bj.skipped_count,
    bj.created_at,
    bj.completed_at
FROM broadcast_jobs bj
WHERE bj.status IN ('active', 'queued', 'failed')
ORDER BY bj.created_at DESC
LIMIT 5;

-- Check recent broadcast messages
SELECT 
    bm.id as message_id,
    bm.job_id,
    bm.contact,
    bm.status,
    bm.message_id as whatsapp_message_id,
    bm.error,
    bm.sent_at,
    bm.created_at
FROM broadcast_messages bm
WHERE bm.created_at > NOW() - INTERVAL '1 hour'
ORDER BY bm.created_at DESC
LIMIT 10; 