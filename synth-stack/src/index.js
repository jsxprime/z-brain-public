import Fastify from 'fastify';
import dotenv from 'dotenv';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { registerZulipWebhook } from './webhooks/zulip.js';
import { registerWikiJsWebhook } from './webhooks/wikijs.js';
import { WikiJsPoller } from './pollers/wikijs.js';
import { startMcpServer } from './mcp/raw-transport.js';
import { registerHealthRoutes } from './health.js';
import { startWorker } from './queue/worker.js';

// Load .env file
dotenv.config();

async function main() {
  console.log('🧠 Z-Brain Memory Synthesizer starting...');

  // 1. Load and validate config
  const config = loadConfig();
  console.log(`  Database: ${config.db.host}:${config.db.port}/${config.db.name}`);
  console.log(`  Server:   ${config.server.host}:${config.server.port}`);
  console.log(`  LLM:      ${config.llm.model} via ${config.llm.apiUrl}`);
  console.log(`  OpenBrain: ${config.openbrain.url} (domain: ${config.openbrain.domain})`);

  // 2. Connect to Postgres
  const pool = createPool(config);

  // 3. Run migrations (idempotent)
  console.log('  Running database migrations...');
  await runMigrations(pool);

  // 4. Boot Fastify
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  // 5. Register routes
  registerHealthRoutes(app, pool);
  registerZulipWebhook(app, pool, config);
  registerWikiJsWebhook(app, pool, config);
  // MCP runs on a separate Express server (port 3081) because
  // Fastify's reply.hijack() breaks SSE streams with Hermes/mcp-remote.
  startMcpServer(pool, config, 3081);

  // 6. Start the queue worker
  const worker = startWorker(pool, config);
  console.log(`  Worker started (poll interval: ${config.worker.pollIntervalMs}ms)`);

  // 7. Start the Wiki.js Poller
  const wikiPoller = new WikiJsPoller(pool, config);
  wikiPoller.start();

  // 8. Start listening
  await app.listen({ port: config.server.port, host: config.server.host });
  console.log(`🧠 Memory Synthesizer listening on ${config.server.host}:${config.server.port}`);

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    wikiPoller.stop();
    worker.stop();
    await app.close();
    await pool.end();
    console.log('Memory Synthesizer stopped.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
