---
title: Z-Brain Degradation Diagnostic — 24–36 Hour Window
date: 2026-05-27
investigator: Claude Haiku 4.5 (Claude Code session)
vm: YOUR_VM_IP (z-brain)
status: DEGRADED — multiple compound failures
---

# Z-Brain Degradation Diagnostic Report

**Window analyzed:** ~36 hours prior to 2026-05-27 20:30 UTC
**Method:** SSH to VM, `docker ps` / `docker logs` / `docker exec` on every Z-Brain container, Redis BullMQ inspection, host filesystem audit.

---

## TL;DR — What's Broken Right Now

Z-Brain is **partially up but functionally degraded.** Every container is running, but Zella's primary chat path, several skills, and the memory tool integration are all broken. Three independent failures are stacking on top of each other:

1. **OpenRouter weekly key limit EXCEEDED** (HTTP 403). Primary chat model for both Hermes and OpenBrain is blocked until the weekly window resets or you raise the limit.
2. **Abacus AI credits depleted** ("You have no remaining credits to use the LLM apis"). Fallback #2 is also dead.
3. **19 SKILL.md files inside `~/docker/hermes-stack/data/skills/` are owned by `root:root`** instead of the `hermes` user (uid 10000). This breaks `file_sync`, `skill_view`, scheduled cron jobs, and the knowledge-graph-update skill.

A fourth issue compounded the visibility of the above: at startup (16h ago) Hermes failed to parse `config.yaml` due to a momentary permission problem, causing the fallback chain (ollama → abacus → openrouter) to be **silently dropped**. The file is readable now, but the running gateway loaded defaults at boot and never recovered. **Hermes needs a restart after fixing the file ownership issues below.**

---

## Service Inventory & Status

| Container | Up Since | Exposed | Service | Status |
|-----------|----------|---------|---------|--------|
| `hermes-agent` | 16h (restart 2026-05-27 04:38 UTC) | `:8642` (API), `:9119` (dashboard) | Zella | **DEGRADED** |
| `core-app` | 16h | `:3033` | CORE / Z-Cortex API | Queues healthy, embeddings OK |
| `core-postgres` | 2d | (internal `:5432`) | pgvector | Healthy |
| `core-neo4j` | 46h | (internal `:7687`, `:7474`) | Knowledge graph | Healthy (no errors) |
| `core-redis` | 4d | (internal `:6379`) | BullMQ + cache | Healthy, all 9 queues clean (failed=0) |
| `openbrain-server` | 40h | `:3040` | OpenBrain MCP | **DEGRADED** (OpenRouter 403 → falling back to gemini-sdk) |

**Z-Relay** is local-only (no container) — code at [relay/](../../../../relay/) — not running as a server, used as an MCP stdio process when an IDE agent loads it. Local memory notes that it doesn't currently load in this Claude Code session; not investigated further here since it's an IDE-side concern, not a VM issue.

---

## Root-Cause Findings

### 1. OpenRouter weekly key limit exceeded — HIGH SEVERITY

**Where it bites:**
- `hermes-agent` on every chat call to `anthropic/claude-sonnet-4`
- `hermes-agent` on every `deepseek/deepseek-v4-pro` call (background review tasks)
- `openbrain-server` on its `[chat]` synthesis path

**Evidence (Hermes log):**
```
WARNING run_agent: API call failed (attempt 1/3) error_type=PermissionDeniedError
  provider=openrouter base_url=https://openrouter.ai/api/v1
  model=anthropic/claude-sonnet-4
  summary=HTTP 403: Key limit exceeded (weekly limit). Manage it using
  https://openrouter.ai/workspaces/default/keys/2f2e1c7d19dafa628b6f77da30341b877a78bbccf48aecb27d430e6d5cd13067
```

**Evidence (OpenBrain log):**
```
[chat] openrouter failed: OpenRouter 403: Key limit exceeded (weekly limit)
[chat] falling back to gemini-sdk...
```

OpenBrain has a working secondary path (gemini-sdk) so its `[chat]` synthesis still completes. Hermes does **not** — see issue #4.

**Remediation:** Raise the weekly limit on the OpenRouter key, or wait for the weekly window to reset. Key management URL is in the error message.

---

### 2. Abacus AI credits depleted — HIGH SEVERITY

This is Hermes's documented Fallback #2. With OpenRouter blocked and Abacus also out, the entire intended fallback chain collapses.

**Evidence:**
```
WARNING root: Session summarization failed after 3 attempts:
  Error code: 400 - {'success': False, 'error': 'You have no remaining credits to use the LLM apis.'}
```

This appears ~6 times in the 36h log. Session summarization is hard-coded to Abacus in places.

**Remediation:** Top up the Abacus account, or remove Abacus from the chain and let it fail through to local Ollama directly.

---

### 3. Skill files owned by root — HIGH SEVERITY

**19 files in `/home/YOUR_VM_USER/docker/hermes-stack/data/skills/` are owned by `root:root`** with modes that the in-container `hermes` user (uid 10000) cannot read. Hermes uses these for:

- The `file_sync` tool (tars the skills tree → fails on every invocation)
- The `skill_view` tool (returns Errno 13 to the agent)
- Cron jobs that resolve skills by name (e.g. `Memory Systems Health Check` skips silently)

**Affected files:**
```
skills/.bundled_manifest
skills/autonomous-ai-agents/agent-memory-systems/SKILL.md
skills/autonomous-ai-agents/agent-memory-systems/references/cross-agent-coordination-failures.md
skills/autonomous-ai-agents/agent-memory-systems/references/neo4j-auto-update-system-2026-05-27.md
skills/autonomous-ai-agents/agent-memory-systems/references/neo4j-complete-auto-update-system-2026-05-27.md
skills/autonomous-ai-agents/agent-memory-systems/references/neo4j-knowledge-graph-diagnosis-2026-05-27.md
skills/autonomous-ai-agents/agent-memory-systems/references/neo4j-memory-corruption-diagnosis.md
skills/autonomous-ai-agents/hermes-agent/SKILL.md
skills/devops/pushover-notifications/SKILL.md
skills/devops/pushover-notifications/references/cron-integration-examples.md
skills/email/himalaya/SKILL.md
skills/email/himalaya/references/oauth-vs-imap-architecture.md
skills/productivity/google-workspace/SKILL.md
skills/productivity/google-workspace/references/dedicated-agent-drive-bootstrap.md
skills/productivity/google-workspace/references/oauth-vs-himalaya-pitfalls.md
skills/productivity/google-workspace/references/ssh-remote-bootstrap.md
skills/software-development/hermes-agent-skill-authoring/references/integration-pitfalls.md
skills/trigger-knowledge-graph-update/SKILL.md
skills/zella-email-management/SKILL.md
```

Also affected (outside skills/):
```
~/docker/hermes-stack/data/SOUL.md            (root-owned, but mode 644 — still readable)
~/docker/hermes-stack/data/.hermes_history    (root-owned)
~/docker/hermes-stack/data/.update_check      (root-owned)
```

**Most likely cause:** Files were created or modified by a process running as root (probably via `sudo docker cp` or `sudo tee` into the bind-mounted volume during yesterday's migration session). Container runs the gateway process as the unprivileged `hermes` user (uid 10000), which cannot read root-owned 600-mode files.

**Remediation (single command, low risk):**
```bash
ssh YOUR_VM_IP 'sudo chown -R 10000:10000 /home/YOUR_VM_USER/docker/hermes-stack/data/skills/ \
  /home/YOUR_VM_USER/docker/hermes-stack/data/SOUL.md \
  /home/YOUR_VM_USER/docker/hermes-stack/data/.hermes_history \
  /home/YOUR_VM_USER/docker/hermes-stack/data/.update_check'
```

Then restart Hermes:
```bash
ssh YOUR_VM_IP 'docker restart hermes-agent'
```

---

### 4. Hermes loaded with broken config.yaml at startup — MEDIUM SEVERITY (LATCHED)

At container start (2026-05-27 04:38:17 UTC), the gateway logged:
```
WARNING hermes_cli.config: Failed to parse /opt/data/config.yaml:
  [Errno 13] Permission denied: '/opt/data/config.yaml'.
  Falling back to default config — every user override (auxiliary providers,
  fallback chain, model settings) is being IGNORED. Fix the YAML and restart.
```

**Current state of the file (verified live):**
- Host path: `~/docker/hermes-stack/data/config.yaml`
- Mode `640`, owner `10000:10000` (hermes:hermes inside container)
- Contents look correct: `model.default: anthropic/claude-sonnet-4`, provider `openrouter`, fallback chain `ollama → abacus → openrouter`
- **A live `docker exec --user hermes hermes-agent cat /opt/data/config.yaml` succeeds.** The file is readable RIGHT NOW.

**Interpretation:** The permission error was transient — most likely the file was being rewritten during container start (config.yaml mtime is `May 27 04:38`, exactly matching container start time). The gateway parsed the failure once, cached the fallback-to-defaults state, and has been running with no auxiliary providers configured for 16 hours.

This explains why, when OpenRouter started returning 403, the runtime logged `Fallback to ollama failed: provider not configured` and `Fallback to abacus failed: provider not configured` — the fallback chain from `config.yaml` never made it into memory.

**Remediation:** `docker restart hermes-agent` after fixing issue #3.

---

### 5. Memory tool integration broken — MEDIUM SEVERITY

Repeatedly in the Hermes log:
```
WARNING run_agent: Tool memory returned error (0.00s):
  {"error": "Memory is not available. It may be disabled in config or this environment.",
   "success": false}
```

The `memory` tool is the OpenBrain MCP bridge — Hermes ↔ `openbrain-server:3040`. With config.yaml not loaded (issue #4), the tool may be registered but missing its endpoint config. The MCP processes ARE running (`mcp-remote http://openbrain-server:3040/sse` and `mcp-remote http://core-app:3033/api/v1/mcp` both alive inside the container per `ps -ef`).

**Likely resolved by restart after issue #3 fix.** If it persists, investigate the `memory` tool's config binding inside `config.yaml`.

---

### 6. Telegram push MCP server fails to connect — LOW SEVERITY

Every gateway start, in a loop:
```
WARNING tools.mcp_tool: MCP server 'telegram_push' initial connection failed
  (attempt 1/3 ... 2/3 ... 3/3), retrying
WARNING tools.mcp_tool: Failed to connect to MCP server 'telegram_push' (command=node): Connection closed
```

After 3 attempts the gateway gives up. This is a separate, persistent failure — looks like a missing or broken node MCP server binary/config. The container is otherwise healthy. **Z-Relay → Telegram push notifications from IDE agents will not work until this is fixed.**

**Suggested next step:** check the MCP config that defines `telegram_push` and try running its `command=node ...` manually inside the container to see the real startup error.

---

### 7. Zella hallucinating non-existent tools — LOW/COSMETIC

When the fallback finally lands on `gemma4:26b-mlx` (local Ollama) because OpenRouter is blocked, the smaller model is calling tools that don't exist in the current toolset:

```
⚠️  Unknown tool 'mcp_neo4j_memory_add_entities' — sending error to model for self-correction (1/3)
⚠️  Unknown tool 'session_search' — sending error to model for self-correction (1/3)
⚠️  Unknown tool 'terminal' — sending error to model for self-correction (1/3)
```

These are old/renamed tool names. The self-correction loop catches them, but it wastes turns. **Root cause is downstream of issue #1:** when the primary model is available, this doesn't happen because Sonnet uses the current toolset correctly.

---

### 8. CORE app — actually healthy

Reassuring counter-finding: the CORE memory pipeline that was migrated yesterday is **clean**.

- All 9 BullMQ queues report `Active=0 Waiting=0 Delayed=0 Failed=0` on the heartbeat published every 60s
- Redis `db0`: 143 keys, no `*:failed` zsets non-empty
- Ingest jobs complete: `ingest-episode` Completed=8, `preprocess-episode` Completed=3, `session-compaction` Completed=3, `label-assignment` Completed=8, `title-generation` Completed=8
- 404s on `/.well-known/oauth-protected-resource/api/v1/mcp` and `/health` are routine probes (mcp-remote handshake) — harmless

The user's migration of CORE to Ollama embeddings + OpenRouter chat is working end-to-end.

---

### 9. Pydantic MCP notification noise — COSMETIC

Hermes log is dominated by:
```
WARNING root: Failed to validate notification: 15 validation errors for ServerNotification
  CancelledNotification.method
    Input should be 'notifications/cancelled' [type=literal_error, input_value='ping', ...]
  [...15 more...]
```

One of the MCP servers (likely `mcp-server-github` or one of the `mcp-remote` shims) is sending `{"method":"ping","jsonrpc":"2.0"}` as a keepalive, but the python MCP SDK on Hermes's side doesn't recognize `ping` and tries to validate it against every notification subclass. Pure log noise, no functional impact, but it makes `docker logs hermes-agent` painful to read. Worth filing upstream.

---

## Timeline Reconstruction

| Time (UTC) | Event |
|------------|-------|
| 2026-05-25 21:30 | Last clean Hermes restart (per state.db / SOUL.md mtimes) |
| 2026-05-26 ~05:00 | CORE Google-API depletion incident begins (the "amnesia" you already remediated) |
| 2026-05-27 01:45 | `.update_check` modified by root |
| 2026-05-27 04:00 | `SOUL.md` modified by root (skills tree also touched by root around this window) |
| **2026-05-27 04:38** | **Hermes restart — config.yaml parse fails, fallback chain dropped** |
| 2026-05-27 ~06:00–20:00 | OpenRouter weekly limit gradually exhausted; Abacus credits also depleted |
| 2026-05-27 20:30 | This investigation |

The migration session that fixed CORE inadvertently left files owned by root in the Hermes skills tree, and the subsequent Hermes restart loaded a defaulted config. Then the new OpenRouter-routed traffic from CORE + Hermes consumed the weekly key budget over the following ~12h.

---

## Recommended Recovery Sequence

Run in order. Each step is independently verifiable.

### Step 1 — Fix file ownership (no service downtime)
```bash
ssh YOUR_VM_IP 'sudo chown -R 10000:10000 \
  /home/YOUR_VM_USER/docker/hermes-stack/data/skills/ \
  /home/YOUR_VM_USER/docker/hermes-stack/data/SOUL.md \
  /home/YOUR_VM_USER/docker/hermes-stack/data/.hermes_history \
  /home/YOUR_VM_USER/docker/hermes-stack/data/.update_check'

# verify
ssh YOUR_VM_IP 'sudo find /home/YOUR_VM_USER/docker/hermes-stack/data -user root -type f 2>/dev/null | wc -l'
# should be 0
```

### Step 2 — Restart Hermes to reload config.yaml
```bash
ssh YOUR_VM_IP 'docker restart hermes-agent'
# wait ~30s, then verify config loaded:
ssh YOUR_VM_IP 'docker logs --tail 200 hermes-agent 2>&1 | grep -i "Failed to parse /opt/data/config.yaml"'
# should produce no output
```

### Step 3 — Raise OpenRouter weekly limit
Visit [the OpenRouter key page](https://openrouter.ai/workspaces/default/keys/2f2e1c7d19dafa628b6f77da30341b877a78bbccf48aecb27d430e6d5cd13067) and bump the weekly budget. Then send Zella a test message via Telegram and confirm in logs:
```bash
ssh YOUR_VM_IP 'docker logs --tail 50 hermes-agent 2>&1 | grep -iE "403|key limit"'
# should produce no recent hits
```

### Step 4 — Top up Abacus OR remove from chain
Either add credit at routellm.abacus.ai, or edit `config.yaml` to drop Abacus from `fallback_providers` so the chain becomes `ollama → openrouter` and is no longer dependent on a paid provider for fallback summarization.

### Step 5 — Investigate telegram_push MCP
```bash
ssh YOUR_VM_IP 'docker exec hermes-agent cat /opt/data/config.yaml | grep -A 10 telegram_push'
# inspect the command, then try running it manually inside the container
```

### Step 6 (optional) — Silence Pydantic ping noise
File an upstream issue or add a log filter for `ServerNotification` validation errors. No functional impact.

---

## What Was Verified Working

- CORE app, queues, embeddings (Ollama `mxbai-embed-large`), and neo4j → **operational**
- OpenBrain server `/health` → `{"status":"ok","version":"1.1.1","sessions":3}` → **operational** (with gemini-sdk fallback active for chat)
- Hermes container processes (gateway, dashboard, all MCP children) → **all running**
- Hermes API on `:8642` (HTTP 401 on `/v1/models` without key — expected, means service is up)
- Hermes dashboard on `:9119` → HTTP 200
- Session state DB present and recent: `~/docker/hermes-stack/data/state.db` (also `kanban.db`, `response_store.db`)
- Redis BullMQ: 9 queues, 0 failed across all

The base infrastructure is intact. The failures are all at the LLM-provider and file-permission layers, not in the durable state.

---

## Appendix — Diagnostic Commands Run

```bash
# Container topology
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Health probes (from VM)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8642/v1/models   # 401 expected
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9119/             # 200
curl -s http://localhost:3040/health                                        # {"status":"ok"...}
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3033/health       # 404 (no route)

# Logs (filtered)
docker logs --since 36h hermes-agent 2>&1 | grep -iE "openrouter|key limit|403|429"
docker logs --since 36h hermes-agent 2>&1 | grep -iE "Unknown tool|file_sync|skill"
docker logs --since 36h hermes-agent 2>&1 | grep -E "Failed to parse"
docker logs --since 36h core-app 2>&1 | grep -iE "error|fail"
docker logs --since 36h openbrain-server 2>&1 | grep -iE "error|fail|403"

# Redis queue health (with auth from ~/docker/core-stack/.env)
docker exec -e REDISCLI_AUTH=coreredis1234 core-redis redis-cli INFO keyspace
for q in ingest-episode preprocess-episode session-compaction label-assignment \
         title-generation integration-run scratchpad-scan conversation-title; do
  docker exec -e REDISCLI_AUTH=coreredis1234 core-redis redis-cli ZCARD "bull:$q:failed"
done

# Permission audit
sudo find /home/YOUR_VM_USER/docker/hermes-stack/data/skills -user root -type f
sudo ls -la /home/YOUR_VM_USER/docker/hermes-stack/data/config.yaml \
            /home/YOUR_VM_USER/docker/hermes-stack/data/SOUL.md \
            /home/YOUR_VM_USER/docker/hermes-stack/data/.env

# Container-user verification
docker exec hermes-agent ps -ef                               # main process runs as `hermes` (uid 10000)
docker exec --user hermes hermes-agent cat /opt/data/config.yaml   # succeeds → file IS readable now
```

---

*End of report.*
