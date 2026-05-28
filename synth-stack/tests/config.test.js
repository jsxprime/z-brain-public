import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clone env so mutations don't leak
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads all required fields from environment', async () => {
    process.env.SYNTH_DB_HOST = 'localhost';
    process.env.SYNTH_DB_PORT = '5432';
    process.env.SYNTH_DB_NAME = 'test_db';
    process.env.SYNTH_DB_USER = 'test_user';
    process.env.SYNTH_DB_PASSWORD = 'test_pass';
    process.env.SYNTH_PORT = '3080';
    process.env.SYNTH_HOST = '0.0.0.0';
    process.env.OPENBRAIN_URL = 'http://localhost:3040';
    process.env.OPENBRAIN_DOMAIN = 'test';
    process.env.LLM_API_URL = 'http://localhost:8642/v1/chat/completions';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'gpt-5.4-mini';
    process.env.WORKER_POLL_INTERVAL_MS = '5000';
    process.env.WORKER_BATCH_SIZE = '10';
    process.env.WORKER_MAX_RETRIES = '3';

    // Dynamic import to re-evaluate module
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();

    expect(config.db.host).toBe('localhost');
    expect(config.db.port).toBe(5432);
    expect(config.db.name).toBe('test_db');
    expect(config.server.port).toBe(3080);
    expect(config.openbrain.url).toBe('http://localhost:3040');
    expect(config.llm.model).toBe('gpt-5.4-mini');
    expect(config.worker.pollIntervalMs).toBe(5000);
    expect(config.worker.batchSize).toBe(10);
  });

  it('throws if a required env var is missing', async () => {
    // Deliberately leave SYNTH_DB_HOST unset
    delete process.env.SYNTH_DB_HOST;
    process.env.SYNTH_DB_PORT = '5432';
    process.env.SYNTH_DB_NAME = 'test_db';
    process.env.SYNTH_DB_USER = 'test_user';
    process.env.SYNTH_DB_PASSWORD = 'test_pass';
    process.env.SYNTH_PORT = '3080';
    process.env.SYNTH_HOST = '0.0.0.0';
    process.env.OPENBRAIN_URL = 'http://localhost:3040';
    process.env.OPENBRAIN_DOMAIN = 'test';
    process.env.LLM_API_URL = 'http://localhost:8642/v1/chat/completions';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'gpt-5.4-mini';
    process.env.WORKER_POLL_INTERVAL_MS = '5000';
    process.env.WORKER_BATCH_SIZE = '10';
    process.env.WORKER_MAX_RETRIES = '3';

    const { loadConfig } = await import('../src/config.js');
    expect(() => loadConfig()).toThrow('SYNTH_DB_HOST');
  });
});
