import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('config - Phase 2 fields', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Set all existing required vars
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
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads Zulip API config from environment', async () => {
    process.env.ZULIP_API_URL = 'http://zulip:80';
    process.env.ZULIP_BOT_EMAIL = 'bot@zulip.example';
    process.env.ZULIP_BOT_API_KEY = 'zulipapikey123';

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();

    expect(config.zulip.apiUrl).toBe('http://zulip:80');
    expect(config.zulip.botEmail).toBe('bot@zulip.example');
    expect(config.zulip.botApiKey).toBe('zulipapikey123');
  });

  it('loads Wiki.js API config from environment', async () => {
    process.env.WIKIJS_API_URL = 'http://wikijs:3000/graphql';
    process.env.WIKIJS_API_KEY = 'wikijsapikey456';

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();

    expect(config.wikijs.apiUrl).toBe('http://wikijs:3000/graphql');
    expect(config.wikijs.apiKey).toBe('wikijsapikey456');
  });
});
