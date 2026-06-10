-- Migration: Add idempotency key for OpenBrain commit dedup on retry
-- This prevents duplicate commits when a batch is retried after partial completion.

ALTER TABLE processed_memories
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

-- Backfill existing rows with a deterministic key
UPDATE processed_memories
SET idempotency_key = event_id || ':' || left(md5(extracted_content), 16)
WHERE idempotency_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_processed_memories_idempotency
    ON processed_memories (idempotency_key);
