# Memory Synthesizer Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Postgres-backed background daemon that durably ingests events from Zulip (chat) and Wiki.js, extracts semantic context via LLM, and commits idempotent memory records to OpenBrain — ensuring zero "AI Amnesia" across the Z-Brain ecosystem.

**Architecture:** The Memory Synthesizer is a Node.js (ESM) service running as a Docker container on the Z-Brain VM (`YOUR_VM_IP`). It receives webhooks from Zulip and Wiki.js, writes raw events to a durable Postgres queue, processes them through an LLM extraction stage, and commits the results to OpenBrain via its MCP HTTP API. A separate Postgres database (`synthesizer_db`) is used — completely independent from the existing `core_brain` database used by OpenBrain/Z-Cortex.

**Tech Stack:**
- **Runtime:** Node.js 22 (ESM modules)
- **Database:** PostgreSQL 15 (pgvector image, new container `synth-postgres`)
- **HTTP Framework:** Fastify (lightweight, schema-validated webhooks)
- **Database Client:** pg (node-postgres) with raw SQL (no ORM — keeps it auditable)
- **LLM Integration:** OpenAI-compatible HTTP calls to the Hermes API server (`YOUR_VM_IP:8642`)
- **OpenBrain Integration:** HTTP POST to OpenBrain MCP capture endpoint (`http://openbrain-server:3040`)
- **Testing:** Vitest
- **Container:** Docker + docker-compose (joins the existing `agent-net` network)

**Existing Infrastructure Reference:**
- **Z-Brain VM:** `YOUR_VM_IP`
- **Docker network:** `agent-net` (external, shared by all stacks)
- **OpenBrain MCP:** `http://openbrain-server:3040/sse` (SSE transport) — `capture` tool takes `{content, domain}`
- **Hermes API:** `http://YOUR_VM_IP:8642` — OpenAI-compatible chat completions endpoint, auth via `API_SERVER_KEY` bearer token
- **Core Postgres:** `core-postgres` container, database `core_brain` — **DO NOT touch this database**
- **Core Redis:** `core-redis` container — available on `agent-net` but we use Postgres for our queue (simpler, one fewer dependency)

---

## File Structure

```
z-brain/synth-stack/
├── docker-compose.yml          # Synth app + dedicated Postgres
├── .env                        # DB creds, API keys, webhook secrets
├── .env.example                # Template for .env
├── Dockerfile                  # Node.js 22 alpine
├── package.json                # Dependencies and scripts
├── src/
│   ├── index.js                # Entry point: boots Fastify server + queue worker
│   ├── config.js               # Env var loader with validation
│   ├── db/
│   │   ├── pool.js             # pg Pool singleton
│   │   ├── migrate.js          # Schema migration runner (idempotent)
│   │   └── migrations/
│   │       └── 001-init.sql    # events, processed_memories, cursors tables
│   ├── webhooks/
│   │   ├── zulip.js            # POST /webhooks/zulip — validates, enqueues
│   │   └── wikijs.js           # POST /webhooks/wikijs — validates, enqueues
│   ├── queue/
│   │   ├── enqueue.js          # Insert raw event into events table
│   │   └── worker.js           # Poll-and-lock worker using SELECT FOR UPDATE SKIP LOCKED
│   ├── extraction/
│   │   ├── extractor.js        # LLM-based context extraction (decisions, snippets, commands)
│   │   └── prompts.js          # System/user prompt templates for extraction
│   ├── commit/
│   │   └── openbrain.js        # POST to OpenBrain capture endpoint (idempotent by source_id)
│   └── health.js               # GET /health and GET /health/detailed
├── tests/
│   ├── setup.js                # Test database setup/teardown
│   ├── webhooks/
│   │   ├── zulip.test.js       # Zulip webhook parsing + enqueue
│   │   └── wikijs.test.js      # Wiki.js webhook parsing + enqueue
│   ├── queue/
│   │   └── worker.test.js      # Queue processing, idempotency, error handling
│   ├── extraction/
│   │   └── extractor.test.js   # LLM extraction with mocked responses
│   └── commit/
│       └── openbrain.test.js   # OpenBrain commit with mocked HTTP
```

---

## Chunk 1: Project Scaffolding and Database

### Task 1: Initialize the project

**Files:**
- Create: `z-brain/synth-stack/package.json`
- Create: `z-brain/synth-stack/.env.example`
- Create: `z-brain/synth-stack/.env`
- Create: `z-brain/synth-stack/.gitignore`

- [ ] **Step 1: Create the project directory and package.json**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
mkdir -p synth-stack
cd synth-stack
```

Create `package.json`:

```json
{
  "name": "z-brain-memory-synthesizer",
  "version": "0.1.0",
  "type": "module",
  "description": "Durable event ingestion pipeline for the Z-Brain ecosystem. Monitors Zulip and Wiki.js, extracts context via LLM, commits to OpenBrain.",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate": "node src/db/migrate.js"
  },
  "keywords": ["z-brain", "memory", "synthesizer"],
  "license": "UNLICENSED",
  "engines": {
    "node": ">=22.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npm install fastify pg
npm install -D vitest
```

Expected: `package-lock.json` created, `node_modules/` populated, no errors.

- [ ] **Step 3: Create .env.example**

Create `z-brain/synth-stack/.env.example`:

```env
# Memory Synthesizer Configuration

# --- Postgres (dedicated synth database, NOT core_brain) ---
SYNTH_DB_HOST=synth-postgres
SYNTH_DB_PORT=5432
SYNTH_DB_NAME=synthesizer_db
SYNTH_DB_USER=synth
SYNTH_DB_PASSWORD=change_me_in_production

# --- Server ---
SYNTH_PORT=3080
SYNTH_HOST=0.0.0.0

# --- Zulip Webhook ---
ZULIP_WEBHOOK_SECRET=change_me

# --- Wiki.js Webhook ---
WIKIJS_WEBHOOK_SECRET=change_me

# --- OpenBrain MCP ---
OPENBRAIN_URL=http://openbrain-server:3040
OPENBRAIN_DOMAIN=synthesizer

# --- LLM Extraction (Hermes API - OpenAI-compatible) ---
LLM_API_URL=http://hermes-agent:8642/v1/chat/completions
LLM_API_KEY=change_me
LLM_MODEL=gpt-5.4-mini

# --- Worker ---
WORKER_POLL_INTERVAL_MS=5000
WORKER_BATCH_SIZE=10
WORKER_MAX_RETRIES=3
```

- [ ] **Step 4: Create .env with real values**

Create `z-brain/synth-stack/.env`:

```env
# Memory Synthesizer Configuration

SYNTH_DB_HOST=synth-postgres
SYNTH_DB_PORT=5432
SYNTH_DB_NAME=synthesizer_db
SYNTH_DB_USER=synth
SYNTH_DB_PASSWORD=synthpostgres1234

SYNTH_PORT=3080
SYNTH_HOST=0.0.0.0

ZULIP_WEBHOOK_SECRET=zulip_synth_secret_2026
WIKIJS_WEBHOOK_SECRET=wikijs_synth_secret_2026

OPENBRAIN_URL=http://openbrain-server:3040
OPENBRAIN_DOMAIN=synthesizer

LLM_API_URL=http://hermes-agent:8642/v1/chat/completions
LLM_API_KEY=change_me
LLM_MODEL=gpt-5.4-mini

WORKER_POLL_INTERVAL_MS=5000
WORKER_BATCH_SIZE=10
WORKER_MAX_RETRIES=3
```

> **Note for executor:** The `LLM_API_KEY` value must match the `API_SERVER_KEY` in `z-brain/hermes-stack/.env`. Check that file and copy the value.

- [ ] **Step 5: Create .gitignore**

Create `z-brain/synth-stack/.gitignore`:

```gitignore
node_modules/
.env
data/
```

- [ ] **Step 6: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add synth-stack/package.json synth-stack/package-lock.json synth-stack/.env.example synth-stack/.gitignore
git commit -m "feat(synth): scaffold Memory Synthesizer project"
```

---

### Task 2: Configuration module

**Files:**
- Create: `z-brain/synth-stack/src/config.js`
- Create: `z-brain/synth-stack/tests/config.test.js`

- [ ] **Step 1: Write the failing test**

Create `z-brain/synth-stack/tests/config.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/config.test.js
```

Expected: FAIL — `Cannot find module '../src/config.js'`

- [ ] **Step 3: Write minimal implementation**

Create `z-brain/synth-stack/src/config.js`:

```javascript
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
    },
    wikijs: {
      webhookSecret: process.env.WIKIJS_WEBHOOK_SECRET || '',
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
    worker: {
      pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS, 10),
      batchSize: parseInt(process.env.WORKER_BATCH_SIZE, 10),
      maxRetries: parseInt(process.env.WORKER_MAX_RETRIES, 10),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/config.test.js
```

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add synth-stack/src/config.js synth-stack/tests/config.test.js
git commit -m "feat(synth): add config loader with validation"
```

---

### Task 3: Database connection pool

**Files:**
- Create: `z-brain/synth-stack/src/db/pool.js`
- Create: `z-brain/synth-stack/tests/db/pool.test.js`

- [ ] **Step 1: Write the failing test**

Create `z-brain/synth-stack/tests/db/pool.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';

describe('db/pool', () => {
  it('exports a createPool function that returns a pg Pool', async () => {
    const { createPool } = await import('../../src/db/pool.js');
    expect(typeof createPool).toBe('function');

    const mockConfig = {
      db: {
        host: 'localhost',
        port: 5432,
        name: 'test_db',
        user: 'test_user',
        password: 'test_pass',
      },
    };

    const pool = createPool(mockConfig);
    expect(pool).toBeDefined();
    expect(typeof pool.query).toBe('function');
    expect(typeof pool.end).toBe('function');

    // Clean up — don't actually connect
    await pool.end();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/db/pool.test.js
```

Expected: FAIL — `Cannot find module '../../src/db/pool.js'`

- [ ] **Step 3: Write minimal implementation**

Create `z-brain/synth-stack/src/db/pool.js`:

```javascript
import pg from 'pg';

const { Pool } = pg;

/**
 * Create a PostgreSQL connection pool from config.
 * @param {object} config - The config object from loadConfig().
 * @returns {pg.Pool} A pg Pool instance.
 */
export function createPool(config) {
  return new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user: config.db.user,
    password: config.db.password,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/db/pool.test.js
```

Expected: 1 test PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add synth-stack/src/db/pool.js synth-stack/tests/db/pool.test.js
git commit -m "feat(synth): add Postgres connection pool"
```

---

### Task 4: Database schema migration

**Files:**
- Create: `z-brain/synth-stack/src/db/migrations/001-init.sql`
- Create: `z-brain/synth-stack/src/db/migrate.js`

- [ ] **Step 1: Create the SQL migration**

Create `z-brain/synth-stack/src/db/migrations/001-init.sql`:

```sql
-- Memory Synthesizer Schema v1
-- This database is INDEPENDENT from core_brain (OpenBrain/Z-Cortex).
-- It stores raw ingested events and tracks processing state.

-- Track which migrations have been applied
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Raw events ingested from Zulip and Wiki.js webhooks.
-- This is the durable event log / queue.
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Source identification
    source TEXT NOT NULL CHECK (source IN ('zulip', 'wikijs')),
    source_id TEXT NOT NULL,           -- e.g. Zulip message_id or Wiki.js page_id + revision
    source_url TEXT,                   -- Deep link back to original

    -- Raw payload
    payload JSONB NOT NULL,

    -- Queue state
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'quarantined')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,

    -- Deduplication: same source event should not be ingested twice
    UNIQUE (source, source_id)
);

-- Index for the worker's polling query (pending events, oldest first)
CREATE INDEX IF NOT EXISTS idx_events_status_created
    ON events (status, created_at ASC)
    WHERE status IN ('pending', 'failed');

-- Processed memory records — what the synthesizer extracted and committed to OpenBrain.
-- This provides provenance and allows the dashboard to display what was committed.
CREATE TABLE IF NOT EXISTS processed_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

    -- What was extracted
    memory_type TEXT NOT NULL CHECK (memory_type IN ('decision', 'snippet', 'command', 'summary', 'reference')),
    extracted_content TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),

    -- OpenBrain commit tracking
    openbrain_committed BOOLEAN NOT NULL DEFAULT FALSE,
    openbrain_thought_id TEXT,        -- UUID returned by OpenBrain capture
    committed_at TIMESTAMPTZ,

    -- Quarantine support
    quarantined BOOLEAN NOT NULL DEFAULT FALSE,
    quarantine_reason TEXT,
    reviewed_by TEXT,                  -- 'human' or 'auto'
    reviewed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_memories_event
    ON processed_memories (event_id);

CREATE INDEX IF NOT EXISTS idx_processed_memories_quarantined
    ON processed_memories (quarantined)
    WHERE quarantined = TRUE;

-- Cursor tracking for pull-based sources (if we add polling later)
CREATE TABLE IF NOT EXISTS source_cursors (
    source TEXT PRIMARY KEY,
    last_event_id TEXT NOT NULL,
    last_event_timestamp TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Write the migration runner**

Create `z-brain/synth-stack/src/db/migrate.js`:

```javascript
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

/**
 * Run all pending migrations against the database.
 * Idempotent — safe to run multiple times.
 *
 * @param {pg.Pool} pool - A pg Pool instance.
 */
export async function runMigrations(pool) {
  // Ensure the schema_migrations table exists (bootstrap)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get already-applied versions
  const { rows } = await pool.query(
    'SELECT version FROM schema_migrations ORDER BY version'
  );
  const applied = new Set(rows.map((r) => r.version));

  // Read migration files sorted by version number
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    // Extract version number from filename: "001-init.sql" → 1
    const version = parseInt(file.split('-')[0], 10);
    if (applied.has(version)) {
      console.log(`Migration ${file} already applied, skipping.`);
      continue;
    }

    console.log(`Applying migration: ${file}...`);
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [version]
      );
      await client.query('COMMIT');
      console.log(`Migration ${file} applied successfully.`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Migration ${file} FAILED:`, err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('All migrations complete.');
}

// Allow running as a standalone script: node src/db/migrate.js
// Only runs when this file is the entry point (not when imported)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { loadConfig } = await import('../config.js');
  const { createPool } = await import('./pool.js');

  // Load .env for standalone execution
  const { config } = await import('dotenv');
  config();

  const appConfig = loadConfig();
  const pool = createPool(appConfig);

  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add synth-stack/src/db/migrations/001-init.sql synth-stack/src/db/migrate.js
git commit -m "feat(synth): add database schema and migration runner"
```

> **Note for executor:** The migration runner needs `dotenv` when run standalone. Install it:
> ```bash
> cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack && npm install dotenv
> ```

---

### Task 5: Docker infrastructure

**Files:**
- Create: `z-brain/synth-stack/Dockerfile`
- Create: `z-brain/synth-stack/docker-compose.yml`

- [ ] **Step 1: Create the Dockerfile**

Create `z-brain/synth-stack/Dockerfile`:

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./
RUN npm ci --production

# Copy source
COPY src/ ./src/

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3080/health || exit 1

EXPOSE 3080

CMD ["node", "src/index.js"]
```

- [ ] **Step 2: Create docker-compose.yml**

Create `z-brain/synth-stack/docker-compose.yml`:

```yaml
# Memory Synthesizer Stack
# Joins the shared agent-net network so it can reach:
#   - openbrain-server (OpenBrain MCP at port 3040)
#   - hermes-agent (LLM API at port 8642)
#   - core-app (Z-Cortex at port 3033)

services:
  # Dedicated Postgres for the Synthesizer
  # Completely independent from core-postgres (core_brain)
  synth-postgres:
    image: postgres:15-alpine
    container_name: synth-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${SYNTH_DB_NAME}
      POSTGRES_USER: ${SYNTH_DB_USER}
      POSTGRES_PASSWORD: ${SYNTH_DB_PASSWORD}
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    networks:
      - agent-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${SYNTH_DB_USER} -d ${SYNTH_DB_NAME}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # The Memory Synthesizer daemon
  synth-app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: synth-app
    restart: unless-stopped
    ports:
      - "3080:3080"
    env_file:
      - .env
    depends_on:
      synth-postgres:
        condition: service_healthy
    networks:
      - agent-net
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.synth.rule=Host(`synth.example.com`)"
      - "traefik.http.routers.synth.entrypoints=websecure"
      - "traefik.http.routers.synth.tls=true"
      - "traefik.http.routers.synth.tls.certresolver=cloudflare"
      - "traefik.http.services.synth.loadbalancer.server.port=3080"

networks:
  agent-net:
    external: true
```

- [ ] **Step 3: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add synth-stack/Dockerfile synth-stack/docker-compose.yml
git commit -m "feat(synth): add Docker infrastructure"
```

---

## Chunk 2: Webhook Receivers

### Task 6: Event enqueue function

**Files:**
- Create: `z-brain/synth-stack/src/queue/enqueue.js`
- Create: `z-brain/synth-stack/tests/queue/enqueue.test.js`

- [ ] **Step 1: Write the failing test**

Create `z-brain/synth-stack/tests/setup.js`:

```javascript
/**
 * Shared test utilities.
 * For integration tests, we use a real Postgres. For unit tests, we mock.
 */
import { vi } from 'vitest';

/**
 * Create a mock pg Pool that records queries.
 */
export function createMockPool() {
  const queries = [];
  return {
    queries,
    query: vi.fn(async (text, params) => {
      queries.push({ text, params });
      return { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(async () => ({
      query: vi.fn(async (text, params) => {
        queries.push({ text, params });
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    })),
    end: vi.fn(),
  };
}
```

Create `z-brain/synth-stack/tests/queue/enqueue.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { createMockPool } from '../setup.js';

describe('queue/enqueue', () => {
  it('inserts a zulip event with correct source and source_id', async () => {
    const { enqueueEvent } = await import('../../src/queue/enqueue.js');
    const pool = createMockPool();

    await enqueueEvent(pool, {
      source: 'zulip',
      sourceId: 'msg-12345',
      sourceUrl: 'https://zulip.example.com/#narrow/stream/general/topic/test/near/12345',
      payload: { type: 'message', message: { content: 'hello world' } },
    });

    expect(pool.query).toHaveBeenCalledOnce();
    const call = pool.query.mock.calls[0];
    expect(call[0]).toContain('INSERT INTO events');
    expect(call[1]).toContain('zulip');
    expect(call[1]).toContain('msg-12345');
  });

  it('handles duplicate source_id gracefully (upsert / ON CONFLICT DO NOTHING)', async () => {
    const { enqueueEvent } = await import('../../src/queue/enqueue.js');
    const pool = createMockPool();

    // Simulate a conflict — the function should not throw
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await enqueueEvent(pool, {
      source: 'zulip',
      sourceId: 'msg-12345',
      sourceUrl: null,
      payload: { type: 'message', message: { content: 'hello world' } },
    });

    // Should return a result indicating it was a duplicate
    expect(result).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/queue/enqueue.test.js
```

Expected: FAIL — `Cannot find module '../../src/queue/enqueue.js'`

- [ ] **Step 3: Write minimal implementation**

Create `z-brain/synth-stack/src/queue/enqueue.js`:

```javascript
/**
 * Enqueue a raw event into the durable Postgres event log.
 * Uses ON CONFLICT DO NOTHING to ensure idempotency —
 * the same webhook delivered twice will not create duplicate rows.
 *
 * @param {import('pg').Pool} pool
 * @param {object} event
 * @param {string} event.source - 'zulip' or 'wikijs'
 * @param {string} event.sourceId - Unique ID from the source system
 * @param {string|null} event.sourceUrl - Deep link back to original
 * @param {object} event.payload - Raw webhook payload (stored as JSONB)
 * @returns {Promise<{id: string|null, duplicate: boolean}>}
 */
export async function enqueueEvent(pool, { source, sourceId, sourceUrl, payload }) {
  const result = await pool.query(
    `INSERT INTO events (source, source_id, source_url, payload)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source, source_id) DO NOTHING
     RETURNING id`,
    [source, sourceId, sourceUrl, JSON.stringify(payload)]
  );

  if (result.rowCount === 0) {
    return { id: null, duplicate: true };
  }

  return { id: result.rows[0].id, duplicate: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/queue/enqueue.test.js
```

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add synth-stack/src/queue/enqueue.js synth-stack/tests/setup.js synth-stack/tests/queue/enqueue.test.js
git commit -m "feat(synth): add idempotent event enqueue function"
```

---

### Task 7: Zulip webhook handler

**Files:**
- Create: `z-brain/synth-stack/src/webhooks/zulip.js`
- Create: `z-brain/synth-stack/tests/webhooks/zulip.test.js`

- [ ] **Step 1: Write the failing test**

Create `z-brain/synth-stack/tests/webhooks/zulip.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPool } from '../setup.js';

describe('webhooks/zulip', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = createMockPool();
    // Simulate successful insert
    mockPool.query.mockResolvedValue({ rows: [{ id: 'test-uuid' }], rowCount: 1 });
  });

  it('extracts message_id and stream/topic from a Zulip message event', async () => {
    const { parseZulipWebhook } = await import('../../src/webhooks/zulip.js');

    const zulipPayload = {
      type: 'message',
      message: {
        id: 99001,
        sender_full_name: 'the operator',
        sender_email: 'jay@example.com',
        type: 'stream',
        display_recipient: 'engineering',
        subject: 'docker-templates',
        content: 'Here is a useful docker compose template for traefik...',
        timestamp: 1716900000,
      },
    };

    const parsed = parseZulipWebhook(zulipPayload);

    expect(parsed.sourceId).toBe('zulip-msg-99001');
    expect(parsed.source).toBe('zulip');
    expect(parsed.payload.stream).toBe('engineering');
    expect(parsed.payload.topic).toBe('docker-templates');
    expect(parsed.payload.sender).toBe('the operator');
    expect(parsed.payload.content).toBe('Here is a useful docker compose template for traefik...');
  });

  it('returns null for non-message events', async () => {
    const { parseZulipWebhook } = await import('../../src/webhooks/zulip.js');

    const heartbeatPayload = { type: 'heartbeat' };
    const parsed = parseZulipWebhook(heartbeatPayload);

    expect(parsed).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/webhooks/zulip.test.js
```

Expected: FAIL — `Cannot find module '../../src/webhooks/zulip.js'`

- [ ] **Step 3: Write minimal implementation**

Create `z-brain/synth-stack/src/webhooks/zulip.js`:

```javascript
/**
 * Zulip webhook handler.
 *
 * Zulip sends outgoing webhooks as POST with a JSON body.
 * Docs: https://zulip.com/api/outgoing-webhooks
 *
 * We normalize the Zulip payload into our canonical event format
 * before enqueuing it.
 */

/**
 * Parse a Zulip webhook payload into a canonical event.
 *
 * @param {object} payload - Raw Zulip webhook JSON body.
 * @returns {object|null} Canonical event, or null if we should ignore this event.
 */
export function parseZulipWebhook(payload) {
  // Only process actual messages (not heartbeats, typing indicators, etc.)
  if (!payload || payload.type !== 'message' || !payload.message) {
    return null;
  }

  const msg = payload.message;

  return {
    source: 'zulip',
    sourceId: `zulip-msg-${msg.id}`,
    sourceUrl: null, // Zulip outgoing webhooks don't include a permalink; construct later if needed
    payload: {
      messageId: msg.id,
      stream: msg.display_recipient || null,
      topic: msg.subject || null,
      sender: msg.sender_full_name || msg.sender_email,
      content: msg.content,
      timestamp: msg.timestamp,
      type: msg.type, // 'stream' or 'private'
    },
  };
}

/**
 * Register the Zulip webhook route on a Fastify instance.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {import('pg').Pool} pool
 * @param {object} config
 */
export function registerZulipWebhook(app, pool, config) {
  app.post('/webhooks/zulip', async (request, reply) => {
    // Optional: validate webhook secret via query param or header
    const secret = request.query.secret || request.headers['x-zulip-webhook-secret'];
    if (config.zulip.webhookSecret && secret !== config.zulip.webhookSecret) {
      return reply.code(401).send({ error: 'Invalid webhook secret' });
    }

    const parsed = parseZulipWebhook(request.body);
    if (!parsed) {
      // Acknowledge but ignore non-message events
      return reply.code(200).send({ status: 'ignored' });
    }

    // Lazy import to avoid circular deps
    const { enqueueEvent } = await import('../queue/enqueue.js');
    const result = await enqueueEvent(pool, parsed);

    if (result.duplicate) {
      return reply.code(200).send({ status: 'duplicate', sourceId: parsed.sourceId });
    }

    return reply.code(201).send({ status: 'enqueued', id: result.id });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/webhooks/zulip.test.js
```

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add synth-stack/src/webhooks/zulip.js synth-stack/tests/webhooks/zulip.test.js
git commit -m "feat(synth): add Zulip webhook handler with parsing"
```

---

### Task 8: Wiki.js webhook handler

**Files:**
- Create: `z-brain/synth-stack/src/webhooks/wikijs.js`
- Create: `z-brain/synth-stack/tests/webhooks/wikijs.test.js`

- [ ] **Step 1: Write the failing test**

Create `z-brain/synth-stack/tests/webhooks/wikijs.test.js`:

```javascript
import { describe, it, expect } from 'vitest';

describe('webhooks/wikijs', () => {
  it('extracts page_id and revision from a Wiki.js page update event', async () => {
    const { parseWikiJsWebhook } = await import('../../src/webhooks/wikijs.js');

    const wikijsPayload = {
      event: 'page:updated',
      page: {
        id: 42,
        path: 'homelab/docker-templates/traefik',
        title: 'Traefik Docker Compose Template',
        content: '# Traefik\n\n```yaml\nversion: "3"\nservices:\n  traefik:\n    image: traefik:v3\n```',
        updatedAt: '2026-05-28T18:00:00Z',
        authorName: 'the operator',
      },
    };

    const parsed = parseWikiJsWebhook(wikijsPayload);

    expect(parsed.source).toBe('wikijs');
    expect(parsed.sourceId).toBe('wikijs-page-42-2026-05-28T18:00:00Z');
    expect(parsed.payload.pageId).toBe(42);
    expect(parsed.payload.path).toBe('homelab/docker-templates/traefik');
    expect(parsed.payload.title).toBe('Traefik Docker Compose Template');
    expect(parsed.payload.content).toContain('traefik:v3');
  });

  it('handles page:created events', async () => {
    const { parseWikiJsWebhook } = await import('../../src/webhooks/wikijs.js');

    const payload = {
      event: 'page:created',
      page: {
        id: 43,
        path: 'homelab/commands/ssh',
        title: 'Useful SSH Commands',
        content: '# SSH\n\nssh-keygen -t ed25519',
        updatedAt: '2026-05-28T19:00:00Z',
        authorName: 'the operator',
      },
    };

    const parsed = parseWikiJsWebhook(payload);
    expect(parsed).not.toBeNull();
    expect(parsed.sourceId).toBe('wikijs-page-43-2026-05-28T19:00:00Z');
  });

  it('returns null for non-page events', async () => {
    const { parseWikiJsWebhook } = await import('../../src/webhooks/wikijs.js');

    const parsed = parseWikiJsWebhook({ event: 'user:login', user: {} });
    expect(parsed).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/webhooks/wikijs.test.js
```

Expected: FAIL — `Cannot find module '../../src/webhooks/wikijs.js'`

- [ ] **Step 3: Write minimal implementation**

Create `z-brain/synth-stack/src/webhooks/wikijs.js`:

```javascript
/**
 * Wiki.js webhook handler.
 *
 * Wiki.js can send webhooks on page:created, page:updated, page:deleted.
 * Docs: https://docs.requarks.io/webhooks
 *
 * We normalize into our canonical event format.
 */

const PAGE_EVENTS = new Set(['page:created', 'page:updated']);

/**
 * Parse a Wiki.js webhook payload into a canonical event.
 *
 * @param {object} payload - Raw Wiki.js webhook JSON body.
 * @returns {object|null} Canonical event, or null if ignored.
 */
export function parseWikiJsWebhook(payload) {
  if (!payload || !PAGE_EVENTS.has(payload.event) || !payload.page) {
    return null;
  }

  const page = payload.page;

  // Use page_id + updatedAt as the composite source_id.
  // This ensures each revision is a unique event (idempotent).
  const sourceId = `wikijs-page-${page.id}-${page.updatedAt}`;

  return {
    source: 'wikijs',
    sourceId,
    sourceUrl: null, // Wiki.js webhooks don't include the full URL; construct from config if needed
    payload: {
      event: payload.event,
      pageId: page.id,
      path: page.path,
      title: page.title,
      content: page.content,
      author: page.authorName,
      updatedAt: page.updatedAt,
    },
  };
}

/**
 * Register the Wiki.js webhook route on a Fastify instance.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {import('pg').Pool} pool
 * @param {object} config
 */
export function registerWikiJsWebhook(app, pool, config) {
  app.post('/webhooks/wikijs', async (request, reply) => {
    // Validate webhook secret
    const secret = request.query.secret || request.headers['x-wikijs-webhook-secret'];
    if (config.wikijs.webhookSecret && secret !== config.wikijs.webhookSecret) {
      return reply.code(401).send({ error: 'Invalid webhook secret' });
    }

    const parsed = parseWikiJsWebhook(request.body);
    if (!parsed) {
      return reply.code(200).send({ status: 'ignored' });
    }

    const { enqueueEvent } = await import('../queue/enqueue.js');
    const result = await enqueueEvent(pool, parsed);

    if (result.duplicate) {
      return reply.code(200).send({ status: 'duplicate', sourceId: parsed.sourceId });
    }

    return reply.code(201).send({ status: 'enqueued', id: result.id });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/webhooks/wikijs.test.js
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add synth-stack/src/webhooks/wikijs.js synth-stack/tests/webhooks/wikijs.test.js
git commit -m "feat(synth): add Wiki.js webhook handler with parsing"
```

---

## Chunk 3: LLM Extraction and OpenBrain Commit

### Task 9: LLM extraction prompts

**Files:**
- Create: `z-brain/synth-stack/src/extraction/prompts.js`

- [ ] **Step 1: Create the prompts module**

Create `z-brain/synth-stack/src/extraction/prompts.js`:

```javascript
/**
 * Prompt templates for the LLM extraction stage.
 *
 * The LLM receives a normalized event (chat message or wiki page)
 * and returns structured JSON describing what memories to extract.
 */

export const SYSTEM_PROMPT = `You are a Memory Curator for the Z-Brain ecosystem.
Your job is to analyze incoming events (chat messages and wiki pages) and extract
durable memories that should be preserved for future context retrieval.

You MUST respond with valid JSON only. No markdown, no explanation.

For each event, extract zero or more memory records. Each record has:
- "type": one of "decision", "snippet", "command", "summary", "reference"
- "content": the extracted memory text, written for future retrieval
- "confidence": 0.0 to 1.0 — how confident you are this is worth preserving

Guidelines:
- "decision": A choice or conclusion reached in conversation (e.g., "We chose Zulip over Mattermost for chat")
- "snippet": A code block, Docker template, config fragment worth saving
- "command": A specific CLI command or one-liner worth remembering
- "summary": A high-level summary of a conversation topic or wiki page
- "reference": A URL, tool name, or external resource mentioned

Rules:
- Do NOT extract trivial greetings, small talk, or filler
- Do NOT extract information that is already well-known or obvious
- If the event contains nothing worth remembering, return an empty array
- Confidence < 0.6 will be quarantined for human review
- Write each memory as if someone will search for it months from now`;

/**
 * Build the user prompt for a given event.
 *
 * @param {object} event - The canonical event payload from the events table.
 * @returns {string} The user prompt.
 */
export function buildUserPrompt(event) {
  if (event.source === 'zulip') {
    return `Extract memories from this Zulip chat message:

Stream: ${event.payload.stream || 'unknown'}
Topic: ${event.payload.topic || 'unknown'}
Sender: ${event.payload.sender || 'unknown'}
Content:
${event.payload.content}

Respond with a JSON array of memory objects. Example:
[{"type": "decision", "content": "Team decided to use Postgres for the event queue", "confidence": 0.9}]

If nothing is worth extracting, respond with: []`;
  }

  if (event.source === 'wikijs') {
    return `Extract memories from this Wiki.js page:

Title: ${event.payload.title || 'untitled'}
Path: ${event.payload.path || 'unknown'}
Author: ${event.payload.author || 'unknown'}
Content:
${event.payload.content}

Respond with a JSON array of memory objects. Example:
[{"type": "snippet", "content": "Docker compose template for Traefik reverse proxy: ...", "confidence": 0.95}]

If nothing is worth extracting, respond with: []`;
  }

  return `Extract memories from this event:\n${JSON.stringify(event.payload, null, 2)}\n\nRespond with a JSON array.`;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add synth-stack/src/extraction/prompts.js
git commit -m "feat(synth): add LLM extraction prompt templates"
```

---

### Task 10: LLM extractor

**Files:**
- Create: `z-brain/synth-stack/src/extraction/extractor.js`
- Create: `z-brain/synth-stack/tests/extraction/extractor.test.js`

- [ ] **Step 1: Write the failing test**

Create `z-brain/synth-stack/tests/extraction/extractor.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('extraction/extractor', () => {
  it('calls the LLM API and parses the JSON response', async () => {
    const { extractMemories } = await import('../../src/extraction/extractor.js');

    const llmResponse = [
      { type: 'decision', content: 'Team chose Zulip over Mattermost', confidence: 0.92 },
      { type: 'command', content: 'docker compose up -d', confidence: 0.85 },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(llmResponse) } }],
      }),
    });

    const config = {
      llm: {
        apiUrl: 'http://localhost:8642/v1/chat/completions',
        apiKey: 'test-key',
        model: 'gpt-5.4-mini',
      },
    };

    const event = {
      source: 'zulip',
      payload: {
        stream: 'engineering',
        topic: 'chat-selection',
        sender: 'the operator',
        content: 'We decided to go with Zulip. Also run: docker compose up -d',
      },
    };

    const results = await extractMemories(config, event);

    expect(results).toHaveLength(2);
    expect(results[0].type).toBe('decision');
    expect(results[0].confidence).toBe(0.92);
    expect(results[1].type).toBe('command');

    // Verify fetch was called with correct URL and auth
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8642/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      })
    );
  });

  it('returns empty array when LLM returns empty extraction', async () => {
    const { extractMemories } = await import('../../src/extraction/extractor.js');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '[]' } }],
      }),
    });

    const config = {
      llm: {
        apiUrl: 'http://localhost:8642/v1/chat/completions',
        apiKey: 'test-key',
        model: 'gpt-5.4-mini',
      },
    };

    const event = {
      source: 'zulip',
      payload: { stream: 'general', topic: 'greetings', sender: 'the operator', content: 'hello!' },
    };

    const results = await extractMemories(config, event);
    expect(results).toEqual([]);
  });

  it('throws on LLM API error', async () => {
    const { extractMemories } = await import('../../src/extraction/extractor.js');

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const config = {
      llm: {
        apiUrl: 'http://localhost:8642/v1/chat/completions',
        apiKey: 'test-key',
        model: 'gpt-5.4-mini',
      },
    };

    const event = {
      source: 'zulip',
      payload: { stream: 'general', topic: 'test', sender: 'the operator', content: 'test' },
    };

    await expect(extractMemories(config, event)).rejects.toThrow('LLM API error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/extraction/extractor.test.js
```

Expected: FAIL — `Cannot find module '../../src/extraction/extractor.js'`

- [ ] **Step 3: Write minimal implementation**

Create `z-brain/synth-stack/src/extraction/extractor.js`:

```javascript
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';

/**
 * Call the LLM to extract memory records from a raw event.
 *
 * @param {object} config - App config (config.llm.*)
 * @param {object} event - The raw event from the events table { source, payload }
 * @returns {Promise<Array<{type: string, content: string, confidence: number}>>}
 * @throws {Error} If the LLM API returns a non-200 response
 */
export async function extractMemories(config, event) {
  const userPrompt = buildUserPrompt(event);

  const response = await fetch(config.llm.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2, // Low temperature for consistent structured output
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    return [];
  }

  try {
    // Strip potential markdown code fences the LLM might wrap around JSON
    const cleaned = content.replace(/^```json?\n?/gm, '').replace(/\n?```$/gm, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      console.warn('LLM returned non-array response, treating as empty:', content);
      return [];
    }

    // Validate each record has required fields
    return parsed.filter(
      (record) =>
        record &&
        typeof record.type === 'string' &&
        typeof record.content === 'string' &&
        typeof record.confidence === 'number'
    );
  } catch (err) {
    console.error('Failed to parse LLM JSON response:', content, err);
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/extraction/extractor.test.js
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add synth-stack/src/extraction/extractor.js synth-stack/tests/extraction/extractor.test.js
git commit -m "feat(synth): add LLM-based memory extractor"
```

---

### Task 11: OpenBrain commit module

**Files:**
- Create: `z-brain/synth-stack/src/commit/openbrain.js`
- Create: `z-brain/synth-stack/tests/commit/openbrain.test.js`

- [ ] **Step 1: Write the failing test**

Create `z-brain/synth-stack/tests/commit/openbrain.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('commit/openbrain', () => {
  it('posts a memory to OpenBrain capture endpoint', async () => {
    const { commitToOpenBrain } = await import('../../src/commit/openbrain.js');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'thought-uuid-123' }),
    });

    const config = {
      openbrain: {
        url: 'http://openbrain-server:3040',
        domain: 'synthesizer',
      },
    };

    const memory = {
      type: 'decision',
      content: 'Team chose Zulip over Mattermost for the Z-Brain ecosystem chat service',
      confidence: 0.92,
    };

    const provenance = {
      source: 'zulip',
      sourceId: 'zulip-msg-99001',
      stream: 'engineering',
      topic: 'chat-selection',
    };

    const result = await commitToOpenBrain(config, memory, provenance);

    expect(result.thoughtId).toBe('thought-uuid-123');

    // Verify the content sent to OpenBrain includes provenance
    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.content).toContain('Team chose Zulip');
    expect(body.content).toContain('[source: zulip');
    expect(body.domain).toBe('synthesizer');
  });

  it('throws on OpenBrain API error', async () => {
    const { commitToOpenBrain } = await import('../../src/commit/openbrain.js');

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    const config = { openbrain: { url: 'http://localhost:3040', domain: 'test' } };
    const memory = { type: 'summary', content: 'test', confidence: 1.0 };
    const provenance = { source: 'zulip', sourceId: 'test-123' };

    await expect(commitToOpenBrain(config, memory, provenance)).rejects.toThrow(
      'OpenBrain commit failed'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/commit/openbrain.test.js
```

Expected: FAIL — `Cannot find module '../../src/commit/openbrain.js'`

- [ ] **Step 3: Write minimal implementation**

Create `z-brain/synth-stack/src/commit/openbrain.js`:

```javascript
/**
 * Commit an extracted memory to OpenBrain.
 *
 * OpenBrain's `capture` tool accepts:
 *   { content: string, domain: string }
 *
 * We append provenance metadata to the content so that the memory
 * can be traced back to its source (Zulip message, Wiki.js page, etc.)
 *
 * @param {object} config - App config (config.openbrain.*)
 * @param {object} memory - Extracted memory { type, content, confidence }
 * @param {object} provenance - Source metadata { source, sourceId, stream?, topic?, path?, title? }
 * @returns {Promise<{thoughtId: string}>}
 * @throws {Error} If OpenBrain returns a non-200 response.
 */
export async function commitToOpenBrain(config, memory, provenance) {
  // Build a rich content string with provenance trail
  const provenanceLine = [
    `[source: ${provenance.source}`,
    provenance.stream ? `stream: ${provenance.stream}` : null,
    provenance.topic ? `topic: ${provenance.topic}` : null,
    provenance.path ? `path: ${provenance.path}` : null,
    provenance.title ? `title: ${provenance.title}` : null,
    `id: ${provenance.sourceId}]`,
  ]
    .filter(Boolean)
    .join(', ');

  const enrichedContent = `[${memory.type}] ${memory.content}\n\n${provenanceLine}`;

  // OpenBrain MCP capture endpoint
  // The MCP server at openbrain-server:3040 exposes a JSON-RPC interface.
  // For direct HTTP integration, we use the tool's expected input format.
  const response = await fetch(`${config.openbrain.url}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: enrichedContent,
      domain: config.openbrain.domain,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenBrain commit failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return { thoughtId: data.id || null };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/commit/openbrain.test.js
```

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add synth-stack/src/commit/openbrain.js synth-stack/tests/commit/openbrain.test.js
git commit -m "feat(synth): add OpenBrain commit module with provenance"
```

---

## Chunk 4: Queue Worker and Entry Point

### Task 12: Queue worker (the core processing loop)

**Files:**
- Create: `z-brain/synth-stack/src/queue/worker.js`
- Create: `z-brain/synth-stack/tests/queue/worker.test.js`

- [ ] **Step 1: Write the failing test**

Create `z-brain/synth-stack/tests/queue/worker.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { createMockPool } from '../setup.js';

describe('queue/worker', () => {
  it('processBatch fetches pending events using SELECT FOR UPDATE SKIP LOCKED', async () => {
    const { processBatch } = await import('../../src/queue/worker.js');
    const pool = createMockPool();

    // Mock: no pending events
    const mockClient = {
      query: vi.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT (no events)
        .mockResolvedValueOnce({}), // COMMIT
      release: vi.fn(),
    };
    pool.connect.mockResolvedValueOnce(mockClient);

    const config = {
      worker: { batchSize: 10, maxRetries: 3 },
      llm: { apiUrl: 'http://test', apiKey: 'key', model: 'test' },
      openbrain: { url: 'http://test', domain: 'test' },
    };

    await processBatch(pool, config);

    // Verify it issued BEGIN and a SELECT with SKIP LOCKED
    const selectCall = mockClient.query.mock.calls[1];
    expect(selectCall[0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(selectCall[0]).toContain('pending');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/queue/worker.test.js
```

Expected: FAIL — `Cannot find module '../../src/queue/worker.js'`

- [ ] **Step 3: Write minimal implementation**

Create `z-brain/synth-stack/src/queue/worker.js`:

```javascript
import { extractMemories } from '../extraction/extractor.js';
import { commitToOpenBrain } from '../commit/openbrain.js';

/**
 * Process a single batch of pending events from the queue.
 *
 * Uses SELECT FOR UPDATE SKIP LOCKED to safely support concurrent workers
 * (future-proofing) without row contention.
 *
 * Flow per event:
 *   1. Lock the event row
 *   2. Set status = 'processing'
 *   3. Call LLM extractor
 *   4. For each extracted memory:
 *      a. Insert into processed_memories
 *      b. If confidence >= 0.6: commit to OpenBrain
 *      c. If confidence < 0.6: mark as quarantined
 *   5. Set event status = 'completed' (or 'failed' on error)
 *
 * @param {import('pg').Pool} pool
 * @param {object} config
 */
export async function processBatch(pool, config) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Fetch and lock a batch of pending or retriable events
    const { rows: events } = await client.query(
      `SELECT id, source, source_id, source_url, payload, retry_count
       FROM events
       WHERE status IN ('pending', 'failed') AND retry_count < $1
       ORDER BY created_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [config.worker.maxRetries, config.worker.batchSize]
    );

    if (events.length === 0) {
      await client.query('COMMIT');
      return;
    }

    for (const event of events) {
      try {
        // Mark as processing
        await client.query(
          `UPDATE events SET status = 'processing' WHERE id = $1`,
          [event.id]
        );

        // Extract memories via LLM
        const memories = await extractMemories(config, {
          source: event.source,
          payload: event.payload,
        });

        // Build provenance from event metadata
        const provenance = {
          source: event.source,
          sourceId: event.source_id,
          stream: event.payload?.stream,
          topic: event.payload?.topic,
          path: event.payload?.path,
          title: event.payload?.title,
        };

        // Process each extracted memory
        for (const memory of memories) {
          const shouldQuarantine = memory.confidence < 0.6;

          let openbrainThoughtId = null;
          if (!shouldQuarantine) {
            try {
              const result = await commitToOpenBrain(config, memory, provenance);
              openbrainThoughtId = result.thoughtId;
            } catch (commitErr) {
              console.error(`OpenBrain commit failed for event ${event.id}:`, commitErr.message);
              // Don't fail the whole event — just mark this memory as not committed
            }
          }

          await client.query(
            `INSERT INTO processed_memories
               (event_id, memory_type, extracted_content, confidence,
                openbrain_committed, openbrain_thought_id, committed_at,
                quarantined, quarantine_reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              event.id,
              memory.type,
              memory.content,
              memory.confidence,
              !!openbrainThoughtId,
              openbrainThoughtId,
              openbrainThoughtId ? new Date().toISOString() : null,
              shouldQuarantine,
              shouldQuarantine ? `Low confidence: ${memory.confidence}` : null,
            ]
          );
        }

        // Mark event as completed
        await client.query(
          `UPDATE events SET status = 'completed', processed_at = NOW() WHERE id = $1`,
          [event.id]
        );
      } catch (eventErr) {
        console.error(`Failed to process event ${event.id}:`, eventErr.message);

        // Mark as failed, increment retry counter
        await client.query(
          `UPDATE events
           SET status = 'failed',
               retry_count = retry_count + 1,
               error_message = $2
           WHERE id = $1`,
          [event.id, eventErr.message]
        );
      }
    }

    await client.query('COMMIT');
  } catch (batchErr) {
    await client.query('ROLLBACK');
    console.error('Batch processing failed:', batchErr.message);
    throw batchErr;
  } finally {
    client.release();
  }
}

/**
 * Start the worker loop. Polls the queue at a configurable interval.
 *
 * @param {import('pg').Pool} pool
 * @param {object} config
 * @returns {{ stop: () => void }} A handle to stop the worker.
 */
export function startWorker(pool, config) {
  let running = true;
  let timeoutId = null;

  async function poll() {
    if (!running) return;

    try {
      await processBatch(pool, config);
    } catch (err) {
      console.error('Worker poll error:', err.message);
    }

    if (running) {
      timeoutId = setTimeout(poll, config.worker.pollIntervalMs);
    }
  }

  // Start the first poll
  poll();

  return {
    stop() {
      running = false;
      if (timeoutId) clearTimeout(timeoutId);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/queue/worker.test.js
```

Expected: 1 test PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add synth-stack/src/queue/worker.js synth-stack/tests/queue/worker.test.js
git commit -m "feat(synth): add queue worker with SKIP LOCKED processing"
```

---

### Task 13: Health check endpoint

**Files:**
- Create: `z-brain/synth-stack/src/health.js`

- [ ] **Step 1: Create the health module**

Create `z-brain/synth-stack/src/health.js`:

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add synth-stack/src/health.js
git commit -m "feat(synth): add health check endpoints"
```

---

### Task 14: Application entry point

**Files:**
- Create: `z-brain/synth-stack/src/index.js`

- [ ] **Step 1: Create the entry point**

Create `z-brain/synth-stack/src/index.js`:

```javascript
import Fastify from 'fastify';
import dotenv from 'dotenv';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { registerZulipWebhook } from './webhooks/zulip.js';
import { registerWikiJsWebhook } from './webhooks/wikijs.js';
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

  // 6. Start the queue worker
  const worker = startWorker(pool, config);
  console.log(`  Worker started (poll interval: ${config.worker.pollIntervalMs}ms)`);

  // 7. Start listening
  await app.listen({ port: config.server.port, host: config.server.host });
  console.log(`🧠 Memory Synthesizer listening on ${config.server.host}:${config.server.port}`);

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
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
```

- [ ] **Step 2: Smoke test locally (requires Docker)**

> **Note for executor:** This step requires the Docker infrastructure to be running. If not deploying yet, skip to the commit step.

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
# Start just Postgres for local dev:
docker compose up synth-postgres -d

# Wait for Postgres to be ready, then run migrations:
sleep 5
SYNTH_DB_HOST=localhost npm run migrate

# Start the app in dev mode:
npm run dev
```

Expected output includes:
```
🧠 Z-Brain Memory Synthesizer starting...
  Running database migrations...
  All migrations complete.
  Worker started (poll interval: 5000ms)
🧠 Memory Synthesizer listening on 0.0.0.0:3080
```

Verify health endpoint:
```bash
curl http://localhost:3080/health
```

Expected: `{"status":"ok","service":"memory-synthesizer"}`

Stop the dev server with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add synth-stack/src/index.js
git commit -m "feat(synth): add application entry point with graceful shutdown"
```

---

### Task 15: Run full test suite

- [ ] **Step 1: Run all tests**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run
```

Expected: All tests PASS (config: 2, pool: 1, enqueue: 2, zulip: 2, wikijs: 3, extractor: 3, openbrain: 2, worker: 1 = **16 tests total**)

- [ ] **Step 2: Final commit with all files**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add -A synth-stack/
git commit -m "feat(synth): Memory Synthesizer v0.1.0 — complete Phase 1A pipeline"
```
