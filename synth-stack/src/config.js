/**
 * Configuration loader for the Memory Synthesizer.
 * Validates all required environment variables at startup.
 */

const REQUIRED = [
  'SYNTH_DB_HOST',
  'SYNTH_DB_PORT',
  'SYNTH_DB_NAME',
  'SYNTH_DB_USER',
  'SYNTH_DB_PASSWORD',
  'SYNTH_PORT',
  'SYNTH_HOST',
  'OPENBRAIN_URL',
  'OPENBRAIN_DOMAIN',
  'LLM_API_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'WORKER_POLL_INTERVAL_MS',
  'WORKER_BATCH_SIZE',
  'WORKER_MAX_RETRIES',
];

/**
 * Load and validate configuration from environment variables.
 * @returns {object} Structured configuration object.
 * @throws {Error} If any required env var is missing.
 */
export function loadConfig() {
  for (const key of REQUIRED) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    db: {
      host: process.env.SYNTH_DB_HOST,
      port: parseInt(process.env.SYNTH_DB_PORT, 10),
      name: process.env.SYNTH_DB_NAME,
      user: process.env.SYNTH_DB_USER,
      password: process.env.SYNTH_DB_PASSWORD,
    },
    server: {
      port: parseInt(process.env.SYNTH_PORT, 10),
      host: process.env.SYNTH_HOST,
    },
    zulip: {
      webhookSecret: process.env.ZULIP_WEBHOOK_SECRET || '',
      apiUrl: process.env.ZULIP_API_URL || '',
      botEmail: process.env.ZULIP_BOT_EMAIL || '',
      botApiKey: process.env.ZULIP_BOT_API_KEY || '',
      hostHeader: process.env.ZULIP_HOST_HEADER || '',
    },
    wikijs: {
      webhookSecret: process.env.WIKIJS_WEBHOOK_SECRET || '',
      apiUrl: process.env.WIKIJS_API_URL || 'http://wikijs:3000/graphql',
      apiKey: process.env.WIKIJS_API_KEY || '',
      pollIntervalMs: parseInt(process.env.WIKIJS_POLL_INTERVAL_MS || '300000', 10),
    },
    openbrain: {
      url: process.env.OPENBRAIN_URL,
      domain: process.env.OPENBRAIN_DOMAIN,
    },
    llm: {
      apiUrl: process.env.LLM_API_URL,
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL,
    },
    // Optional: CORE Memory integration for entity/statement extraction.
    // When enabled, synth output is also pushed into CORE's episodic pipeline
    // via its MCP Streamable HTTP endpoint. Missing env vars disable the feature.
    core: {
      mcpUrl: process.env.CORE_MCP_URL || '',
      mcpToken: process.env.CORE_MCP_TOKEN || '',
      enabled: !!(process.env.CORE_MCP_URL && process.env.CORE_MCP_TOKEN),
      sessionId: null, // populated at runtime by worker
    },
    worker: {
      pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS, 10),
      batchSize: parseInt(process.env.WORKER_BATCH_SIZE, 10),
      maxRetries: parseInt(process.env.WORKER_MAX_RETRIES, 10),
    },
  };
}
