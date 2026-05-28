import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getOpenBrainStats } from '@/lib/openbrain';
import { getHermesHealth, getSynthHealth } from '@/lib/hermes';

/**
 * GET /api/health
 * Aggregated health of all Z-Brain ecosystem services.
 */
export async function GET() {
  const pool = getPool();

  const checks = {};

  // 1. Dashboard's own database
  try {
    const { rows } = await pool.query('SELECT NOW() AS time');
    checks.database = { status: 'ok', time: rows[0].time };
  } catch (err) {
    checks.database = { status: 'error', error: err.message };
  }

  // 2. External services (parallel)
  const [openbrain, hermes, synth] = await Promise.all([
    getOpenBrainStats(),
    getHermesHealth(),
    getSynthHealth(),
  ]);

  checks.openbrain = { status: openbrain.status === 'ok' ? 'ok' : 'error' };
  checks.hermes = { status: hermes.status === 'online' ? 'ok' : 'error' };
  checks.synthesizer = { status: synth.status === 'online' ? 'ok' : 'error', queue: synth.queue };

  // Overall status
  const allOk = Object.values(checks).every((c) => c.status === 'ok');

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    services: checks,
  });
}
