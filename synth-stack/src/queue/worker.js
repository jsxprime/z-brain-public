import { extractMemories } from '../extraction/extractor.js';
import { commitToOpenBrain } from '../commit/openbrain.js';

/**
 * Process a single batch of pending events from the queue.
 *
 * Uses SELECT FOR UPDATE SKIP LOCKED to safely support concurrent workers
 * (future-proofing) without row contention.
 *
 * Flow per event:
 *   1. Lock the event row
 *   2. Set status = 'processing'
 *   3. Call LLM extractor
 *   4. For each extracted memory:
 *      a. Insert into processed_memories
 *      b. If confidence >= 0.6: commit to OpenBrain
 *      c. If confidence < 0.6: mark as quarantined
 *   5. Set event status = 'completed' (or 'failed' on error)
 *
 * @param {import('pg').Pool} pool
 * @param {object} config
 */
export async function processBatch(pool, config) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Fetch and lock a batch of pending or retriable events
    const { rows: events } = await client.query(
      `SELECT id, source, source_id, source_url, payload, retry_count
       FROM events
       WHERE status IN ('pending', 'failed') AND retry_count < $1
       ORDER BY created_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [config.worker.maxRetries, config.worker.batchSize]
    );

    if (events.length === 0) {
      await client.query('COMMIT');
      return;
    }

    for (const event of events) {
      try {
        // Mark as processing
        await client.query(
          `UPDATE events SET status = 'processing' WHERE id = $1`,
          [event.id]
        );

        // Extract memories via LLM
        const memories = await extractMemories(config, {
          source: event.source,
          payload: event.payload,
        });

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
          const shouldQuarantine = memory.confidence < 0.6;

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

          await client.query(
            `INSERT INTO processed_memories
               (event_id, memory_type, extracted_content, confidence,
                openbrain_committed, openbrain_thought_id, committed_at,
                quarantined, quarantine_reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
            ]
          );
        }

        // Mark event as completed
        await client.query(
          `UPDATE events SET status = 'completed', processed_at = NOW() WHERE id = $1`,
          [event.id]
        );
      } catch (eventErr) {
        console.error(`Failed to process event ${event.id}:`, eventErr.message);

        // Mark as failed, increment retry counter
        await client.query(
          `UPDATE events
           SET status = 'failed',
               retry_count = retry_count + 1,
               error_message = $2
           WHERE id = $1`,
          [event.id, eventErr.message]
        );
      }
    }

    await client.query('COMMIT');
  } catch (batchErr) {
    await client.query('ROLLBACK');
    console.error('Batch processing failed:', batchErr.message);
    throw batchErr;
  } finally {
    client.release();
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
