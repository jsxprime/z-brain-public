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

      const stats = statsResult.rows[0];

      return reply.code(200).send({
        status: 'ok',
        service: 'memory-synthesizer',
        database: { connected: true, time: dbResult.rows[0].time },
        queue: {
          pending: parseInt(stats.pending, 10),
          processing: parseInt(stats.processing, 10),
          completed: parseInt(stats.completed, 10),
          failed: parseInt(stats.failed, 10),
          quarantined: parseInt(stats.quarantined, 10),
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
