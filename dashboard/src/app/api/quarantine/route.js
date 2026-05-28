import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

/**
 * GET /api/quarantine
 * Quarantined memories awaiting human review.
 */
export async function GET() {
  const pool = getPool();

  try {
    const { rows } = await pool.query(`
      SELECT
        pm.id, pm.memory_type, pm.extracted_content, pm.confidence,
        pm.quarantine_reason, pm.reviewed_by, pm.reviewed_at,
        pm.created_at,
        e.source, e.source_id,
        e.payload->>'stream' AS stream,
        e.payload->>'topic' AS topic,
        e.payload->>'title' AS title,
        e.payload->>'content' AS original_content,
        e.payload->>'sender' AS sender
      FROM processed_memories pm
      JOIN events e ON e.id = pm.event_id
      WHERE pm.quarantined = TRUE AND pm.reviewed_at IS NULL
      ORDER BY pm.created_at DESC
    `);

    return NextResponse.json({ items: rows, count: rows.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
