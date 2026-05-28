/**
 * Enqueue a raw event into the durable Postgres event log.
 * Uses ON CONFLICT DO NOTHING to ensure idempotency —
 * the same webhook delivered twice will not create duplicate rows.
 *
 * @param {import('pg').Pool} pool
 * @param {object} event
 * @param {string} event.source - 'zulip' or 'wikijs'
 * @param {string} event.sourceId - Unique ID from the source system
 * @param {string|null} event.sourceUrl - Deep link back to original
 * @param {object} event.payload - Raw webhook payload (stored as JSONB)
 * @returns {Promise<{id: string|null, duplicate: boolean}>}
 */
export async function enqueueEvent(pool, { source, sourceId, sourceUrl, payload }) {
  const result = await pool.query(
    `INSERT INTO events (source, source_id, source_url, payload)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source, source_id) DO NOTHING
     RETURNING id`,
    [source, sourceId, sourceUrl, JSON.stringify(payload)]
  );

  if (result.rowCount === 0) {
    return { id: null, duplicate: true };
  }

  return { id: result.rows[0].id, duplicate: false };
}
