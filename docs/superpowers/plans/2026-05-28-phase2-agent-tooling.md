# Phase 2: Agent Tooling & Synthesizer Controls — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build MCP tools inside `synth-stack` so Hermes/Zella can post messages to Zulip, create/update Wiki.js pages, and manage the Synthesizer pipeline (pause/resume, reprocess, backfill).

**Architecture:** Embed an MCP server directly into the existing `synth-stack` Fastify application. Expose it via the Streamable HTTP transport at `/mcp`. Register the server with Hermes via `mcp-remote`. Add a `system_config` table to `synth-postgres` for durable pause/resume state. API clients for Zulip (REST) and Wiki.js (GraphQL) are thin wrappers in dedicated files.

**Tech Stack:** Node.js 22, Fastify 5, `@modelcontextprotocol/sdk` (McpServer + StreamableHTTPServerTransport), `pg` (Postgres), Vitest (tests)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `synth-stack/src/clients/zulip.js` | Zulip REST API client (post message) |
| `synth-stack/src/clients/wikijs.js` | Wiki.js GraphQL API client (create/update page) |
| `synth-stack/src/mcp/server.js` | MCP server instance, tool definitions |
| `synth-stack/src/mcp/transport.js` | Fastify route registration for Streamable HTTP |
| `synth-stack/src/db/migrations/002-system-config.sql` | Migration for `system_config` table |
| `synth-stack/tests/clients/zulip.test.js` | Unit tests for Zulip client |
| `synth-stack/tests/clients/wikijs.test.js` | Unit tests for Wiki.js client |
| `synth-stack/tests/mcp/server.test.js` | Unit tests for MCP tool handlers |
| `synth-stack/tests/mcp/transport.test.js` | Integration test for /mcp endpoint |

### Modified Files

| File | Change |
|------|--------|
| `synth-stack/package.json` | Add `@modelcontextprotocol/sdk` dependency |
| `synth-stack/.env.example` | Add Zulip API and Wiki.js API env vars |
| `synth-stack/.env` | Add Zulip API and Wiki.js API env vars (live) |
| `synth-stack/src/config.js` | Add `zulip.apiUrl`, `zulip.email`, `zulip.apiKey`, `wikijs.apiUrl`, `wikijs.apiKey` to config |
| `synth-stack/src/index.js` | Import and register MCP transport routes |
| `synth-stack/src/queue/worker.js` | Check `system_config.is_paused` before processing batches |

---

## Chunk 1: Foundation — Dependencies, Config, and Migration

### Task 1: Install MCP SDK dependency

**Files:**
- Modify: `synth-stack/package.json`

- [ ] **Step 1: Install `@modelcontextprotocol/sdk`**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npm install @modelcontextprotocol/sdk
```

- [ ] **Step 2: Verify it installed correctly**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
node -e "import('@modelcontextprotocol/sdk/server/mcp.js').then(m => console.log('McpServer:', typeof m.McpServer))"
```

Expected: `McpServer: function`

- [ ] **Step 3: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
git add package.json package-lock.json
git commit -m "chore: add @modelcontextprotocol/sdk dependency"
```

---

### Task 2: Add Zulip and Wiki.js API config

**Files:**
- Modify: `synth-stack/.env.example`
- Modify: `synth-stack/.env`
- Modify: `synth-stack/src/config.js`

- [ ] **Step 1: Write the failing test**

Create file `synth-stack/tests/config-phase2.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/config-phase2.test.js
```

Expected: FAIL — the new fields (`botEmail`, `botApiKey`, `apiUrl` for Zulip) are not yet in the config output.

- [ ] **Step 3: Update `.env.example`**

Append the following lines to `synth-stack/.env.example`:

```env
# --- Zulip API (for posting messages) ---
ZULIP_API_URL=http://zulip:80
ZULIP_BOT_EMAIL=memory-synthesizer-bot@chat.zb.example.com
ZULIP_BOT_API_KEY=change_me

# --- Wiki.js API (for creating/updating pages) ---
WIKIJS_API_URL=http://wikijs:3000/graphql
WIKIJS_API_KEY=change_me
```

- [ ] **Step 4: Update `.env`**

Append the same block to `synth-stack/.env` with placeholder values (these will be replaced during deployment with real values from the VM):

```env
# --- Zulip API (for posting messages) ---
ZULIP_API_URL=http://zulip:80
ZULIP_BOT_EMAIL=memory-synthesizer-bot@chat.zb.example.com
ZULIP_BOT_API_KEY=change_me

# --- Wiki.js API (for creating/updating pages) ---
# Already present from poller config — no duplicate needed
```

> **Note:** `WIKIJS_API_URL` and `WIKIJS_API_KEY` are already consumed by the poller in `config.js`. We just need to add the Zulip fields.

- [ ] **Step 5: Update `src/config.js`**

Add `ZULIP_API_URL`, `ZULIP_BOT_EMAIL`, and `ZULIP_BOT_API_KEY` to the config loader. These are **optional** (not in `REQUIRED`) because the Synthesizer should still boot even if Zulip posting isn't configured yet.

In `synth-stack/src/config.js`, modify the `zulip` block in the return object:

Replace:
```js
    zulip: {
      webhookSecret: process.env.ZULIP_WEBHOOK_SECRET || '',
    },
```

With:
```js
    zulip: {
      webhookSecret: process.env.ZULIP_WEBHOOK_SECRET || '',
      apiUrl: process.env.ZULIP_API_URL || '',
      botEmail: process.env.ZULIP_BOT_EMAIL || '',
      botApiKey: process.env.ZULIP_BOT_API_KEY || '',
    },
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/config-phase2.test.js
```

Expected: PASS

Also run the full test suite to make sure nothing broke:

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run
```

Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
git add .env.example .env src/config.js tests/config-phase2.test.js
git commit -m "feat: add Zulip API and Wiki.js API config fields"
```

---

### Task 3: Add `system_config` migration

**Files:**
- Create: `synth-stack/src/db/migrations/002-system-config.sql`

- [ ] **Step 1: Create the migration file**

Create `synth-stack/src/db/migrations/002-system-config.sql`:

```sql
-- System configuration table for the Memory Synthesizer.
-- Stores durable global flags like pause state.
-- Uses a key/value pattern for flexibility.

CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the initial pause state (not paused)
INSERT INTO system_config (key, value)
VALUES ('worker_paused', 'false')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Verify migration numbering**

```bash
ls -la /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack/src/db/migrations/
```

Expected: `001-init.sql` and `002-system-config.sql` exist, in order.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
git add src/db/migrations/002-system-config.sql
git commit -m "feat: add system_config migration for pause/resume state"
```

---

## Chunk 2: API Clients — Zulip and Wiki.js

### Task 4: Zulip REST API client

**Files:**
- Create: `synth-stack/src/clients/zulip.js`
- Create: `synth-stack/tests/clients/zulip.test.js`

- [ ] **Step 1: Write the failing test**

Create `synth-stack/tests/clients/zulip.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('clients/zulip', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts a stream message to the Zulip API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 42, msg: '' }),
    });

    const { postMessage } = await import('../../src/clients/zulip.js');
    const config = {
      zulip: {
        apiUrl: 'http://zulip:80',
        botEmail: 'bot@zulip.example',
        botApiKey: 'testkey123',
      },
    };

    const result = await postMessage(config, {
      type: 'stream',
      to: 'engineering',
      topic: 'test-topic',
      content: 'Hello from MCP!',
    });

    expect(result).toEqual({ id: 42, msg: '' });

    // Verify the fetch was called correctly
    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('http://zulip:80/api/v1/messages');
    expect(opts.method).toBe('POST');
    // Basic auth header: base64(bot@zulip.example:testkey123)
    expect(opts.headers['Authorization']).toContain('Basic');
    // Body should be URL-encoded form data
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = opts.body;
    expect(body).toContain('type=stream');
    expect(body).toContain('to=engineering');
    expect(body).toContain('topic=test-topic');
    expect(body).toContain('content=Hello+from+MCP');
  });

  it('posts a direct (private) message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 43, msg: '' }),
    });

    const { postMessage } = await import('../../src/clients/zulip.js');
    const config = {
      zulip: {
        apiUrl: 'http://zulip:80',
        botEmail: 'bot@zulip.example',
        botApiKey: 'testkey123',
      },
    };

    const result = await postMessage(config, {
      type: 'direct',
      to: JSON.stringify(['jay@example.com']),
      content: 'Private message from MCP',
    });

    expect(result.id).toBe(43);
  });

  it('throws on non-200 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ msg: 'Invalid API key', result: 'error' }),
    });

    const { postMessage } = await import('../../src/clients/zulip.js');
    const config = {
      zulip: {
        apiUrl: 'http://zulip:80',
        botEmail: 'bot@zulip.example',
        botApiKey: 'badkey',
      },
    };

    await expect(
      postMessage(config, { type: 'stream', to: 'test', topic: 'test', content: 'hi' })
    ).rejects.toThrow('Zulip API error');
  });

  it('throws if Zulip config is missing', async () => {
    const { postMessage } = await import('../../src/clients/zulip.js');
    const config = { zulip: { apiUrl: '', botEmail: '', botApiKey: '' } };

    await expect(
      postMessage(config, { type: 'stream', to: 'test', topic: 'test', content: 'hi' })
    ).rejects.toThrow('Zulip API not configured');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/clients/zulip.test.js
```

Expected: FAIL — `../../src/clients/zulip.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `synth-stack/src/clients/zulip.js`:

```js
/**
 * Zulip REST API client.
 *
 * Uses the Zulip POST /api/v1/messages endpoint.
 * Docs: https://zulip.com/api/send-message
 *
 * Authentication: HTTP Basic Auth with bot email + API key.
 */

/**
 * Post a message to Zulip.
 *
 * @param {object} config - App config (must have config.zulip.apiUrl, .botEmail, .botApiKey)
 * @param {object} params
 * @param {string} params.type - 'stream' or 'direct' (or 'private')
 * @param {string} params.to - Stream name (for stream) or JSON array of emails (for direct)
 * @param {string} [params.topic] - Topic name (required for stream messages)
 * @param {string} params.content - Message content (Zulip Markdown)
 * @returns {Promise<{id: number, msg: string}>}
 * @throws {Error} If config is missing or API returns an error.
 */
export async function postMessage(config, { type, to, topic, content }) {
  if (!config.zulip.apiUrl || !config.zulip.botEmail || !config.zulip.botApiKey) {
    throw new Error('Zulip API not configured: set ZULIP_API_URL, ZULIP_BOT_EMAIL, ZULIP_BOT_API_KEY');
  }

  const url = `${config.zulip.apiUrl}/api/v1/messages`;

  // Build URL-encoded form body (Zulip API expects form data, not JSON)
  const params = new URLSearchParams();
  params.set('type', type);
  params.set('to', to);
  if (topic) params.set('topic', topic);
  params.set('content', content);

  // HTTP Basic Auth: base64(email:apiKey)
  const credentials = Buffer.from(`${config.zulip.botEmail}:${config.zulip.botApiKey}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`Zulip API error: ${response.status} ${response.statusText} — ${errorBody.msg || 'unknown'}`);
  }

  return response.json();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/clients/zulip.test.js
```

Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
git add src/clients/zulip.js tests/clients/zulip.test.js
git commit -m "feat: add Zulip REST API client for posting messages"
```

---

### Task 5: Wiki.js GraphQL API client

**Files:**
- Create: `synth-stack/src/clients/wikijs.js`
- Create: `synth-stack/tests/clients/wikijs.test.js`

- [ ] **Step 1: Write the failing test**

Create `synth-stack/tests/clients/wikijs.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('clients/wikijs', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates a new page via GraphQL mutation', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          pages: {
            create: {
              responseResult: { succeeded: true, errorCode: 0, message: '' },
              page: { id: 101, path: 'homelab/test', title: 'Test Page' },
            },
          },
        },
      }),
    });

    const { createPage } = await import('../../src/clients/wikijs.js');
    const config = {
      wikijs: {
        apiUrl: 'http://wikijs:3000/graphql',
        apiKey: 'wikijs-test-key',
      },
    };

    const result = await createPage(config, {
      path: 'homelab/test',
      title: 'Test Page',
      content: '# Test\n\nHello world',
      description: 'A test page',
    });

    expect(result.succeeded).toBe(true);
    expect(result.page.id).toBe(101);

    // Verify GraphQL mutation was sent
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('http://wikijs:3000/graphql');
    expect(opts.headers['Authorization']).toBe('Bearer wikijs-test-key');
    const body = JSON.parse(opts.body);
    expect(body.query).toContain('mutation');
    expect(body.query).toContain('create');
  });

  it('updates an existing page via GraphQL mutation', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          pages: {
            update: {
              responseResult: { succeeded: true, errorCode: 0, message: '' },
              page: { id: 101, path: 'homelab/test', title: 'Updated Title' },
            },
          },
        },
      }),
    });

    const { updatePage } = await import('../../src/clients/wikijs.js');
    const config = {
      wikijs: {
        apiUrl: 'http://wikijs:3000/graphql',
        apiKey: 'wikijs-test-key',
      },
    };

    const result = await updatePage(config, {
      id: 101,
      title: 'Updated Title',
      content: '# Updated\n\nNew content',
      description: 'Updated description',
    });

    expect(result.succeeded).toBe(true);
    expect(result.page.title).toBe('Updated Title');
  });

  it('throws on GraphQL error response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          pages: {
            create: {
              responseResult: { succeeded: false, errorCode: 1, message: 'Page already exists' },
              page: null,
            },
          },
        },
      }),
    });

    const { createPage } = await import('../../src/clients/wikijs.js');
    const config = {
      wikijs: { apiUrl: 'http://wikijs:3000/graphql', apiKey: 'key' },
    };

    await expect(
      createPage(config, { path: 'test', title: 'Test', content: 'hi' })
    ).rejects.toThrow('Page already exists');
  });

  it('throws if Wiki.js config is missing', async () => {
    const { createPage } = await import('../../src/clients/wikijs.js');
    const config = { wikijs: { apiUrl: '', apiKey: '' } };

    await expect(
      createPage(config, { path: 'test', title: 'Test', content: 'hi' })
    ).rejects.toThrow('Wiki.js API not configured');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/clients/wikijs.test.js
```

Expected: FAIL — `../../src/clients/wikijs.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `synth-stack/src/clients/wikijs.js`:

```js
/**
 * Wiki.js GraphQL API client.
 *
 * Uses the Wiki.js GraphQL endpoint for page mutations.
 * Docs: https://docs.requarks.io/dev/api
 *
 * Authentication: Bearer token in Authorization header.
 */

/**
 * Send a GraphQL request to Wiki.js.
 *
 * @param {object} config - App config
 * @param {string} query - GraphQL query/mutation string
 * @returns {Promise<object>} The `data` field of the GraphQL response.
 */
async function graphql(config, query) {
  if (!config.wikijs.apiUrl || !config.wikijs.apiKey) {
    throw new Error('Wiki.js API not configured: set WIKIJS_API_URL, WIKIJS_API_KEY');
  }

  const response = await fetch(config.wikijs.apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.wikijs.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Wiki.js API HTTP error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(`Wiki.js GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

/**
 * Escape a string for safe inclusion in a GraphQL query.
 * Handles quotes, backslashes, and newlines.
 */
function escapeGql(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Create a new Wiki.js page.
 *
 * @param {object} config - App config
 * @param {object} params
 * @param {string} params.path - Page path (e.g. 'homelab/docker')
 * @param {string} params.title - Page title
 * @param {string} params.content - Page content (Markdown)
 * @param {string} [params.description] - Page description
 * @param {string} [params.locale] - Locale (default: 'en')
 * @returns {Promise<{succeeded: boolean, page: {id: number, path: string, title: string}}>}
 */
export async function createPage(config, { path, title, content, description = '', locale = 'en' }) {
  const mutation = `
    mutation {
      pages {
        create(
          title: "${escapeGql(title)}",
          content: "${escapeGql(content)}",
          description: "${escapeGql(description)}",
          editor: "markdown",
          isPublished: true,
          isPrivate: false,
          locale: "${escapeGql(locale)}",
          path: "${escapeGql(path)}",
          tags: []
        ) {
          responseResult {
            succeeded
            errorCode
            message
          }
          page {
            id
            path
            title
          }
        }
      }
    }
  `;

  const data = await graphql(config, mutation);
  const result = data.pages.create;

  if (!result.responseResult.succeeded) {
    throw new Error(`Wiki.js create failed: ${result.responseResult.message} (code ${result.responseResult.errorCode})`);
  }

  return { succeeded: true, page: result.page };
}

/**
 * Update an existing Wiki.js page.
 *
 * @param {object} config - App config
 * @param {object} params
 * @param {number} params.id - Page ID to update
 * @param {string} params.title - New title
 * @param {string} params.content - New content (Markdown)
 * @param {string} [params.description] - New description
 * @param {string} [params.locale] - Locale (default: 'en')
 * @returns {Promise<{succeeded: boolean, page: {id: number, path: string, title: string}}>}
 */
export async function updatePage(config, { id, title, content, description = '', locale = 'en' }) {
  const mutation = `
    mutation {
      pages {
        update(
          id: ${id},
          title: "${escapeGql(title)}",
          content: "${escapeGql(content)}",
          description: "${escapeGql(description)}",
          editor: "markdown",
          isPublished: true,
          isPrivate: false,
          locale: "${escapeGql(locale)}",
          tags: []
        ) {
          responseResult {
            succeeded
            errorCode
            message
          }
          page {
            id
            path
            title
          }
        }
      }
    }
  `;

  const data = await graphql(config, mutation);
  const result = data.pages.update;

  if (!result.responseResult.succeeded) {
    throw new Error(`Wiki.js update failed: ${result.responseResult.message} (code ${result.responseResult.errorCode})`);
  }

  return { succeeded: true, page: result.page };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/clients/wikijs.test.js
```

Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
git add src/clients/wikijs.js tests/clients/wikijs.test.js
git commit -m "feat: add Wiki.js GraphQL API client for page create/update"
```

---

## Chunk 3: MCP Server and Tool Definitions

### Task 6: MCP server with tool definitions

**Files:**
- Create: `synth-stack/src/mcp/server.js`
- Create: `synth-stack/tests/mcp/server.test.js`

- [ ] **Step 1: Write the failing test**

Create `synth-stack/tests/mcp/server.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We'll test that the MCP server is created and has the correct tools registered.
// We mock the API clients and pool so no real I/O happens.

describe('mcp/server', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('createMcpServer returns a server with the expected tools', async () => {
    const { createMcpServer } = await import('../../src/mcp/server.js');
    const mockPool = { query: vi.fn() };
    const mockConfig = {
      zulip: { apiUrl: 'http://zulip:80', botEmail: 'bot@test', botApiKey: 'key' },
      wikijs: { apiUrl: 'http://wikijs:3000/graphql', apiKey: 'key' },
      worker: { pollIntervalMs: 5000, batchSize: 10, maxRetries: 3 },
    };

    const server = createMcpServer(mockPool, mockConfig);

    // The server should exist
    expect(server).toBeDefined();
    // It should be an instance with a connect method
    expect(typeof server.connect).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/mcp/server.test.js
```

Expected: FAIL — `../../src/mcp/server.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `synth-stack/src/mcp/server.js`:

```js
/**
 * MCP Server for Z-Brain Synthesizer.
 *
 * Exposes tools that allow Hermes/Zella to:
 *   - Post messages to Zulip
 *   - Create/update Wiki.js pages
 *   - Pause/resume the Synthesizer worker
 *   - Force-reprocess failed/quarantined events
 *   - Trigger a backfill for a given time range
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { postMessage as zulipPostMessage } from '../clients/zulip.js';
import { createPage, updatePage } from '../clients/wikijs.js';

/**
 * Create and configure the MCP server.
 *
 * @param {import('pg').Pool} pool - Postgres pool for synth-postgres
 * @param {object} config - App config from loadConfig()
 * @returns {McpServer} Configured MCP server instance
 */
export function createMcpServer(pool, config) {
  const server = new McpServer({
    name: 'z-brain-synth-mcp',
    version: '0.1.0',
  });

  // ─── Zulip Tools ───────────────────────────────────────

  server.tool(
    'zulip_post_message',
    'Post a message to a Zulip stream/topic or send a direct message.',
    {
      type: z.enum(['stream', 'direct']).describe('Message type: "stream" for channel messages, "direct" for private messages'),
      to: z.string().describe('Stream name (for stream messages) or JSON array of user emails (for direct messages)'),
      topic: z.string().optional().describe('Topic name (required for stream messages)'),
      content: z.string().describe('Message content in Zulip Markdown format'),
    },
    async ({ type, to, topic, content }) => {
      try {
        const result = await zulipPostMessage(config, { type, to, topic, content });
        return {
          content: [{ type: 'text', text: `✅ Message posted to Zulip (ID: ${result.id})` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Zulip error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Wiki.js Tools ─────────────────────────────────────

  server.tool(
    'wikijs_create_page',
    'Create a new page in Wiki.js.',
    {
      path: z.string().describe('Page path (e.g. "homelab/docker/traefik")'),
      title: z.string().describe('Page title'),
      content: z.string().describe('Page content in Markdown format'),
      description: z.string().optional().describe('Short page description'),
    },
    async ({ path, title, content, description }) => {
      try {
        const result = await createPage(config, { path, title, content, description });
        return {
          content: [{ type: 'text', text: `✅ Wiki page created: "${result.page.title}" (ID: ${result.page.id}, path: ${result.page.path})` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Wiki.js error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'wikijs_update_page',
    'Update an existing page in Wiki.js.',
    {
      id: z.number().describe('Page ID to update'),
      title: z.string().describe('New page title'),
      content: z.string().describe('New page content in Markdown format'),
      description: z.string().optional().describe('New page description'),
    },
    async ({ id, title, content, description }) => {
      try {
        const result = await updatePage(config, { id, title, content, description });
        return {
          content: [{ type: 'text', text: `✅ Wiki page updated: "${result.page.title}" (ID: ${result.page.id})` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Wiki.js error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Synthesizer Control Tools ─────────────────────────

  server.tool(
    'synthesizer_pause',
    'Pause the Synthesizer worker. No new events will be processed until resumed.',
    {},
    async () => {
      try {
        await pool.query(
          `INSERT INTO system_config (key, value, updated_at) VALUES ('worker_paused', 'true', NOW())
           ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW()`
        );
        return {
          content: [{ type: 'text', text: '⏸️ Synthesizer worker paused. Use synthesizer_resume to resume.' }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Failed to pause: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'synthesizer_resume',
    'Resume the Synthesizer worker after a pause.',
    {},
    async () => {
      try {
        await pool.query(
          `INSERT INTO system_config (key, value, updated_at) VALUES ('worker_paused', 'false', NOW())
           ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = NOW()`
        );
        return {
          content: [{ type: 'text', text: '▶️ Synthesizer worker resumed.' }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Failed to resume: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'synthesizer_status',
    'Get the current status of the Synthesizer (pause state + queue stats).',
    {},
    async () => {
      try {
        const pauseResult = await pool.query(
          `SELECT value FROM system_config WHERE key = 'worker_paused'`
        );
        const isPaused = pauseResult.rows[0]?.value === 'true';

        const statsResult = await pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'pending') AS pending,
            COUNT(*) FILTER (WHERE status = 'processing') AS processing,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed
          FROM events
        `);
        const stats = statsResult.rows[0];

        const quarantineResult = await pool.query(
          `SELECT COUNT(*) AS count FROM processed_memories WHERE quarantined = TRUE AND reviewed_at IS NULL`
        );
        const quarantined = quarantineResult.rows[0].count;

        const text = [
          `Worker: ${isPaused ? '⏸️ PAUSED' : '▶️ RUNNING'}`,
          `Queue: ${stats.pending} pending, ${stats.processing} processing, ${stats.completed} completed, ${stats.failed} failed`,
          `Quarantine: ${quarantined} items awaiting review`,
        ].join('\n');

        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Status check failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'synthesizer_force_reprocess',
    'Move a failed or quarantined event back to pending for reprocessing.',
    {
      event_id: z.string().describe('UUID of the event to reprocess'),
    },
    async ({ event_id }) => {
      try {
        const result = await pool.query(
          `UPDATE events SET status = 'pending', retry_count = 0, error_message = NULL
           WHERE id = $1 AND status IN ('failed', 'quarantined')
           RETURNING id`,
          [event_id]
        );

        if (result.rowCount === 0) {
          return {
            content: [{ type: 'text', text: `⚠️ Event ${event_id} not found or not in failed/quarantined state.` }],
          };
        }

        return {
          content: [{ type: 'text', text: `🔄 Event ${event_id} moved back to pending for reprocessing.` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Reprocess failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'synthesizer_backfill',
    'Trigger a backfill by resetting all events in a time range back to pending.',
    {
      start_date: z.string().describe('ISO 8601 start date (e.g. "2026-05-01T00:00:00Z")'),
      end_date: z.string().describe('ISO 8601 end date (e.g. "2026-05-28T23:59:59Z")'),
      source: z.enum(['zulip', 'wikijs']).optional().describe('Optional: limit backfill to a specific source'),
    },
    async ({ start_date, end_date, source }) => {
      try {
        let query = `UPDATE events SET status = 'pending', retry_count = 0, error_message = NULL
                      WHERE created_at >= $1 AND created_at <= $2`;
        const params = [start_date, end_date];

        if (source) {
          query += ` AND source = $3`;
          params.push(source);
        }

        query += ` RETURNING id`;
        const result = await pool.query(query, params);

        return {
          content: [{ type: 'text', text: `🔄 Backfill triggered: ${result.rowCount} events reset to pending.` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Backfill failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}
```

- [ ] **Step 4: Install zod (required by McpServer for tool schemas)**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npm install zod
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/mcp/server.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
git add src/mcp/server.js tests/mcp/server.test.js package.json package-lock.json
git commit -m "feat: add MCP server with Zulip, Wiki.js, and Synthesizer control tools"
```

---

### Task 7: Streamable HTTP transport and Fastify routes

**Files:**
- Create: `synth-stack/src/mcp/transport.js`
- Create: `synth-stack/tests/mcp/transport.test.js`

- [ ] **Step 1: Write the failing test**

Create `synth-stack/tests/mcp/transport.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';

describe('mcp/transport', () => {
  it('registerMcpRoutes adds a POST /mcp route to the Fastify app', async () => {
    const { registerMcpRoutes } = await import('../../src/mcp/transport.js');

    // Minimal mock Fastify app
    const routes = [];
    const mockApp = {
      post: vi.fn((path, opts, handler) => {
        routes.push({ method: 'POST', path, handler: handler || opts });
      }),
      get: vi.fn((path, opts, handler) => {
        routes.push({ method: 'GET', path, handler: handler || opts });
      }),
      delete: vi.fn((path, opts, handler) => {
        routes.push({ method: 'DELETE', path, handler: handler || opts });
      }),
      addContentTypeParser: vi.fn(),
    };
    const mockPool = { query: vi.fn() };
    const mockConfig = {
      zulip: { apiUrl: '', botEmail: '', botApiKey: '' },
      wikijs: { apiUrl: '', apiKey: '' },
      worker: { pollIntervalMs: 5000, batchSize: 10, maxRetries: 3 },
    };

    registerMcpRoutes(mockApp, mockPool, mockConfig);

    // Verify the /mcp POST route was registered
    const mcpPostRoute = routes.find(r => r.method === 'POST' && r.path === '/mcp');
    expect(mcpPostRoute).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/mcp/transport.test.js
```

Expected: FAIL — `../../src/mcp/transport.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `synth-stack/src/mcp/transport.js`:

```js
/**
 * MCP Streamable HTTP transport integration for Fastify.
 *
 * Registers a POST /mcp endpoint that handles JSON-RPC messages
 * using the MCP SDK's StreamableHTTPServerTransport.
 *
 * Hermes connects to this via mcp-remote:
 *   npx -y mcp-remote http://synth-app:3080/mcp --allow-http
 */

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from './server.js';

/**
 * Register MCP routes on a Fastify instance.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {import('pg').Pool} pool
 * @param {object} config
 */
export function registerMcpRoutes(app, pool, config) {
  // Session store: maps sessionId → transport
  const sessions = new Map();

  // Create the MCP server (tools are registered here)
  const mcpServer = createMcpServer(pool, config);

  // Handle JSON-RPC messages via POST /mcp
  app.post('/mcp', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'];
    let transport;

    if (sessionId && sessions.has(sessionId)) {
      // Reuse existing session
      transport = sessions.get(sessionId);
    } else if (!sessionId && isInitializeRequest(request.body)) {
      // New session — create transport and connect
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Use default UUID generator
      });

      // Connect MCP server to this transport
      await mcpServer.connect(transport);

      // Store the session
      sessions.set(transport.sessionId, transport);

      // Cleanup on close
      transport.onclose = () => {
        sessions.delete(transport.sessionId);
      };
    } else {
      // Invalid — no session and not an initialize request
      return reply.code(400).send({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session. Send an initialize request first.' },
        id: null,
      });
    }

    // Delegate to the transport's request handler
    // StreamableHTTPServerTransport.handleRequest expects (req, res, body)
    await transport.handleRequest(request.raw, reply.raw, request.body);

    // Mark reply as sent (Fastify should not try to send again)
    reply.hijack();
  });

  // Handle GET /mcp for SSE-based notifications (optional, for clients that want server-to-client push)
  app.get('/mcp', async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'];
    if (!sessionId || !sessions.has(sessionId)) {
      return reply.code(400).send({ error: 'Invalid or missing session ID' });
    }

    const transport = sessions.get(sessionId);
    await transport.handleRequest(request.raw, reply.raw);
    reply.hijack();
  });

  // Handle DELETE /mcp for session termination
  app.delete('/mcp', async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'];
    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId);
      await transport.close();
      sessions.delete(sessionId);
    }
    return reply.code(200).send({ status: 'session terminated' });
  });

  console.log('  MCP Streamable HTTP transport registered at POST /mcp');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/mcp/transport.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
git add src/mcp/transport.js tests/mcp/transport.test.js
git commit -m "feat: add Streamable HTTP transport for MCP server"
```

---

## Chunk 4: Integration — Wire Into Synth-Stack and Worker Pause Logic

### Task 8: Register MCP routes in the main Fastify app

**Files:**
- Modify: `synth-stack/src/index.js`

- [ ] **Step 1: Add the MCP route import and registration to `src/index.js`**

Add after the existing import block (line ~9):

```js
import { registerMcpRoutes } from './mcp/transport.js';
```

Add after the existing route registrations (after `registerWikiJsWebhook(app, pool, config);`, around line 41):

```js
  registerMcpRoutes(app, pool, config);
```

The resulting modified `index.js` should have these lines in context:

```js
  // 5. Register routes
  registerHealthRoutes(app, pool);
  registerZulipWebhook(app, pool, config);
  registerWikiJsWebhook(app, pool, config);
  registerMcpRoutes(app, pool, config);
```

- [ ] **Step 2: Verify the full test suite still passes**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
git add src/index.js
git commit -m "feat: register MCP routes in Synthesizer main app"
```

---

### Task 9: Add pause-check to the worker

**Files:**
- Modify: `synth-stack/src/queue/worker.js`

- [ ] **Step 1: Write the failing test**

Add a new test to the existing `synth-stack/tests/queue/worker.test.js`:

```js
  it('processBatch skips processing when worker is paused', async () => {
    const { processBatch } = await import('../../src/queue/worker.js');
    const pool = createMockPool();

    // Mock: system_config says worker is paused
    const mockClient = {
      query: vi.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ value: 'true' }] }) // SELECT system_config
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

    // Should have checked the pause flag but NOT issued the SELECT FOR UPDATE query
    const queries = mockClient.query.mock.calls.map(c => c[0]);
    expect(queries).toContain('BEGIN');
    // The pause check query
    expect(queries.some(q => typeof q === 'string' && q.includes('system_config'))).toBe(true);
    // Should NOT have the SKIP LOCKED query
    expect(queries.some(q => typeof q === 'string' && q.includes('SKIP LOCKED'))).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/queue/worker.test.js
```

Expected: FAIL — the worker doesn't check `system_config` yet.

- [ ] **Step 3: Modify the worker to check the pause flag**

In `synth-stack/src/queue/worker.js`, modify the `processBatch` function. Add a pause check right after `BEGIN` and before the `SELECT FOR UPDATE SKIP LOCKED` query.

Replace lines 26-43 (the section from `await client.query('BEGIN')` through the early return on empty events):

```js
    await client.query('BEGIN');

    // Check if the worker is paused
    const pauseResult = await client.query(
      `SELECT value FROM system_config WHERE key = 'worker_paused'`
    );
    const isPaused = pauseResult.rows[0]?.value === 'true';

    if (isPaused) {
      await client.query('COMMIT');
      return;
    }

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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
npx vitest run tests/queue/worker.test.js
```

Expected: PASS (both old and new tests)

- [ ] **Step 5: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
git add src/queue/worker.js tests/queue/worker.test.js
git commit -m "feat: worker checks system_config pause flag before processing"
```

---

## Chunk 5: Deployment — VM Configuration and Hermes Registration

### Task 10: Deploy updated synth-stack to VM

**Files:**
- Local workspace changes to be rsynced to VM

- [ ] **Step 1: Rsync the updated synth-stack to the VM**

```bash
rsync -av --exclude='node_modules' --exclude='.env' --exclude='data' \
  /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack/ \
  YOUR_VM_USER@YOUR_VM_IP:~/docker/synth-stack/
```

- [ ] **Step 2: Update `.env` on the VM with Zulip API credentials**

First, get the Zulip bot API key. You need to create a bot in Zulip if one doesn't exist:
1. Log into `https://chat.zb.example.com`
2. Go to **Settings → Your Bots** (or **Organization → Bots**)
3. Find the Memory Synthesizer bot (or create a new **Generic** bot — NOT outgoing webhook)
4. Copy the bot's **email** and **API key**

Then update the `.env` on the VM:

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cat >> ~/docker/synth-stack/.env << 'ENVEOF'

# --- Zulip API (for posting messages) ---
ZULIP_API_URL=http://zulip:80
ZULIP_BOT_EMAIL=REPLACE_WITH_BOT_EMAIL
ZULIP_BOT_API_KEY=REPLACE_WITH_BOT_API_KEY
ENVEOF"
```

> **IMPORTANT for executor:** Replace `REPLACE_WITH_BOT_EMAIL` and `REPLACE_WITH_BOT_API_KEY` with the actual bot credentials from Zulip. The Wiki.js API key (`WIKIJS_API_KEY`) should already be set from the poller configuration.

- [ ] **Step 3: Rebuild and restart the Synthesizer container**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cd ~/docker/synth-stack && docker compose up -d --build"
```

- [ ] **Step 4: Verify the MCP endpoint is responding**

```bash
# Simple health check first
ssh YOUR_VM_USER@YOUR_VM_IP "curl -s http://localhost:3080/health"
```

Expected: `{"status":"ok","service":"memory-synthesizer"}`

```bash
# Send an MCP initialize request to the /mcp endpoint
ssh YOUR_VM_USER@YOUR_VM_IP "curl -s -X POST http://localhost:3080/mcp \
  -H 'Content-Type: application/json' \
  -d '{\"jsonrpc\":\"2.0\",\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-03-26\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1.0\"}},\"id\":1}'"
```

Expected: A JSON-RPC response with `result.serverInfo.name: "z-brain-synth-mcp"` and a list of capabilities.

- [ ] **Step 5: Commit deployment notes**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack
git add -A
git commit -m "chore: deployment sync for Phase 2 agent tooling"
```

---

### Task 11: Register synth-mcp in Hermes config

**Files:**
- Modify: Hermes `config.yaml` (on the VM, NOT the local git checkout)

- [ ] **Step 1: Add the synth-mcp server to Hermes config on the VM**

> **Reminder:** The local workspace at `/Volumes/nvme-2tb/ant-workspace/z-brain/hermes-stack/data/config.yaml` is a git checkout and is NOT the live bind mount. Edit inside the container.

```bash
ssh YOUR_VM_USER@YOUR_VM_IP 'docker exec hermes-agent /opt/hermes/.venv/bin/python3 -c "
import yaml

with open(\"/opt/data/config.yaml\") as f:
    cfg = yaml.safe_load(f)

# Add synth-mcp to the MCP servers
cfg[\"mcp_servers\"][\"synth-mcp\"] = {
    \"command\": \"npx\",
    \"args\": [\"-y\", \"mcp-remote\", \"http://synth-app:3080/mcp\", \"--allow-http\"]
}

with open(\"/opt/data/config.yaml\", \"w\") as f:
    yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

print(\"synth-mcp server added to config.yaml\")
"'
```

- [ ] **Step 2: Restart Hermes to pick up the new MCP config**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cd ~/docker/hermes-stack && docker compose restart hermes-agent"
```

Wait ~15 seconds for Hermes to fully restart:

```bash
sleep 15
curl -s http://YOUR_VM_IP:8642/health/detailed
```

Expected: `"status": "ok"`, `"gateway_state": "running"`

- [ ] **Step 3: Sync the updated config back to the local workspace**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP 'docker cp hermes-agent:/opt/data/config.yaml /tmp/hermes-config.yaml'
scp YOUR_VM_USER@YOUR_VM_IP:/tmp/hermes-config.yaml /Volumes/nvme-2tb/ant-workspace/z-brain/hermes-stack/data/config.yaml
```

- [ ] **Step 4: Commit the synced config**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add hermes-stack/data/config.yaml
git commit -m "feat: register synth-mcp in Hermes agent config"
```

---

### Task 12: End-to-end verification via Zella

- [ ] **Step 1: Test Zulip posting through Zella**

Send a message to Zella via the Hermes API and ask her to use the new tool:

```bash
curl -s http://YOUR_VM_IP:8642/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(grep API_SERVER_KEY /Volumes/nvme-2tb/ant-workspace/z-brain/hermes-stack/.env 2>/dev/null | cut -d= -f2 || ssh YOUR_VM_USER@YOUR_VM_IP 'grep API_SERVER_KEY ~/docker/hermes-stack/.env | cut -d= -f2')" \
  -d '{
    "model": "hermes-agent",
    "messages": [{"role":"user","content":"Use your zulip_post_message tool to post a test message to the engineering stream with topic test-mcp. The content should be: Phase 2 MCP tools are online! 🧠"}],
    "stream": false
  }'
```

Then verify the message appeared in Zulip by checking `https://chat.zb.example.com` or:

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "curl -s -u REPLACE_BOT_EMAIL:REPLACE_BOT_API_KEY http://zulip:80/api/v1/messages?anchor=newest&num_before=1&num_after=0&narrow=%5B%7B%22operator%22%3A%22stream%22%2C%22operand%22%3A%22engineering%22%7D%5D"
```

- [ ] **Step 2: Test Synthesizer status tool**

```bash
curl -s http://YOUR_VM_IP:8642/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(grep API_SERVER_KEY /Volumes/nvme-2tb/ant-workspace/z-brain/hermes-stack/.env 2>/dev/null | cut -d= -f2 || ssh YOUR_VM_USER@YOUR_VM_IP 'grep API_SERVER_KEY ~/docker/hermes-stack/.env | cut -d= -f2')" \
  -d '{
    "model": "hermes-agent",
    "messages": [{"role":"user","content":"Use your synthesizer_status tool to check the current state of the Memory Synthesizer."}],
    "stream": false
  }'
```

Expected: A response showing worker status (RUNNING), queue counts, and quarantine count.

- [ ] **Step 3: Test pause/resume cycle**

Ask Zella to pause the worker, verify it's paused, then resume:

```bash
curl -s http://YOUR_VM_IP:8642/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(grep API_SERVER_KEY /Volumes/nvme-2tb/ant-workspace/z-brain/hermes-stack/.env 2>/dev/null | cut -d= -f2 || ssh YOUR_VM_USER@YOUR_VM_IP 'grep API_SERVER_KEY ~/docker/hermes-stack/.env | cut -d= -f2')" \
  -d '{
    "model": "hermes-agent",
    "messages": [
      {"role":"user","content":"Use synthesizer_pause to pause the worker, then use synthesizer_status to confirm it is paused, then use synthesizer_resume to resume it."}
    ],
    "stream": false
  }'
```

Expected: Zella reports the pause, confirms the status shows PAUSED, then resumes.

---

## Summary of All New and Modified Files

| Action | Path | Purpose |
|--------|------|---------|
| CREATE | `synth-stack/src/clients/zulip.js` | Zulip REST client |
| CREATE | `synth-stack/src/clients/wikijs.js` | Wiki.js GraphQL client |
| CREATE | `synth-stack/src/mcp/server.js` | MCP server + 8 tool definitions |
| CREATE | `synth-stack/src/mcp/transport.js` | Streamable HTTP Fastify routes |
| CREATE | `synth-stack/src/db/migrations/002-system-config.sql` | system_config table |
| CREATE | `synth-stack/tests/clients/zulip.test.js` | Zulip client tests |
| CREATE | `synth-stack/tests/clients/wikijs.test.js` | Wiki.js client tests |
| CREATE | `synth-stack/tests/mcp/server.test.js` | MCP server tests |
| CREATE | `synth-stack/tests/mcp/transport.test.js` | Transport route tests |
| CREATE | `synth-stack/tests/config-phase2.test.js` | Config field tests |
| MODIFY | `synth-stack/package.json` | Add `@modelcontextprotocol/sdk`, `zod` |
| MODIFY | `synth-stack/.env.example` | Add Zulip API vars |
| MODIFY | `synth-stack/.env` | Add Zulip API vars |
| MODIFY | `synth-stack/src/config.js` | Add Zulip API fields to config |
| MODIFY | `synth-stack/src/index.js` | Register MCP routes |
| MODIFY | `synth-stack/src/queue/worker.js` | Add pause-check |
| MODIFY | `hermes-stack/data/config.yaml` | Register synth-mcp server |
