-- Memory Synthesizer Schema v1
-- This database is INDEPENDENT from core_brain (OpenBrain/Z-Cortex).
-- It stores raw ingested events and tracks processing state.

-- Track which migrations have been applied
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Raw events ingested from Zulip and Wiki.js webhooks.
-- This is the durable event log / queue.
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Source identification
    source TEXT NOT NULL CHECK (source IN ('zulip', 'wikijs')),
    source_id TEXT NOT NULL,           -- e.g. Zulip message_id or Wiki.js page_id + revision
    source_url TEXT,                   -- Deep link back to original

    -- Raw payload
    payload JSONB NOT NULL,

    -- Queue state
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'quarantined')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,

    -- Deduplication: same source event should not be ingested twice
    UNIQUE (source, source_id)
);

-- Index for the worker's polling query (pending events, oldest first)
CREATE INDEX IF NOT EXISTS idx_events_status_created
    ON events (status, created_at ASC)
    WHERE status IN ('pending', 'failed');

-- Processed memory records — what the synthesizer extracted and committed to OpenBrain.
-- This provides provenance and allows the dashboard to display what was committed.
CREATE TABLE IF NOT EXISTS processed_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

    -- What was extracted
    memory_type TEXT NOT NULL CHECK (memory_type IN ('decision', 'snippet', 'command', 'summary', 'reference')),
    extracted_content TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),

    -- OpenBrain commit tracking
    openbrain_committed BOOLEAN NOT NULL DEFAULT FALSE,
    openbrain_thought_id TEXT,        -- UUID returned by OpenBrain capture
    committed_at TIMESTAMPTZ,

    -- Quarantine support
    quarantined BOOLEAN NOT NULL DEFAULT FALSE,
    quarantine_reason TEXT,
    reviewed_by TEXT,                  -- 'human' or 'auto'
    reviewed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_memories_event
    ON processed_memories (event_id);

CREATE INDEX IF NOT EXISTS idx_processed_memories_quarantined
    ON processed_memories (quarantined)
    WHERE quarantined = TRUE;

-- Cursor tracking for pull-based sources (if we add polling later)
CREATE TABLE IF NOT EXISTS source_cursors (
    source TEXT PRIMARY KEY,
    last_event_id TEXT NOT NULL,
    last_event_timestamp TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
