-- System configuration table for the Memory Synthesizer.
-- Stores durable global flags like pause state.
-- Uses a key/value pattern for flexibility.

CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the initial pause state (not paused)
INSERT INTO system_config (key, value)
VALUES ('worker_paused', 'false')
ON CONFLICT (key) DO NOTHING;
