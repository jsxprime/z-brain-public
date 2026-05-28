import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getOpenBrainStats } from '@/lib/openbrain';
import { getHermesHealth, getSynthHealth } from '@/lib/hermes';

/**
 * GET /api/stats
 * Aggregated dashboard statistics from all sources.
 */
export async function GET() {
  const pool = getPool();

  try {
    // Queue stats from synth-postgres
    const queueResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'processing') AS processing,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed
      FROM events
    `);

    // Memory stats
    const memoryResult = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE quarantined = TRUE AND reviewed_at IS NULL) AS quarantined_pending,
        COUNT(*) FILTER (WHERE openbrain_committed = TRUE) AS committed
      FROM processed_memories
    `);

    // Source breakdown
    const sourceResult = await pool.query(`
      SELECT source, COUNT(*) AS count
      FROM events
      GROUP BY source
    `);

    // Fetch external service statuses in parallel
    const [openbrain, hermes, synth] = await Promise.all([
      getOpenBrainStats(),
      getHermesHealth(),
      getSynthHealth(),
    ]);

    return NextResponse.json({
      queue: queueResult.rows[0],
      memories: memoryResult.rows[0],
      sources: Object.fromEntries(sourceResult.rows.map((r) => [r.source, parseInt(r.count, 10)])),
      services: {
        openbrain: { status: openbrain.status },
        hermes: { status: hermes.status },
        synthesizer: { status: synth.status },
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
