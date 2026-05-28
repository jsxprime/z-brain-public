import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

/**
 * GET /api/memories?limit=50&type=decision
 * Processed and committed memories.
 */
export async function GET(request) {
  const pool = getPool();
  const { searchParams } = new URL(request.url);

  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const type = searchParams.get('type'); // optional: decision, snippet, command, summary, reference

  try {
    let query = `
      SELECT
        pm.id, pm.memory_type, pm.extracted_content, pm.confidence,
        pm.openbrain_committed, pm.openbrain_thought_id,
        pm.quarantined, pm.quarantine_reason,
        pm.reviewed_by, pm.reviewed_at,
        pm.committed_at, pm.created_at,
        e.source, e.source_id,
        e.payload->>'stream' AS stream,
        e.payload->>'topic' AS topic,
        e.payload->>'title' AS title
      FROM processed_memories pm
      JOIN events e ON e.id = pm.event_id
      WHERE pm.quarantined = FALSE
    `;
    const params = [];

    if (type) {
      params.push(type);
      query += ` AND pm.memory_type = $${params.length}`;
    }

    query += ` ORDER BY pm.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);
    return NextResponse.json({ memories: rows });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
