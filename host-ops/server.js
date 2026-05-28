/**
 * Zella Host-Ops Daemon
 *
 * A lightweight HTTP server running as the `hermes` user on the Z-Brain VM.
 * Manages headless CLI sessions (Claude Code, Codex, Antigravity) and
 * captures all conversation turns into OpenBrain for durable memory.
 *
 * Architecture:
 *   Telegram → Zella → Hermes plugin (chat_with_cli)
 *     ↓ HTTP w/ shared-secret auth
 *   This daemon → spawns CLI subprocess → captures response → POSTs to OpenBrain
 */

import express from 'express';
import { execFile } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createThreadRegistry } from './thread-registry.js';
import { captureToOpenBrain } from './openbrain-capture.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.HOST_OPS_PORT || '8650', 10);
const BIND_HOST = process.env.HOST_OPS_BIND || '127.0.0.1';
const SHARED_SECRET = process.env.HOST_OPS_SECRET || '';
const WORKSPACE = resolve(process.env.ZELLA_WORKSPACE || '/home/hermes/zella-workspace');
const CLI_TIMEOUT_MS = parseInt(process.env.CLI_TIMEOUT_MS || '120000', 10); // 2 min default

// CLI definitions — each entry describes how to invoke a CLI in headless mode
const CLI_DEFS = {
  claude: {
    bin: 'claude',
    buildArgs: (message, sessionId, workspace) => [
      '--print', message,
      ...(sessionId ? ['--resume', sessionId] : []),
      '--add-dir', workspace,
      '--permission-mode', 'acceptEdits',
      '--allowed-tools', 'Read,Write,Edit,Glob,Grep',
    ],
    parseSessionId: (stdout) => {
      // Claude Code prints session id in its output when creating new sessions
      const match = stdout.match(/session[_\s-]?id[:\s]+([0-9a-f-]+)/i);
      return match ? match[1] : null;
    },
  },
  codex: {
    bin: 'codex',
    buildArgs: (message, sessionId, _workspace) => {
      if (sessionId) {
        return ['exec', 'resume', sessionId, message];
      }
      return ['exec', message];
    },
    parseSessionId: (stdout) => {
      const match = stdout.match(/session id:\s*([0-9a-f-]+)/i);
      return match ? match[1] : null;
    },
  },
  antigravity: {
    bin: 'agy',
    buildArgs: (message, sessionId, workspace) => [
      '--print', message,
      ...(sessionId ? ['--conversation', sessionId] : []),
      '--add-dir', workspace,
    ],
    parseSessionId: (stdout) => {
      const match = stdout.match(/conversation[_\s-]?id[:\s]+([0-9a-f-]+)/i);
      return match ? match[1] : null;
    },
  },
};

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '1mb' }));

// Auth middleware — shared-secret header
function authMiddleware(req, res, next) {
  if (!SHARED_SECRET) {
    // If no secret configured, allow (dev mode)
    return next();
  }
  const token = req.headers['x-host-ops-secret'] || req.headers['authorization']?.replace('Bearer ', '');
  if (token !== SHARED_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.use('/cli', authMiddleware);

// ---------------------------------------------------------------------------
// Thread Registry
// ---------------------------------------------------------------------------

const registry = createThreadRegistry();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Snapshot file listing in workspace before a CLI run */
function snapshotWorkspace(dir) {
  const snapshot = {};
  try {
    const files = readdirSync(dir, { recursive: true });
    for (const f of files) {
      const full = join(dir, f);
      try {
        const st = statSync(full);
        if (st.isFile()) {
          snapshot[f] = { mtime: st.mtimeMs, size: st.size };
        }
      } catch { /* skip unreadable */ }
    }
  } catch { /* empty dir is fine */ }
  return snapshot;
}

/** Diff workspace to find new/changed files */
function diffWorkspace(dir, before) {
  const after = snapshotWorkspace(dir);
  const changed = [];
  for (const [file, info] of Object.entries(after)) {
    const prev = before[file];
    if (!prev || prev.mtime !== info.mtime || prev.size !== info.size) {
      changed.push(file);
    }
  }
  return changed;
}

/** Read file contents for changed files (capped at 50KB per file) */
function readChangedFiles(dir, files) {
  const result = {};
  for (const f of files) {
    try {
      const content = readFileSync(join(dir, f), 'utf-8');
      result[f] = content.length > 50000 ? content.slice(0, 50000) + '\n... (truncated)' : content;
    } catch { /* skip unreadable */ }
  }
  return result;
}

/** Spawn a CLI subprocess and capture output */
function spawnCli(cliDef, message, sessionId, workspace) {
  return new Promise((resolve, reject) => {
    const args = cliDef.buildArgs(message, sessionId, workspace);

    const child = execFile(cliDef.bin, args, {
      cwd: workspace,
      timeout: CLI_TIMEOUT_MS,
      maxBuffer: 5 * 1024 * 1024, // 5MB
      env: { ...process.env, HOME: '/home/hermes' },
      stdin: 'ignore',
    }, (error, stdout, stderr) => {
      if (error && error.killed) {
        return reject(new Error(`CLI timed out after ${CLI_TIMEOUT_MS / 1000}s`));
      }
      if (error) {
        return reject(new Error(`CLI error: ${error.message}\nstderr: ${stderr}`));
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });

    // Close stdin immediately so CLIs don't wait for input
    if (child.stdin) {
      child.stdin.end();
    }
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** POST /cli/chat — Send a message to a CLI via a named thread */
app.post('/cli/chat', async (req, res) => {
  const { cli, thread, message } = req.body;

  if (!cli || !thread || !message) {
    return res.status(400).json({ error: 'Missing required fields: cli, thread, message' });
  }

  const cliDef = CLI_DEFS[cli];
  if (!cliDef) {
    return res.status(400).json({ error: `Unknown CLI: ${cli}. Available: ${Object.keys(CLI_DEFS).join(', ')}` });
  }

  try {
    // Look up or create thread
    let threadEntry = registry.getThread(cli, thread);
    const sessionId = threadEntry?.session_uuid || null;

    // Snapshot workspace before run
    const beforeSnapshot = snapshotWorkspace(WORKSPACE);

    // Spawn CLI
    const { stdout, stderr } = await spawnCli(cliDef, message, sessionId, WORKSPACE);

    // If new thread, try to parse session ID from output
    if (!threadEntry) {
      const parsedId = cliDef.parseSessionId(stdout);
      threadEntry = registry.createThread(cli, thread, parsedId);
    }

    // Detect changed files
    const changedFiles = diffWorkspace(WORKSPACE, beforeSnapshot);
    const fileContents = changedFiles.length > 0 ? readChangedFiles(WORKSPACE, changedFiles) : {};

    // Build response
    let response = stdout;
    if (changedFiles.length > 0) {
      response += `\n\n📄 Files written this turn: ${changedFiles.join(', ')}`;
    }

    // Async capture to OpenBrain (fire-and-forget)
    captureToOpenBrain({
      thread,
      cli,
      session_uuid: threadEntry.session_uuid,
      prompt: message,
      response: stdout,
      files_written: fileContents,
      timestamp: new Date().toISOString(),
    }).catch(err => console.error('[OpenBrain capture failed]', err.message));

    res.json({
      response,
      thread: threadEntry.name,
      cli,
      session_uuid: threadEntry.session_uuid,
      files_written: changedFiles,
    });
  } catch (err) {
    console.error(`[CLI error] ${cli}/${thread}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/** GET /cli/threads — List threads for a CLI */
app.get('/cli/threads', (req, res) => {
  const { cli } = req.query;
  if (!cli) {
    return res.status(400).json({ error: 'Missing query param: cli' });
  }
  const threads = registry.listThreads(cli);
  res.json({ cli, threads });
});

/** POST /cli/threads/archive — Archive a thread */
app.post('/cli/threads/archive', (req, res) => {
  const { cli, thread } = req.body;
  if (!cli || !thread) {
    return res.status(400).json({ error: 'Missing required fields: cli, thread' });
  }
  registry.archiveThread(cli, thread);
  res.json({ archived: true, cli, thread });
});

/** GET /cli/artifact — Fetch a file from the workspace */
app.get('/cli/artifact', (req, res) => {
  const { filename } = req.query;
  if (!filename) {
    return res.status(400).json({ error: 'Missing query param: filename' });
  }
  // Security: prevent path traversal
  const safePath = resolve(WORKSPACE, filename);
  if (!safePath.startsWith(WORKSPACE)) {
    return res.status(403).json({ error: 'Path traversal not allowed' });
  }
  try {
    const content = readFileSync(safePath, 'utf-8');
    res.json({ filename, content });
  } catch (err) {
    res.status(404).json({ error: `File not found: ${filename}` });
  }
});

/** GET /health — Basic health check */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'zella-host-ops',
    workspace: WORKSPACE,
    available_clis: Object.keys(CLI_DEFS),
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, BIND_HOST, () => {
  console.log(`[host-ops] Listening on ${BIND_HOST}:${PORT}`);
  console.log(`[host-ops] Workspace: ${WORKSPACE}`);
  console.log(`[host-ops] Auth: ${SHARED_SECRET ? 'enabled' : 'DISABLED (dev mode)'}`);
  console.log(`[host-ops] CLI timeout: ${CLI_TIMEOUT_MS / 1000}s`);
});
