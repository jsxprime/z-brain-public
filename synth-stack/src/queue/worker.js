import { createHash } from 'node:crypto';
import { extractMemories } from '../extraction/extractor.js';
import { commitToOpenBrain } from '../commit/openbrain.js';

/**
 * Generate a deterministic idempotency key for a memory record.
 * Format: {event_id}:{sha256(content)[:16]}
 */
function idempotencyKey(eventId, content) {
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  return `${eventId}:${hash}`;
}

/**
 * Process a single batch of pending events from the queue.
 *
 * Uses a 3-phase pattern to avoid holding row locks during LLM/HTTP calls:
 *
 *   Phase 1 (Txn #1): Claim batch — SELECT FOR UPDATE SKIP LOCKED,
 *                      SET status = 'processing', COMMIT immediately.
 *
 *   Phase 2 (No txn): Process each event — call LLM, commit to OpenBrain.
 *                      Each event is independent; one failure doesn't affect others.
 *
 *   Phase 3 (Per-event Txn): Record results — INSERT processed_memories,
 *                      UPDATE event status. One transaction per event.
 *
 * @param {import('pg').Pool} pool
 * @param {object} config
 */
export async function processBatch(pool, config) {
  // ── Phase 1: Claim batch ─────────────────────────────────────────────
  const claimClient = await pool.connect();
  let events;

  try {
    await claimClient.query('BEGIN');

    // Check if the worker is paused
    const pauseResult = await claimClient.query(
      `SELECT value FROM system_config WHERE key = 'worker_paused'`
    );
    const isPaused = pauseResult.rows[0]?.value === 'true';

    if (isPaused) {
      await claimClient.query('COMMIT');
      return;
    }

    // Fetch and lock a batch of pending or retriable events
    const { rows } = await claimClient.query(
      `SELECT id, source, source_id, source_url, payload, retry_count
       FROM events
       WHERE status IN ('pending', 'failed') AND retry_count < $1
       ORDER BY created_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [config.worker.maxRetries, config.worker.batchSize]
    );

    events = rows;

    if (events.length === 0) {
      await claimClient.query('COMMIT');
      return;
    }

    // Mark all claimed events as 'processing' — visible immediately after COMMIT
    const ids = events.map((e) => e.id);
    await claimClient.query(
      `UPDATE events SET status = 'processing' WHERE id = ANY($1)`,
      [ids]
    );

    await claimClient.query('COMMIT');
  } catch (claimErr) {
    await claimClient.query('ROLLBACK').catch(() => {});
    throw claimErr;
  } finally {
    claimClient.release();
  }

  // ── Phase 2 + 3: Process each event independently ────────────────────
  for (const event of events) {
    let memories = [];
    let eventError = null;

    // Phase 2: Extract (no transaction — LLM call can take 30+ seconds)
    try {
      memories = await extractMemories(config, {
        source: event.source,
        payload: event.payload,
      });
    } catch (extractErr) {
      eventError = extractErr;
      console.error(`Extraction failed for event ${event.id}:`, extractErr.message);
    }

    // Phase 3: Record results (per-event transaction)
    const recordClient = await pool.connect();
    try {
      await recordClient.query('BEGIN');

      if (eventError) {
        // Extraction failed — mark event as failed, increment retry counter
        await recordClient.query(
          `UPDATE events
           SET status = 'failed',
               retry_count = retry_count + 1,
               error_message = $2
           WHERE id = $1`,
          [event.id, eventError.message]
        );
      } else {
        // Build provenance from event metadata
        const provenance = {
          source: event.source,
          sourceId: event.source_id,
          stream: event.payload?.stream,
          topic: event.payload?.topic,
          path: event.payload?.path,
          title: event.payload?.title,
        };

        // Process each extracted memory
        for (const memory of memories) {
          const idemKey = idempotencyKey(event.id, memory.content);
          const shouldQuarantine = memory.confidence < 0.6;

          // Check idempotency — skip if already committed
          const existing = await recordClient.query(
            `SELECT id, openbrain_committed FROM processed_memories
             WHERE idempotency_key = $1`,
            [idemKey]
          );

          if (existing.rows.length > 0) {
            // Already processed — skip to avoid duplicates
            continue;
          }

          let openbrainThoughtId = null;
          if (!shouldQuarantine) {
            try {
              const result = await commitToOpenBrain(config, memory, provenance);
              openbrainThoughtId = result.thoughtId;
            } catch (commitErr) {
              console.error(`OpenBrain commit failed for event ${event.id}:`, commitErr.message);
              // Don't fail the whole event — just mark this memory as not committed
            }
          }

          await recordClient.query(
            `INSERT INTO processed_memories
               (event_id, memory_type, extracted_content, confidence,
                openbrain_committed, openbrain_thought_id, committed_at,
                quarantined, quarantine_reason, idempotency_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              event.id,
              memory.type,
              memory.content,
              memory.confidence,
              !!openbrainThoughtId,
              openbrainThoughtId,
              openbrainThoughtId ? new Date().toISOString() : null,
              shouldQuarantine,
              shouldQuarantine ? `Low confidence: ${memory.confidence}` : null,
              idemKey,
            ]
          );
        }

        // Mark event as completed
        await recordClient.query(
          `UPDATE events SET status = 'completed', processed_at = NOW() WHERE id = $1`,
          [event.id]
        );
      }

      await recordClient.query('COMMIT');
    } catch (recordErr) {
      await recordClient.query('ROLLBACK').catch(() => {});
      console.error(`Failed to record results for event ${event.id}:`, recordErr.message);

      // Best-effort: mark as failed so it gets retried
      try {
        await pool.query(
          `UPDATE events
           SET status = 'failed',
               retry_count = retry_count + 1,
               error_message = $2
           WHERE id = $1`,
          [event.id, recordErr.message]
        );
      } catch (_) {
        // If even this fails, the event stays in 'processing' and will be
        // picked up as stalled by the next poll (it won't be SKIP LOCKED
        // since the transaction released).
      }
    } finally {
      recordClient.release();
    }
  }
}

/**
 * Start the worker loop. Polls the queue at a configurable interval.
 *
 * @param {import('pg').Pool} pool
 * @param {object} config
 * @returns {{ stop: () => void }} A handle to stop the worker.
 */
export function startWorker(pool, config) {
  let running = true;
  let timeoutId = null;

  async function poll() {
    if (!running) return;

    try {
      await processBatch(pool, config);
    } catch (err) {
      console.error('Worker poll error:', err.message);
    }

    if (running) {
      timeoutId = setTimeout(poll, config.worker.pollIntervalMs);
    }
  }

  // Start the first poll
  poll();

  return {
    stop() {
      running = false;
      if (timeoutId) clearTimeout(timeoutId);
    },
  };
}
