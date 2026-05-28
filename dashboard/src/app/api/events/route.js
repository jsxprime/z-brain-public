import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

/**
 * GET /api/events?limit=50&status=pending
 * Recent events from the synthesizer queue.
 */
export async function GET(request) {
  const pool = getPool();
  const { searchParams } = new URL(request.url);

  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const status = searchParams.get('status'); // optional filter

  try {
    let query = `
      SELECT
        id, source, source_id, source_url,
        payload->>'stream' AS stream,
        payload->>'topic' AS topic,
        payload->>'title' AS title,
        payload->>'sender' AS sender,
        payload->>'author' AS author,
        status, retry_count, error_message,
        created_at, processed_at
      FROM events
    `;
    const params = [];

    if (status) {
      query += ` WHERE status = $1`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);
    return NextResponse.json({ events: rows });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
