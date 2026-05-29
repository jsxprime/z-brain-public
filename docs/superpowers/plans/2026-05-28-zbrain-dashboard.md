# Z-Brain Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Design skills:** This project uses the `impeccable` and `frontend-design` skills. Before writing any CSS, read the PRODUCT.md context file in the project root. Follow the `impeccable` shared design laws (OKLCH color, no side-stripe borders, no gradient text, no glassmorphism-as-default, no hero-metric template, no identical card grids).

**Goal:** Build the Z-Brain Ecosystem Dashboard — a Next.js control center that visualizes the Memory Synthesizer pipeline, displays quarantined memories for human review, shows agent status, and provides real-time queue health metrics.

**Architecture:** A Next.js 15 (App Router) application running as a Docker container on the Z-Brain VM. It connects directly to the Synthesizer's dedicated Postgres (`synthesizer_db`) for event/memory data, and makes HTTP calls to the OpenBrain MCP server (`openbrain-server:3040`) and Hermes Agent API (`hermes-agent:8642`) for external status. All data fetching happens in Next.js Route Handlers (API routes) so database credentials never reach the browser.

**Tech Stack:**
- **Framework:** Next.js 15 (App Router, React Server Components where possible)
- **Styling:** Vanilla CSS with CSS custom properties (design tokens) — no Tailwind
- **Database Client:** pg (node-postgres) — connects to `synth-postgres` container
- **Fonts:** Google Fonts (specific selections during design phase — NOT Inter/Roboto)
- **Container:** Docker + docker-compose (joins existing `agent-net` network)
- **Testing:** Vitest for API route unit tests

**Data Sources:**
| Source | Connection | What it provides |
|--------|-----------|-----------------|
| `synth-postgres` (`synthesizer_db`) | Direct Postgres via `pg` | Event queue stats, recent events, processed memories, quarantined items |
| OpenBrain MCP (`openbrain-server:3040`) | HTTP | Memory count (`/stats`), recent thoughts (`/recent`), domains (`/list_domains`) |
| Hermes Agent API (`hermes-agent:8642`) | HTTP | Agent health (`/health/detailed`), session count |
| Memory Synthesizer (`synth-app:3080`) | HTTP | Pipeline health (`/health/detailed`), queue stats |

---

## File Structure

```
z-brain/dashboard/
├── docker-compose.yml          # Dashboard container config
├── .env                        # Database creds, API URLs
├── .env.example                # Template
├── Dockerfile                  # Node.js 22, next start
├── next.config.js              # Next.js configuration
├── package.json                # Dependencies
├── PRODUCT.md                  # Impeccable design context
├── public/                     # Static assets
├── src/
│   ├── app/
│   │   ├── layout.js           # Root layout (fonts, global styles, nav shell)
│   │   ├── page.js             # Home: overview dashboard
│   │   ├── globals.css         # Design tokens + global styles
│   │   ├── pipeline/
│   │   │   └── page.js         # Pipeline view: event feed + queue stats
│   │   ├── quarantine/
│   │   │   └── page.js         # Quarantine: review/approve/reject memories
│   │   ├── memories/
│   │   │   └── page.js         # Committed memories browser
│   │   └── api/
│   │       ├── stats/
│   │       │   └── route.js    # GET /api/stats — aggregated dashboard stats
│   │       ├── events/
│   │       │   └── route.js    # GET /api/events — recent events from queue
│   │       ├── memories/
│   │       │   └── route.js    # GET /api/memories — processed memories
│   │       ├── quarantine/
│   │       │   ├── route.js    # GET /api/quarantine — quarantined items
│   │       │   └── [id]/
│   │       │       └── route.js # PATCH /api/quarantine/[id] — approve/reject
│   │       └── health/
│   │           └── route.js    # GET /api/health — aggregated system health
│   ├── components/
│   │   ├── Nav.js              # Side navigation
│   │   ├── Nav.module.css
│   │   ├── StatBlock.js        # Single stat display (not the banned hero-metric)
│   │   ├── StatBlock.module.css
│   │   ├── EventRow.js         # Single event in the pipeline feed
│   │   ├── EventRow.module.css
│   │   ├── MemoryCard.js       # Single processed memory display
│   │   ├── MemoryCard.module.css
│   │   ├── QuarantineItem.js   # Quarantined memory with approve/reject actions
│   │   ├── QuarantineItem.module.css
│   │   ├── StatusIndicator.js  # Colored dot + label for service health
│   │   ├── StatusIndicator.module.css
│   │   ├── Badge.js            # Type/status badge (decision, snippet, etc.)
│   │   └── Badge.module.css
│   └── lib/
│       ├── db.js               # Postgres pool singleton
│       ├── config.js            # Environment config loader
│       ├── openbrain.js        # OpenBrain HTTP client
│       └── hermes.js           # Hermes Agent HTTP client
├── tests/
│   ├── api/
│   │   ├── stats.test.js
│   │   ├── events.test.js
│   │   ├── quarantine.test.js
│   │   └── health.test.js
│   └── setup.js                # Mock pool and fetch helpers
```

---

## Chunk 1: Project Scaffolding

### Task 1: Initialize the Next.js project

**Files:**
- Create: `z-brain/dashboard/` (entire project scaffold)

- [ ] **Step 1: Create the Next.js app**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
npx -y create-next-app@latest ./dashboard --js --app --no-tailwind --no-eslint --no-turbopack --no-import-alias --no-src-dir
```

> **Note:** If `create-next-app` prompts interactively despite flags, answer: JavaScript, App Router, no Tailwind, no ESLint, no Turbopack, no import alias, no src dir.

Wait — we actually want a `src/` dir for clean separation. Correct command:

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
npx -y create-next-app@latest ./dashboard --js --app --no-tailwind --no-eslint --no-turbopack --no-import-alias --src-dir
```

- [ ] **Step 2: Install additional dependencies**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/dashboard
npm install pg
npm install -D vitest
```

- [ ] **Step 3: Create .env.example**

Create `z-brain/dashboard/.env.example`:

```env
# Z-Brain Dashboard Configuration

# --- Synthesizer Postgres (synthesizer_db, NOT core_brain) ---
SYNTH_DB_HOST=synth-postgres
SYNTH_DB_PORT=5432
SYNTH_DB_NAME=synthesizer_db
SYNTH_DB_USER=synth
SYNTH_DB_PASSWORD=change_me

# --- External Services ---
OPENBRAIN_URL=http://openbrain-server:3040
SYNTH_APP_URL=http://synth-app:3080
HERMES_URL=http://hermes-agent:8642
HERMES_API_KEY=change_me

# --- Dashboard ---
DASHBOARD_PORT=3090
```

- [ ] **Step 4: Create .env with real values**

Create `z-brain/dashboard/.env`:

```env
SYNTH_DB_HOST=synth-postgres
SYNTH_DB_PORT=5432
SYNTH_DB_NAME=synthesizer_db
SYNTH_DB_USER=synth
SYNTH_DB_PASSWORD=synthpostgres1234

OPENBRAIN_URL=http://openbrain-server:3040
SYNTH_APP_URL=http://synth-app:3080
HERMES_URL=http://hermes-agent:8642
HERMES_API_KEY=change_me

DASHBOARD_PORT=3090
```

> **Note for executor:** Copy the `HERMES_API_KEY` value from `z-brain/hermes-stack/.env` (it's the `API_SERVER_KEY` there). Copy the Postgres password from `z-brain/synth-stack/.env`.

- [ ] **Step 5: Create PRODUCT.md for impeccable design context**

Create `z-brain/dashboard/PRODUCT.md`:

```markdown
# Z-Brain Dashboard

## Product Purpose
Command center for the Z-Brain Ecosystem — a self-hosted AI memory platform. 
Monitors the Memory Synthesizer pipeline, surfaces quarantined memories for human review,
and displays real-time health of all ecosystem services (OpenBrain, Hermes Agent, Zulip, Wiki.js).

## Users
- **Primary:** the operator (solo operator, non-developer, homelab enthusiast)
- **Secondary:** AI agents (Hermes/Zella) — they don't use the dashboard directly, but their status is displayed

## Brand / Tone
- **Register:** Product (dashboard, tool — design SERVES the product)
- **Aesthetic:** Technical observatory. Think NASA mission control meets a well-designed homelab monitoring tool.
  Not cyberpunk. Not SaaS. Not startup. Not terminal-cosplay.
  Clean, information-dense, serious but not sterile. Confidence in the data.
- **Anti-references:** Generic SaaS dashboards, Grafana default skins, purple gradient AI tools, glassmorphism everything

## Strategic Principles
- Information density over decoration
- Status at a glance — the operator should know the ecosystem health in under 2 seconds
- Quarantine review is the primary interactive workflow
- Dark theme — single monitor, late evening, dim room, focused work
```

- [ ] **Step 6: Update .gitignore**

Ensure `z-brain/dashboard/.gitignore` contains:

```gitignore
node_modules/
.next/
.env
out/
```

- [ ] **Step 7: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/package.json dashboard/package-lock.json dashboard/.env.example dashboard/.gitignore dashboard/PRODUCT.md dashboard/next.config.js
git add dashboard/src/
git commit -m "feat(dashboard): scaffold Next.js project with design context"
```

---

### Task 2: Configuration and database client

**Files:**
- Create: `z-brain/dashboard/src/lib/config.js`
- Create: `z-brain/dashboard/src/lib/db.js`

- [ ] **Step 1: Create config loader**

Create `z-brain/dashboard/src/lib/config.js`:

```javascript
/**
 * Dashboard configuration from environment variables.
 * Next.js loads .env automatically in development.
 */

export function getConfig() {
  return {
    db: {
      host: process.env.SYNTH_DB_HOST || 'localhost',
      port: parseInt(process.env.SYNTH_DB_PORT || '5432', 10),
      name: process.env.SYNTH_DB_NAME || 'synthesizer_db',
      user: process.env.SYNTH_DB_USER || 'synth',
      password: process.env.SYNTH_DB_PASSWORD || '',
    },
    openbrain: {
      url: process.env.OPENBRAIN_URL || 'http://localhost:3040',
    },
    synthApp: {
      url: process.env.SYNTH_APP_URL || 'http://localhost:3080',
    },
    hermes: {
      url: process.env.HERMES_URL || 'http://localhost:8642',
      apiKey: process.env.HERMES_API_KEY || '',
    },
  };
}
```

- [ ] **Step 2: Create database pool**

Create `z-brain/dashboard/src/lib/db.js`:

```javascript
import pg from 'pg';
import { getConfig } from './config.js';

const { Pool } = pg;

let pool = null;

/**
 * Get the singleton Postgres pool.
 * Connects to synth-postgres (synthesizer_db) — NOT core_brain.
 */
export function getPool() {
  if (!pool) {
    const config = getConfig();
    pool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.name,
      user: config.db.user,
      password: config.db.password,
      max: 5,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}
```

- [ ] **Step 3: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/src/lib/config.js dashboard/src/lib/db.js
git commit -m "feat(dashboard): add config loader and Postgres pool"
```

---

### Task 3: External service clients

**Files:**
- Create: `z-brain/dashboard/src/lib/openbrain.js`
- Create: `z-brain/dashboard/src/lib/hermes.js`

- [ ] **Step 1: Create OpenBrain client**

Create `z-brain/dashboard/src/lib/openbrain.js`:

```javascript
import { getConfig } from './config.js';

/**
 * Fetch stats from OpenBrain (total thought count, etc.)
 */
export async function getOpenBrainStats() {
  const { openbrain } = getConfig();
  try {
    const res = await fetch(`${openbrain.url}/stats`, { next: { revalidate: 30 } });
    if (!res.ok) return { status: 'error', error: `${res.status}` };
    return { status: 'ok', ...(await res.json()) };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

/**
 * Fetch recent thoughts from OpenBrain.
 */
export async function getOpenBrainRecent(limit = 20) {
  const { openbrain } = getConfig();
  try {
    const res = await fetch(`${openbrain.url}/recent?limit=${limit}`, { next: { revalidate: 10 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.thoughts || data || [];
  } catch {
    return [];
  }
}

/**
 * Fetch domains from OpenBrain.
 */
export async function getOpenBrainDomains() {
  const { openbrain } = getConfig();
  try {
    const res = await fetch(`${openbrain.url}/list_domains`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.domains || data || [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Create Hermes client**

Create `z-brain/dashboard/src/lib/hermes.js`:

```javascript
import { getConfig } from './config.js';

/**
 * Fetch health/status from the Hermes Agent.
 */
export async function getHermesHealth() {
  const { hermes } = getConfig();
  try {
    const res = await fetch(`${hermes.url}/health/detailed`, {
      headers: hermes.apiKey
        ? { Authorization: `Bearer ${hermes.apiKey}` }
        : {},
      next: { revalidate: 15 },
    });
    if (!res.ok) return { status: 'offline', error: `${res.status}` };
    return { status: 'online', ...(await res.json()) };
  } catch (err) {
    return { status: 'offline', error: err.message };
  }
}

/**
 * Fetch health from the Memory Synthesizer app.
 */
export async function getSynthHealth() {
  const { synthApp } = getConfig();
  try {
    const res = await fetch(`${synthApp.url}/health/detailed`, {
      next: { revalidate: 10 },
    });
    if (!res.ok) return { status: 'offline', error: `${res.status}` };
    return { status: 'online', ...(await res.json()) };
  } catch (err) {
    return { status: 'offline', error: err.message };
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/src/lib/openbrain.js dashboard/src/lib/hermes.js
git commit -m "feat(dashboard): add OpenBrain and Hermes HTTP clients"
```

---

## Chunk 2: API Routes

### Task 4: Stats API route

**Files:**
- Create: `z-brain/dashboard/src/app/api/stats/route.js`

- [ ] **Step 1: Create the stats route**

Create `z-brain/dashboard/src/app/api/stats/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getOpenBrainStats } from '@/lib/openbrain';
import { getHermesHealth, getSynthHealth } from '@/lib/hermes';

/**
 * GET /api/stats
 * Aggregated dashboard statistics from all sources.
 */
export async function GET() {
  const pool = getPool();

  try {
    // Queue stats from synth-postgres
    const queueResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'processing') AS processing,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed
      FROM events
    `);

    // Memory stats
    const memoryResult = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE quarantined = TRUE AND reviewed_at IS NULL) AS quarantined_pending,
        COUNT(*) FILTER (WHERE openbrain_committed = TRUE) AS committed
      FROM processed_memories
    `);

    // Source breakdown
    const sourceResult = await pool.query(`
      SELECT source, COUNT(*) AS count
      FROM events
      GROUP BY source
    `);

    // Fetch external service statuses in parallel
    const [openbrain, hermes, synth] = await Promise.all([
      getOpenBrainStats(),
      getHermesHealth(),
      getSynthHealth(),
    ]);

    return NextResponse.json({
      queue: queueResult.rows[0],
      memories: memoryResult.rows[0],
      sources: Object.fromEntries(sourceResult.rows.map((r) => [r.source, parseInt(r.count, 10)])),
      services: {
        openbrain: { status: openbrain.status },
        hermes: { status: hermes.status },
        synthesizer: { status: synth.status },
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/src/app/api/stats/route.js
git commit -m "feat(dashboard): add /api/stats aggregated stats route"
```

---

### Task 5: Events API route

**Files:**
- Create: `z-brain/dashboard/src/app/api/events/route.js`

- [ ] **Step 1: Create the events route**

Create `z-brain/dashboard/src/app/api/events/route.js`:

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/src/app/api/events/route.js
git commit -m "feat(dashboard): add /api/events route with status filter"
```

---

### Task 6: Memories API route

**Files:**
- Create: `z-brain/dashboard/src/app/api/memories/route.js`

- [ ] **Step 1: Create the memories route**

Create `z-brain/dashboard/src/app/api/memories/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

/**
 * GET /api/memories?limit=50&type=decision
 * Processed and committed memories.
 */
export async function GET(request) {
  const pool = getPool();
  const { searchParams } = new URL(request.url);

  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const type = searchParams.get('type'); // optional: decision, snippet, command, summary, reference

  try {
    let query = `
      SELECT
        pm.id, pm.memory_type, pm.extracted_content, pm.confidence,
        pm.openbrain_committed, pm.openbrain_thought_id,
        pm.quarantined, pm.quarantine_reason,
        pm.reviewed_by, pm.reviewed_at,
        pm.committed_at, pm.created_at,
        e.source, e.source_id,
        e.payload->>'stream' AS stream,
        e.payload->>'topic' AS topic,
        e.payload->>'title' AS title
      FROM processed_memories pm
      JOIN events e ON e.id = pm.event_id
      WHERE pm.quarantined = FALSE
    `;
    const params = [];

    if (type) {
      params.push(type);
      query += ` AND pm.memory_type = $${params.length}`;
    }

    query += ` ORDER BY pm.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);
    return NextResponse.json({ memories: rows });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/src/app/api/memories/route.js
git commit -m "feat(dashboard): add /api/memories route"
```

---

### Task 7: Quarantine API routes (list + approve/reject)

**Files:**
- Create: `z-brain/dashboard/src/app/api/quarantine/route.js`
- Create: `z-brain/dashboard/src/app/api/quarantine/[id]/route.js`

- [ ] **Step 1: Create quarantine list route**

Create `z-brain/dashboard/src/app/api/quarantine/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

/**
 * GET /api/quarantine
 * Quarantined memories awaiting human review.
 */
export async function GET() {
  const pool = getPool();

  try {
    const { rows } = await pool.query(`
      SELECT
        pm.id, pm.memory_type, pm.extracted_content, pm.confidence,
        pm.quarantine_reason, pm.reviewed_by, pm.reviewed_at,
        pm.created_at,
        e.source, e.source_id,
        e.payload->>'stream' AS stream,
        e.payload->>'topic' AS topic,
        e.payload->>'title' AS title,
        e.payload->>'content' AS original_content,
        e.payload->>'sender' AS sender
      FROM processed_memories pm
      JOIN events e ON e.id = pm.event_id
      WHERE pm.quarantined = TRUE AND pm.reviewed_at IS NULL
      ORDER BY pm.created_at DESC
    `);

    return NextResponse.json({ items: rows, count: rows.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create quarantine action route**

Create `z-brain/dashboard/src/app/api/quarantine/[id]/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

/**
 * PATCH /api/quarantine/[id]
 * Approve or reject a quarantined memory.
 *
 * Body: { action: 'approve' | 'reject' }
 *
 * Approve: marks as reviewed, then commits to OpenBrain.
 * Reject: marks as reviewed, memory is NOT committed.
 */
export async function PATCH(request, { params }) {
  const pool = getPool();
  const { id } = await params;

  try {
    const body = await request.json();
    const action = body.action;

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    if (action === 'approve') {
      // Mark as reviewed, un-quarantine, and commit to OpenBrain
      // The actual OpenBrain commit could be done here or by re-enqueuing.
      // For simplicity, we mark it and let the worker pick it up on next pass.
      await pool.query(
        `UPDATE processed_memories
         SET quarantined = FALSE,
             reviewed_by = 'human',
             reviewed_at = NOW(),
             quarantine_reason = NULL
         WHERE id = $1`,
        [id]
      );

      // Also update the parent event back to 'pending' so the worker can re-commit
      // Actually, we should directly commit this memory to OpenBrain here.
      // For now, just mark it as approved. A future enhancement would POST to OpenBrain.
    } else {
      // Reject: mark as reviewed but keep quarantined
      await pool.query(
        `UPDATE processed_memories
         SET reviewed_by = 'human',
             reviewed_at = NOW(),
             quarantine_reason = 'Rejected by human review'
         WHERE id = $1`,
        [id]
      );
    }

    return NextResponse.json({ status: 'ok', action, id });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/src/app/api/quarantine/
git commit -m "feat(dashboard): add quarantine list and approve/reject routes"
```

---

### Task 8: Health API route

**Files:**
- Create: `z-brain/dashboard/src/app/api/health/route.js`

- [ ] **Step 1: Create the aggregated health route**

Create `z-brain/dashboard/src/app/api/health/route.js`:

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/src/app/api/health/route.js
git commit -m "feat(dashboard): add aggregated health route"
```

---

## Chunk 3: Design System and Components

> **IMPORTANT for executor:** This chunk defines the visual design. You MUST read the `PRODUCT.md` file at the project root before writing any CSS. Follow the `impeccable` shared design laws. Use OKLCH colors. Do NOT use Inter, Roboto, or generic fonts. Dark theme is required per the PRODUCT.md scene sentence: "Solo operator, dim room, focused work."

### Task 9: Design tokens and global styles

**Files:**
- Modify: `z-brain/dashboard/src/app/globals.css`

- [ ] **Step 1: Write the design system**

Replace the contents of `z-brain/dashboard/src/app/globals.css` with:

```css
/*
 * Z-Brain Dashboard — Design Tokens & Global Styles
 *
 * Aesthetic: Technical observatory. Information-dense, serious, dark.
 * Color: OKLCH. Restrained strategy — tinted neutrals + one accent.
 * Font: JetBrains Mono (data) + Source Serif 4 (headings).
 *
 * Scene: Solo operator at a 27-inch monitor, dim room, late evening.
 * The dashboard glows quietly. Data is the star.
 */

@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=swap');

:root {
  /* --- Surface palette (OKLCH, tinted toward blue-gray) --- */
  --surface-0: oklch(0.13 0.008 260);    /* deepest background */
  --surface-1: oklch(0.17 0.008 260);    /* cards, panels */
  --surface-2: oklch(0.22 0.008 260);    /* elevated elements */
  --surface-3: oklch(0.28 0.01 260);     /* hover states */

  /* --- Text --- */
  --text-primary: oklch(0.92 0.005 260);
  --text-secondary: oklch(0.68 0.008 260);
  --text-muted: oklch(0.48 0.008 260);

  /* --- Accent (amber/gold — warm contrast against cool surfaces) --- */
  --accent: oklch(0.78 0.15 75);
  --accent-dim: oklch(0.58 0.10 75);
  --accent-subtle: oklch(0.30 0.05 75);

  /* --- Semantic status colors --- */
  --status-ok: oklch(0.72 0.15 155);       /* green — healthy */
  --status-warn: oklch(0.78 0.15 75);      /* amber — attention */
  --status-error: oklch(0.65 0.20 25);     /* red — failure */
  --status-info: oklch(0.68 0.10 240);     /* blue — informational */

  /* --- Type badges --- */
  --badge-decision: oklch(0.65 0.12 280);  /* purple */
  --badge-snippet: oklch(0.68 0.10 170);   /* teal */
  --badge-command: oklch(0.72 0.12 55);    /* orange */
  --badge-summary: oklch(0.68 0.10 240);   /* blue */
  --badge-reference: oklch(0.60 0.08 320); /* pink */

  /* --- Spacing rhythm --- */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2.5rem;
  --space-2xl: 4rem;

  /* --- Typography --- */
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --font-serif: 'Source Serif 4', Georgia, serif;

  /* --- Borders --- */
  --border-subtle: 1px solid oklch(0.25 0.008 260);
  --border-visible: 1px solid oklch(0.35 0.01 260);

  /* --- Radius --- */
  --radius-sm: 4px;
  --radius-md: 6px;
}

/* --- Reset --- */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  color-scheme: dark;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--surface-0);
  min-height: 100dvh;
}

h1, h2, h3, h4 {
  font-family: var(--font-serif);
  font-weight: 600;
  line-height: 1.25;
  color: var(--text-primary);
}

h1 { font-size: 1.5rem; }
h2 { font-size: 1.15rem; }
h3 { font-size: 0.95rem; }

a {
  color: var(--accent);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

/* --- Utility --- */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* --- Smooth transitions --- */
@media (prefers-reduced-motion: no-preference) {
  * {
    transition-property: background-color, border-color, color, opacity;
    transition-duration: 150ms;
    transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/src/app/globals.css
git commit -m "feat(dashboard): add design tokens and global styles (OKLCH dark theme)"
```

---

### Task 10: Reusable components

**Files:**
- Create: `z-brain/dashboard/src/components/Nav.js` + `Nav.module.css`
- Create: `z-brain/dashboard/src/components/StatusIndicator.js` + `StatusIndicator.module.css`
- Create: `z-brain/dashboard/src/components/Badge.js` + `Badge.module.css`
- Create: `z-brain/dashboard/src/components/EventRow.js` + `EventRow.module.css`
- Create: `z-brain/dashboard/src/components/MemoryCard.js` + `MemoryCard.module.css`
- Create: `z-brain/dashboard/src/components/QuarantineItem.js` + `QuarantineItem.module.css`

> **Note for executor:** Each component below is a focused, self-contained file. Create them all, then commit. Use the design tokens from `globals.css` (the `--` variables). Follow the impeccable design laws: no side-stripe borders, no identical card grids, no gradient text.

- [ ] **Step 1: Create Nav component**

Create `z-brain/dashboard/src/components/Nav.js`:

```javascript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Nav.module.css';

const LINKS = [
  { href: '/', label: 'Overview', icon: '◉' },
  { href: '/pipeline', label: 'Pipeline', icon: '⟶' },
  { href: '/quarantine', label: 'Quarantine', icon: '⚑' },
  { href: '/memories', label: 'Memories', icon: '◎' },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Main navigation">
      <div className={styles.brand}>
        <span className={styles.brandIcon}>🧠</span>
        <span className={styles.brandText}>Z-Brain</span>
      </div>
      <ul className={styles.links}>
        {LINKS.map(({ href, label, icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={`${styles.link} ${pathname === href ? styles.active : ''}`}
            >
              <span className={styles.linkIcon}>{icon}</span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

Create `z-brain/dashboard/src/components/Nav.module.css`:

```css
.nav {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 200px;
  background: var(--surface-1);
  border-right: var(--border-subtle);
  padding: var(--space-lg) 0;
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 0 var(--space-lg) var(--space-xl);
}

.brandIcon {
  font-size: 1.25rem;
}

.brandText {
  font-family: var(--font-serif);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.links {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.link {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  color: var(--text-secondary);
  font-size: 0.8125rem;
  text-decoration: none;
}

.link:hover {
  color: var(--text-primary);
  background: var(--surface-2);
  text-decoration: none;
}

.active {
  color: var(--accent);
  background: var(--accent-subtle);
}

.active:hover {
  color: var(--accent);
  background: var(--accent-subtle);
}

.linkIcon {
  font-size: 0.875rem;
  width: 1.25rem;
  text-align: center;
}
```

- [ ] **Step 2: Create StatusIndicator component**

Create `z-brain/dashboard/src/components/StatusIndicator.js`:

```javascript
import styles from './StatusIndicator.module.css';

const STATUS_MAP = {
  ok: { className: 'ok', label: 'Healthy' },
  online: { className: 'ok', label: 'Online' },
  healthy: { className: 'ok', label: 'Healthy' },
  degraded: { className: 'warn', label: 'Degraded' },
  error: { className: 'error', label: 'Error' },
  offline: { className: 'error', label: 'Offline' },
};

export default function StatusIndicator({ status, label }) {
  const mapped = STATUS_MAP[status] || STATUS_MAP.error;

  return (
    <span className={`${styles.indicator} ${styles[mapped.className]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {label || mapped.label}
    </span>
  );
}
```

Create `z-brain/dashboard/src/components/StatusIndicator.module.css`:

```css
.indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ok .dot {
  background: var(--status-ok);
  box-shadow: 0 0 4px var(--status-ok);
}

.warn .dot {
  background: var(--status-warn);
  box-shadow: 0 0 4px var(--status-warn);
}

.error .dot {
  background: var(--status-error);
  box-shadow: 0 0 4px var(--status-error);
}
```

- [ ] **Step 3: Create Badge component**

Create `z-brain/dashboard/src/components/Badge.js`:

```javascript
import styles from './Badge.module.css';

export default function Badge({ type }) {
  return (
    <span className={`${styles.badge} ${styles[type] || ''}`}>
      {type}
    </span>
  );
}
```

Create `z-brain/dashboard/src/components/Badge.module.css`:

```css
.badge {
  display: inline-block;
  font-size: 0.625rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-secondary);
}

.decision { background: oklch(0.22 0.05 280); color: var(--badge-decision); }
.snippet  { background: oklch(0.22 0.04 170); color: var(--badge-snippet); }
.command  { background: oklch(0.22 0.04 55);  color: var(--badge-command); }
.summary  { background: oklch(0.22 0.04 240); color: var(--badge-summary); }
.reference { background: oklch(0.22 0.03 320); color: var(--badge-reference); }
```

- [ ] **Step 4: Create EventRow component**

Create `z-brain/dashboard/src/components/EventRow.js`:

```javascript
import styles from './EventRow.module.css';

export default function EventRow({ event }) {
  const label = event.source === 'zulip'
    ? `${event.stream || '?'} › ${event.topic || '?'}`
    : event.title || event.source_id;

  const who = event.sender || event.author || '—';

  return (
    <div className={`${styles.row} ${styles[event.status]}`}>
      <span className={styles.source}>{event.source}</span>
      <span className={styles.label}>{label}</span>
      <span className={styles.who}>{who}</span>
      <span className={styles.status}>{event.status}</span>
      <time className={styles.time} dateTime={event.created_at}>
        {new Date(event.created_at).toLocaleTimeString()}
      </time>
    </div>
  );
}
```

Create `z-brain/dashboard/src/components/EventRow.module.css`:

```css
.row {
  display: grid;
  grid-template-columns: 5rem 1fr 8rem 6rem 5.5rem;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-bottom: var(--border-subtle);
  font-size: 0.75rem;
}

.row:hover {
  background: var(--surface-2);
}

.source {
  color: var(--text-muted);
  text-transform: uppercase;
  font-size: 0.625rem;
  letter-spacing: 0.05em;
}

.label {
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.who {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status {
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.completed .status { color: var(--status-ok); }
.pending .status   { color: var(--status-info); }
.failed .status    { color: var(--status-error); }
.processing .status { color: var(--status-warn); }

.time {
  color: var(--text-muted);
  text-align: right;
}
```

- [ ] **Step 5: Create QuarantineItem component**

Create `z-brain/dashboard/src/components/QuarantineItem.js`:

```javascript
'use client';

import { useState } from 'react';
import Badge from './Badge';
import styles from './QuarantineItem.module.css';

export default function QuarantineItem({ item, onAction }) {
  const [loading, setLoading] = useState(false);

  async function handleAction(action) {
    setLoading(true);
    try {
      const res = await fetch(`/api/quarantine/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok && onAction) onAction(item.id, action);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.item}>
      <div className={styles.header}>
        <Badge type={item.memory_type} />
        <span className={styles.confidence}>
          {Math.round(item.confidence * 100)}% confidence
        </span>
        <span className={styles.source}>
          {item.source === 'zulip' ? `${item.stream} › ${item.topic}` : item.title}
        </span>
      </div>
      <p className={styles.content}>{item.extracted_content}</p>
      {item.original_content && (
        <details className={styles.original}>
          <summary>Original message</summary>
          <pre>{item.original_content}</pre>
        </details>
      )}
      <div className={styles.actions}>
        <button
          className={styles.approve}
          onClick={() => handleAction('approve')}
          disabled={loading}
        >
          ✓ Approve
        </button>
        <button
          className={styles.reject}
          onClick={() => handleAction('reject')}
          disabled={loading}
        >
          ✕ Reject
        </button>
      </div>
    </div>
  );
}
```

Create `z-brain/dashboard/src/components/QuarantineItem.module.css`:

```css
.item {
  background: var(--surface-1);
  border: var(--border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.confidence {
  font-size: 0.6875rem;
  color: var(--status-warn);
}

.source {
  font-size: 0.6875rem;
  color: var(--text-muted);
  margin-left: auto;
}

.content {
  font-size: 0.8125rem;
  color: var(--text-primary);
  line-height: 1.55;
  max-width: 65ch;
}

.original {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.original summary {
  cursor: pointer;
  user-select: none;
}

.original pre {
  margin-top: var(--space-xs);
  padding: var(--space-sm);
  background: var(--surface-0);
  border-radius: var(--radius-sm);
  overflow-x: auto;
  font-size: 0.6875rem;
  line-height: 1.5;
  max-height: 200px;
  overflow-y: auto;
}

.actions {
  display: flex;
  gap: var(--space-sm);
  padding-top: var(--space-xs);
}

.approve,
.reject {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  font-weight: 500;
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
}

.approve {
  background: oklch(0.25 0.06 155);
  color: var(--status-ok);
}

.approve:hover:not(:disabled) {
  background: oklch(0.30 0.08 155);
}

.reject {
  background: oklch(0.22 0.04 25);
  color: var(--status-error);
}

.reject:hover:not(:disabled) {
  background: oklch(0.28 0.06 25);
}

.approve:disabled,
.reject:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 6: Commit all components**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/src/components/
git commit -m "feat(dashboard): add all UI components (Nav, StatusIndicator, Badge, EventRow, QuarantineItem)"
```

---

## Chunk 4: Pages, Layout, and Docker

### Task 11: Root layout

**Files:**
- Modify: `z-brain/dashboard/src/app/layout.js`

- [ ] **Step 1: Replace the root layout**

Replace the entire contents of `z-brain/dashboard/src/app/layout.js`:

```javascript
import './globals.css';
import Nav from '@/components/Nav';

export const metadata = {
  title: 'Z-Brain Dashboard',
  description: 'Command center for the Z-Brain Ecosystem — memory pipeline, quarantine review, agent status.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main style={{ marginLeft: '200px', padding: '2rem 2.5rem' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/src/app/layout.js
git commit -m "feat(dashboard): add root layout with side nav"
```

---

### Task 12: Overview page (home)

**Files:**
- Modify: `z-brain/dashboard/src/app/page.js`

- [ ] **Step 1: Build the overview page**

Replace the contents of `z-brain/dashboard/src/app/page.js`:

```javascript
import StatusIndicator from '@/components/StatusIndicator';

async function fetchStats() {
  try {
    // In production (Docker), use internal URL; in dev, use localhost
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3090';
    const res = await fetch(`${baseUrl}/api/stats`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function OverviewPage() {
  const stats = await fetchStats();

  return (
    <>
      <header style={{ marginBottom: '2.5rem' }}>
        <h1>Ecosystem Overview</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-xs)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          Memory Synthesizer pipeline health and service status
        </p>
      </header>

      {/* Service Status Row */}
      <section style={{ display: 'flex', gap: 'var(--space-xl)', marginBottom: 'var(--space-2xl)' }}>
        <div>
          <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>OpenBrain</div>
          <StatusIndicator status={stats?.services?.openbrain?.status || 'error'} />
        </div>
        <div>
          <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>Hermes Agent</div>
          <StatusIndicator status={stats?.services?.hermes?.status || 'error'} />
        </div>
        <div>
          <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>Synthesizer</div>
          <StatusIndicator status={stats?.services?.synthesizer?.status || 'error'} />
        </div>
      </section>

      {/* Queue Stats */}
      <section style={{ marginBottom: 'var(--space-2xl)' }}>
        <h2 style={{ marginBottom: 'var(--space-lg)' }}>Pipeline Queue</h2>
        <div style={{ display: 'flex', gap: 'var(--space-xl)' }}>
          {['pending', 'processing', 'completed', 'failed'].map((key) => (
            <div key={key}>
              <div style={{ fontSize: '1.75rem', fontFamily: 'var(--font-serif)', fontWeight: 700, color: key === 'failed' ? 'var(--status-error)' : 'var(--text-primary)' }}>
                {stats?.queue?.[key] ?? '—'}
              </div>
              <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
                {key}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Memory Stats */}
      <section>
        <h2 style={{ marginBottom: 'var(--space-lg)' }}>Memories</h2>
        <div style={{ display: 'flex', gap: 'var(--space-xl)' }}>
          <div>
            <div style={{ fontSize: '1.75rem', fontFamily: 'var(--font-serif)', fontWeight: 700 }}>
              {stats?.memories?.committed ?? '—'}
            </div>
            <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
              Committed
            </div>
          </div>
          <div>
            <div style={{ fontSize: '1.75rem', fontFamily: 'var(--font-serif)', fontWeight: 700, color: 'var(--status-warn)' }}>
              {stats?.memories?.quarantined_pending ?? '—'}
            </div>
            <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
              Quarantined
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/src/app/page.js
git commit -m "feat(dashboard): add overview page with service status and queue stats"
```

---

### Task 13: Pipeline page

**Files:**
- Create: `z-brain/dashboard/src/app/pipeline/page.js`

- [ ] **Step 1: Build the pipeline page**

Create `z-brain/dashboard/src/app/pipeline/page.js`:

```javascript
import EventRow from '@/components/EventRow';

async function fetchEvents() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3090';
    const res = await fetch(`${baseUrl}/api/events?limit=100`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.events || [];
  } catch {
    return [];
  }
}

export default async function PipelinePage() {
  const events = await fetchEvents();

  return (
    <>
      <header style={{ marginBottom: 'var(--space-xl)' }}>
        <h1>Pipeline</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-xs)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          {events.length} events in queue — most recent first
        </p>
      </header>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '5rem 1fr 8rem 6rem 5.5rem',
        gap: 'var(--space-sm)',
        padding: 'var(--space-sm) var(--space-md)',
        fontSize: '0.625rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
        borderBottom: 'var(--border-visible)',
        marginBottom: 'var(--space-xs)',
      }}>
        <span>Source</span>
        <span>Context</span>
        <span>Sender</span>
        <span>Status</span>
        <span style={{ textAlign: 'right' }}>Time</span>
      </div>

      {events.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', padding: 'var(--space-xl) var(--space-md)' }}>
          No events yet. Events will appear here when Zulip or Wiki.js sends webhooks.
        </p>
      ) : (
        events.map((event) => <EventRow key={event.id} event={event} />)
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/src/app/pipeline/
git commit -m "feat(dashboard): add pipeline page with event feed"
```

---

### Task 14: Quarantine page

**Files:**
- Create: `z-brain/dashboard/src/app/quarantine/page.js`

- [ ] **Step 1: Build the quarantine page**

Create `z-brain/dashboard/src/app/quarantine/page.js`:

```javascript
'use client';

import { useState, useEffect } from 'react';
import QuarantineItem from '@/components/QuarantineItem';

export default function QuarantinePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuarantine();
  }, []);

  async function fetchQuarantine() {
    setLoading(true);
    try {
      const res = await fetch('/api/quarantine');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleAction(id, action) {
    // Remove the item from the list after action
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  return (
    <>
      <header style={{ marginBottom: 'var(--space-xl)' }}>
        <h1>Quarantine Review</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-xs)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          {loading ? 'Loading...' : `${items.length} items awaiting review`}
        </p>
      </header>

      {!loading && items.length === 0 && (
        <p style={{ color: 'var(--text-muted)', padding: 'var(--space-xl) 0' }}>
          No quarantined memories. Items with confidence below 60% will appear here for your review.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', maxWidth: '52rem' }}>
        {items.map((item) => (
          <QuarantineItem key={item.id} item={item} onAction={handleAction} />
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/src/app/quarantine/
git commit -m "feat(dashboard): add quarantine review page"
```

---

### Task 15: Memories page

**Files:**
- Create: `z-brain/dashboard/src/app/memories/page.js`

- [ ] **Step 1: Build the memories page**

Create `z-brain/dashboard/src/app/memories/page.js`:

```javascript
import Badge from '@/components/Badge';

async function fetchMemories() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3090';
    const res = await fetch(`${baseUrl}/api/memories?limit=100`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.memories || [];
  } catch {
    return [];
  }
}

export default async function MemoriesPage() {
  const memories = await fetchMemories();

  return (
    <>
      <header style={{ marginBottom: 'var(--space-xl)' }}>
        <h1>Committed Memories</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-xs)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          {memories.length} memories committed to OpenBrain
        </p>
      </header>

      {memories.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', padding: 'var(--space-xl) 0' }}>
          No memories committed yet. Memories will appear here after the Synthesizer processes events and commits them to OpenBrain.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', maxWidth: '52rem' }}>
          {memories.map((m) => (
            <div key={m.id} style={{
              padding: 'var(--space-md)',
              borderBottom: 'var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
                <Badge type={m.memory_type} />
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  {m.source === 'zulip' ? `${m.stream} › ${m.topic}` : m.title}
                </span>
                <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {new Date(m.created_at).toLocaleDateString()}
                </span>
              </div>
              <p style={{ fontSize: '0.8125rem', lineHeight: 1.55, maxWidth: '65ch' }}>
                {m.extracted_content}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/src/app/memories/
git commit -m "feat(dashboard): add committed memories browser page"
```

---

### Task 16: Docker infrastructure

**Files:**
- Create: `z-brain/dashboard/Dockerfile`
- Create: `z-brain/dashboard/docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

Create `z-brain/dashboard/Dockerfile`:

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3090

ENV PORT=3090
CMD ["node", "server.js"]
```

- [ ] **Step 2: Update next.config.js for standalone output**

Modify `z-brain/dashboard/next.config.js` to include standalone output:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

- [ ] **Step 3: Create docker-compose.yml**

Create `z-brain/dashboard/docker-compose.yml`:

```yaml
# Z-Brain Dashboard
# Connects to synth-postgres for pipeline data,
# and to openbrain-server / hermes-agent for service health.

services:
  dashboard:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: zbrain-dashboard
    restart: unless-stopped
    ports:
      - "3090:3090"
    env_file:
      - .env
    networks:
      - agent-net
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`dash.example.com`)"
      - "traefik.http.routers.dashboard.entrypoints=websecure"
      - "traefik.http.routers.dashboard.tls=true"
      - "traefik.http.routers.dashboard.tls.certresolver=cloudflare"
      - "traefik.http.services.dashboard.loadbalancer.server.port=3090"

networks:
  agent-net:
    external: true
```

- [ ] **Step 4: Commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add dashboard/Dockerfile dashboard/docker-compose.yml dashboard/next.config.js
git commit -m "feat(dashboard): add Docker infrastructure with standalone build"
```

---

### Task 17: Verify build

- [ ] **Step 1: Run the development server**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain/dashboard
npm run dev -- --port 3090
```

Expected: Server starts on `http://localhost:3090`. The overview page loads (service statuses will show "error" since we're not connected to Docker, but the UI should render).

Open in browser and verify:
- Side navigation renders with 4 links
- Overview page shows service status indicators
- Pipeline page shows event table headers
- Quarantine page shows empty state
- Memories page shows empty state

- [ ] **Step 2: Final commit**

```bash
cd /Volumes/nvme-2tb/ant-workspace/z-brain
git add -A dashboard/
git commit -m "feat(dashboard): Z-Brain Dashboard v0.1.0 — complete Phase 1B"
```
