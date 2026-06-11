/**
 * Health check endpoints for the Memory Synthesizer.
 *
 * GET /health — simple liveness probe (returns 200 OK)
 * GET /health/detailed — readiness probe with DB check + queue stats
 */

/**
 * Register health check routes.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {import('pg').Pool} pool
 */
export function registerHealthRoutes(app, pool) {
  // Liveness: is the process running?
  app.get('/health', async (_request, reply) => {
    return reply.code(200).send({ status: 'ok', service: 'memory-synthesizer' });
  });

  // Readiness: can it actually do work?
  app.get('/health/detailed', async (_request, reply) => {
    try {
      // Check Postgres connectivity
      const dbResult = await pool.query('SELECT NOW() AS time');

      // Get queue stats
      const statsResult = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'processing') AS processing,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed,
          COUNT(*) FILTER (WHERE status = 'quarantined') AS quarantined
        FROM events
      `);

      // Freshness: when was the last event received and processed?
      const freshnessResult = await pool.query(`
        SELECT
          MAX(processed_at) FILTER (WHERE status = 'completed') AS last_processed,
          MAX(created_at) AS last_received,
          EXTRACT(EPOCH FROM (NOW() - MAX(processed_at) FILTER (WHERE status = 'completed'))) AS seconds_since_last_process,
          EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) AS seconds_since_last_event
        FROM events
      `);

      const stats = statsResult.rows[0];
      const freshness = freshnessResult.rows[0];
      const STALE_THRESHOLD_HOURS = 6;
      const secondsSinceProcess = parseFloat(freshness.seconds_since_last_process) || null;
      const isStale = secondsSinceProcess !== null && secondsSinceProcess > (STALE_THRESHOLD_HOURS * 3600);

      return reply.code(200).send({
        status: isStale ? 'stale' : 'ok',
        service: 'memory-synthesizer',
        database: { connected: true, time: dbResult.rows[0].time },
        queue: {
          pending: parseInt(stats.pending, 10),
          processing: parseInt(stats.processing, 10),
          completed: parseInt(stats.completed, 10),
          failed: parseInt(stats.failed, 10),
          quarantined: parseInt(stats.quarantined, 10),
        },
        freshness: {
          lastProcessed: freshness.last_processed,
          lastReceived: freshness.last_received,
          hoursSinceLastProcess: secondsSinceProcess ? Math.round(secondsSinceProcess / 3600 * 10) / 10 : null,
          hoursSinceLastEvent: freshness.seconds_since_last_event ? Math.round(parseFloat(freshness.seconds_since_last_event) / 3600 * 10) / 10 : null,
          staleThresholdHours: STALE_THRESHOLD_HOURS,
          isStale,
        },
      });
    } catch (err) {
      return reply.code(503).send({
        status: 'error',
        service: 'memory-synthesizer',
        error: err.message,
      });
    }
  });
}
