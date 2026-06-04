# Z-Brain Superpowers Status

> Last updated: 2026-06-03T22:47:00-04:00 (Session: 1a6a81be)
## Current State — Healthy ✅ | Z-Brain Ecosystem LIVE 🧠 | synth-mcp ✅ FULLY OPERATIONAL

### Core Services
- ✅ **CORE Memory Pipeline** — v0.7.14 (`764b5cea`), running. Upstream Ollama fix included.
- ✅ **Hermes Agent (Zella)** — v0.15.2 (pinned `sha256:52d353b4`), **6/6 MCP servers connected**, all platforms connected. s6-overlay supervised gateway.
- ✅ **synth-mcp** — FULLY OPERATIONAL. Fixed triple bug: (1) config entry was under `streaming:` instead of `mcp_servers:`, (2) URL pointed to wrong port (3080→3081), (3) raw-transport.js imported diagnostic minimal server instead of real server. All 8 tools verified working: `wikijs_create_page`, `wikijs_update_page`, `zulip_post_message`, `synthesizer_status`, `synthesizer_pause`, `synthesizer_resume`, `synthesizer_force_reprocess`, `synthesizer_backfill`.
- ✅ **OpenBrain Server** — running at `core.zb.example.com`.
- ✅ **Memory Ingest / Search** — MCP tools working.

### Z-Brain Ecosystem
- ✅ **Traefik** — reverse proxy with Let's Encrypt wildcard cert for `*.zb.example.com` (Cloudflare DNS-01 challenge). Confirmed NOT interfering with Docker-internal traffic (verified via live curl from hermes-agent to synth-app:3081).
- ✅ **Zulip** — chat at `chat.zb.example.com`. Topic-threaded. Outgoing webhooks → Synthesizer.
- ✅ **Wiki.js** — wiki at `wiki.zb.example.com`. GraphQL poller → Synthesizer (5-min interval). Zella successfully published article (page ID: 5).
- ✅ **Memory Synthesizer** — Node.js daemon at `synth.zb.example.com`. Processes Zulip/Wiki.js events through LLM, commits to OpenBrain. Queue: 9 completed, 0 failed. **MCP server at :3081/sse with raw HTTP transport + full instrumentation.**
- ✅ **Z-Brain Dashboard** — Next.js control center at `dash.zb.example.com`. Pipeline view, quarantine review, memory browser, service health.
- ✅ **synth-postgres** — dedicated Postgres for Synthesizer (database: `synthesizer_db`), isolated from core_brain.

### Phase 2: Agent Tooling
- ✅ **synth-mcp** — MCP server running, ALL tools verified end-to-end. Zella confirmed 8/8 tools operational.
- ✅ **Zulip posting** — `zulip_post_message` tool verified end-to-end
- ✅ **Wiki.js pages** — `wikijs_create_page`, `wikijs_update_page` tools verified end-to-end (Zella published article successfully)
- ✅ **Pipeline controls** — `synthesizer_pause`, `synthesizer_resume`, `synthesizer_status`, `synthesizer_force_reprocess`, `synthesizer_backfill`
- ✅ **Zella SOUL.md** — Updated with Execution Context section (container awareness, direct path access, Docker socket restrictions)
- ✅ **system_config table** — Durable pause/resume state persisted in Postgres

### Container Inventory (22 containers on VM YOUR_VM_IP)
| Stack | Containers |
|-------|-----------|
| core-stack | core-app, core-postgres, core-redis, core-neo4j, openbrain-server |
| hermes-stack | hermes-agent |
| traefik | traefik |
| zulip-stack | zulip, zulip-database, zulip-memcached, zulip-rabbitmq, zulip-redis |
| wikijs-stack | wikijs, wikijs-database |
| synth-stack | synth-app, synth-postgres |
| dashboard | zbrain-dashboard |
| other | portainer, dockge, zella-speedtest |

### Docker Image Pinning
All images are now pinned to SHA256 digests to prevent unexpected upgrades:
| Image | Tag | Digest |
|-------|-----|--------|
| nousresearch/hermes-agent | v0.15.2 | `sha256:52d353b4...` |
| pgvector/pgvector | pg15 | `sha256:bd12d678...` |
| neo4j | 5-community | `sha256:0b5d3ab6...` |
| redis | 7-alpine | `sha256:6ab0b6e7...` |
| postgres | 15-alpine | `sha256:df7bca00...` |

## Provider Configuration

| Component | Provider | Model | Endpoint |
|-----------|----------|-------|----------|
| Hermes Primary (config default) | OpenRouter | `nvidia/nemotron-3-super-120b-a12b` | `https://openrouter.ai/api/v1` |
| Hermes Fallback 1 | OpenAI | `gpt-4o-mini` | `https://api.openai.com/v1` |
| Hermes Fallback 2 | Ollama (local) | `gemma4:26b-mlx` | `http://YOUR_OLLAMA_HOST:11434/v1` |
| Cron Jobs (pinned) | OpenRouter | `anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| OpenBrain Server (Chat) | OpenRouter | `openai/gpt-4o-mini` | `https://openrouter.ai/api/v1` |
| OpenBrain Server (Embed) | OpenRouter | `google/gemini-embedding-2-preview` | `https://openrouter.ai/api/v1` |
| OpenBrain (Fallback) | Ollama (local) | `gemma4:26b-mlx` | `http://YOUR_OLLAMA_HOST:11434/api/chat` |
| Synthesizer LLM | Hermes Agent | via `hermes-agent:8642` | Internal Docker network |

## Architecture — Automatic Pipeline

```
Zulip message → Webhook → events table → Worker → [LLM Extraction] → OpenBrain → Vector DB
Wiki.js edit  → Poller  → events table ↗        (the only AI step)
```

Everything from event capture to memory storage runs autonomously 24/7. The only AI model call is the extraction step. If the LLM API goes down, events queue and retry automatically.

## Session Work Completed

**🔴 NEXT SESSION PRIORITY — READ FIRST**
- **Transition Z-Brain from experimentation to real work** — Infrastructure is 9/10 but utilization is 3/10. Pick a Tier 1 use case (daily briefing, research assistant, or project status tracking) and make it work end-to-end. See brainstorm artifact in session `05c2bb51`.
- **DeepInfra model routing** — the operator requested: make DeepInfra the provider when Nemotron Super 3 is chosen through OpenRouter. NOT STARTED.
- **Temporal reasoning improvements** — Extraction prompts need temporal metadata tagging. Neo4j needs `valid_from`/`valid_until` on edges. Zella needs MCP tools for temporal queries.
- **Default model reliability** — `nvidia/nemotron-3-super-120b-a12b` (Hermes default) is unreliable on OpenRouter (180s stream stalls). Cron jobs now pinned to `anthropic/claude-sonnet-4`. Consider changing the global default in `config.yaml`.

**Session 1a6a81be (Current — Ops Hardening & synth-mcp Fix)**
1. **Telegram Session Audit:** Audited Zella's session `20260603_093019_f7461f40`. Found 5 error categories: Docker socket abuse (running `docker exec hermes-agent` on herself), wiki tool failures, browser-based workarounds, DeepSeek model errors, and Hermes Desktop app research tangents.
2. **SOUL.md Execution Context:** Added `## Execution Context` section teaching Zella she runs inside the hermes-agent container. Correct/incorrect path examples, Docker socket restriction rules, key filesystem paths with editability flags.
3. **Docker Image Pinning:** Pinned all 5 infrastructure images (hermes-agent, pgvector, neo4j, redis, postgres) to SHA256 digests across all 3 compose files.
4. **Hermes Upgraded to v0.15.2:** Pulled latest image, updated compose digest, verified running with s6-overlay supervision.
5. **synth-mcp Triple Bug Fix:** (a) Config entry was under `streaming:` instead of `mcp_servers:` — Hermes never loaded it. (b) URL pointed to `3080/mcp` instead of `3081/sse`. (c) `raw-transport.js` imported diagnostic `server-minimal.js` (only ping) instead of real `server.js` (all 8 tools). All fixed. Zella confirmed 8/8 tools operational.
6. **Wiki.js Article Published:** Zella successfully used `wikijs_create_page` to publish Hermes Desktop App research at `homelab/hermes/desktop-app-research` (page ID: 5).
7. **Terminal Backend Investigation:** Researched Hermes terminal backends for containerized deployments. Found 3 open P2 bugs on Docker backend. Decided to stay on `local` with SOUL.md restrictions. Filed observation that docs don't address containerized gateway deployments.
8. **GitHub Issues Mined:** Found #38369 (execution target ambiguity), #38156 (host cwd leak), #37361 (per-session container auth), #36266 (gateway loop on removed container).


**Session 05c2bb51 (Previous — Strategic Brainstorm)**
1. **Three Brains vs Z-Brain Analysis:** Compared Chris Lema's "Your AI Has Three Brains" article (Feb 2026) against Z-Brain architecture. Key finding: Z-Brain already implements all three of Lema's composable layers — CORE is literally in the stack (Brain #3), Hermes/Zella is the always-on nervous system (Brain #2), IDE agents serve as the deep reader (Brain #1). MCP + status.md + cron jobs form the "spine" Lema says nobody has built yet.
2. **Nate B. Jones Integration:** Mapped Jones's four disciplines (Prompt Craft, Context Engineering, Intent Engineering, Specification Engineering) to Z-Brain components. Jones's "Open Brain" concept directly inspired the architecture. SOUL.md = Prompt Craft, the entire memory stack = Context Engineering, config/preferences = Intent Engineering, MCP schemas + quarantine = Specification Engineering.
3. **"Real Work" Gap Identified:** Infrastructure rated 9/10, utilization rated 3/10. System is mostly self-referential — monitoring itself, building itself. Defined three tiers of use cases to bridge the gap (daily briefings, content pipeline, autonomous research loops).
4. **Future Roadmap Captured (4 streams):** (a) Frontier model chat import pipeline — export from ChatGPT/Claude/Gemini and ingest into OpenBrain, (b) Model mapping for tasks/tools/objectives — systematic routing instead of ad-hoc, (c) Interface improvements — deliberately deferred until core utility is proven, (d) AskClaude/AskAntigravity/AskCodex tool improvements.
5. **Content Project Advanced:** Narrative framing for the Z-Brain Build Story refined — dual-source story (Lema for structure, Jones for philosophy, Z-Brain for implementation). Honest gap acknowledgment makes it compelling.

**Session 4e3a9fc4 (Current — Cron Job Fix)**
1. **Cron Jobs Diagnosed & Fixed:** Root-caused all 4 cron jobs. Two script-based (Docker Stack Monitor, File System Monitor) were healthy. Two LLM-based were broken due to `enabled_toolsets` mismatch in `jobs.json`.
2. **Memory Systems Health Check (`5c3aa98`) FIXED:** Was crashing with `RuntimeError: Model generated invalid tool call: terminal` every 3 hours. Fix: changed `enabled_toolsets` from `[web, session_search, memory]` to `[terminal, session_search]`, removed dead `hermes-agent` skill reference, rewrote prompt to remove references to `memory` tool (hard-disabled in cron via `skip_memory=True`). Verified: completed 54-message run, Pushover notification sent.
3. **Neo4j Knowledge Graph Auto-Update (`e4dbe4fd`) FIXED:** Was degraded — had only `[terminal]` toolset so couldn't mine conversations or reach Neo4j MCP. Fix: changed to `[terminal, session_search]`, pinned model to `anthropic/claude-sonnet-4` (default Nemotron was hanging on OpenRouter). Verified: completed 34-message run with successful `session_search` calls.
4. **Nemotron Model Issue Discovered:** Default model `nvidia/nemotron-3-super-120b-a12b` causes 180s stream stalls on OpenRouter for cron workloads. Required container restart to kill stuck session. Both cron jobs now pinned to `claude-sonnet-4`.
5. **Key Findings:** `memory` tool is architecturally disabled in cron (`skip_memory=True` in `scheduler.py`). MCP tools are available in cron via `discover_mcp_tools()` but need time to initialize after container restart.

**Session e03cd5be (Current — synth-mcp Resolution & Operational Hardening)**
1. **synth-mcp RESOLVED:** Investigated Traefik (ruled out — verified direct Docker networking works). Read full `mcp_tool.py` (3,796 lines) inside Hermes container. Applied 10-point instrumentation patch via `docker exec`. Discovered the previous session's `raw-transport.js` rewrite had already fixed the bug. 7/7 restart tests passed — synth-mcp stable. Zella confirmed tool access via z-relay.
2. **Cross-Model Critique Workflow:** Submitted original Streamable HTTP migration plan to Claude Opus 4.8. Opus delivered critical feedback: diagnosis (client-side lifecycle bug) was incompatible with treatment (server-side transport rewrite). Rewrote plan to lead with instrumentation. The critique was valuable even though the root cause turned out to be server-side.
3. **Codex CLI Diagnosed:** Identified that Codex CLI is authenticated via ChatGPT consumer account (not API key), which limits available models. `gpt-5-codex` and `gpt-5.5-codex` not available on this auth mode. Needs investigation in future session.
4. **Critical Rules Added:** New `⛔ Critical Rules` section in status.md — never modify files inside Hermes container image (`/opt/hermes/`) as permanent fixes (wiped on upstream updates).
5. **Startup Sequence Updated:** Added Step 5 "Request Zella SITREP" to `z-cortex-session-sync` skill — every new session now asks Zella for a live situation report.

**Other Priorities (lower)**
- **Review CORE stashed patches** — 4 local patches in `git stash`
- **Dashboard polish** — use `impeccable` skill to refine the UI
- **Extraction prompt tuning** — review quarantined memories, refine confidence thresholds
- **Zulip stream setup** — create dedicated streams for organized memory capture

**📝 CONTENT PROJECT (flagged by user)**
- **Z-Brain Build Story** — Extract the full build journey into a blog post series or narrative. Raw material: conversation transcripts (JSONL), status.md session summaries, OpenBrain captures, artifacts (debug reports, cross-model critiques, implementation plans). Key beats: cross-model architecture brainstorming → Zulip routing mystery → Phase 2 TDD handoff to Gemini → Hermes upgrade with zero data loss → the Gateway Boot Paradox. Meta-theme: building a memory system for an AI, debugged by another AI, verified by a third. Follows the Meta-Content Cascade strategy from Slopthing.

**Session 05f5df02 (Current — Hermes + CORE Upgrade)**
1. **Hermes Agent Upgraded v0.14.0 → v0.15.1:** Pulled pinned image digest (`sha256:dacca4ae`). Zero data loss — 237 sessions, 7,142 messages preserved. All platforms connected, all MCP servers online.
2. **CORE Memory OS Upgraded v0.7.13 → v0.7.14:** Checked out pinned commit `764b5cea` (20 upstream commits). No Prisma migrations needed. Includes upstream Ollama `toOllamaApiBase()` fix.
3. **Cross-Model Plan Review:** Codex (gpt-5-codex) and Claude Opus 4.8 independently reviewed the upgrade plan. Both identified 6 critical issues (SQLite backup safety, Postgres rollback, target pinning, upgrade ordering). All incorporated into revised plan.
4. **MCP Mount Fix:** Discovered `./mcp:/opt/mcp` volume was missing from docker-compose.yml. `telegram_push` and `neo4j_memory` MCP servers had never been mounted into the container. Fixed — all 7 MCP servers now connect.
5. **Backup Suite Created:** Atomic SQLite `.backup` (via Python), full data tarball (945 MB via alpine container), Postgres dump with `--clean --if-exists` (18 MB), Docker image tarball (2.5 GB). All in `~/backups/`.
6. **Ollama Fallback Verified:** Both Hermes (direct) and CORE (via upstream fix) can reach Ollama at `YOUR_OLLAMA_HOST:11434`. 4 models available including `gemma4:26b-mlx` fallback.

**Session e6afc740 (Current — Zella Bug Fixes & Hardening)**
1. **Wiki.js Tool Bypassing Fixed:** Reconnected Zella to `synth-mcp` (which had dropped). Updated `SOUL.md` with explicit security rules to prevent her from dumping `WIKIJS_API_KEY` from the container environment when the MCP tool is unavailable.
2. **Context Compression Restored:** Fixed Zella dropping middle conversation turns by migrating all `auxiliary` background tasks (compression, vision, web extract) in `config.yaml` from the failing `openai` provider to `openrouter` (`openai/gpt-4o-mini`). Restarted Hermes.
3. **Environment/Terminal Fix:** Added `HERMES_HOME=/opt/data` to `docker-compose.yml` to fix `SOUL.md` loading failure. Reconfigured `terminal.backend` to `local` from `ssh` to prevent Zella from escaping to the host VM during terminal execution via the API.
4. **TUI Ghost Connection Discovery:** Confirmed API Zella is functioning properly with the `local` backend. However, discovered the `hermes chat` TUI CLI still connects via a ghost SSH session to the host VM even after stripping SSH config parameters and clearing the `/opt/data/sandboxes` directory. Flagged for deep debugging next session.

**Session b5a2351d (Previous — Phase 2 Agent Tooling)**
Planned, executed, tested, and fixed the Phase 2 Agent Tooling integration:
1. **Phase 2 Plan** — Used `writing-plans` skill to create a 12-task TDD implementation plan for MCP tools. Handed to Gemini 3.1 Pro in a separate session for execution.
2. **Merge Fix** — Restored WikiJsPoller and `pollIntervalMs` config that were lost during the feature branch merge (stash conflict).
3. **Dockerfile Healthcheck** — Fixed Alpine IPv6 bug: `wget localhost` resolved to `::1` but Node listens on `0.0.0.0`. Changed to `127.0.0.1`.
4. **Zulip Bot Credentials** — Found existing `zella-bot` in Zulip DB, extracted API key, set real credentials in VM `.env` (was placeholder `REPLACE_WITH_BOT_EMAIL`).
5. **MCP Session Bug** — Fixed "Already connected to transport" crash. Changed from singleton McpServer to per-session instances.
6. **Zulip Routing** — Fixed Zulip 400 errors caused by Docker-internal DNS. Node's `fetch` won't override the `Host` header. Changed `ZULIP_API_URL` from `http://zulip:80` to `https://chat.zb.example.com` (via Traefik).
7. **SOUL.md Updated** — Added "Z-Brain Ecosystem Tools" section with all 8 tool descriptions and usage guidance. Zella now knows when/how to use each tool.
8. **GitHub Push** — Pushed all 48 local commits to `jsxprime/z-brain-public` on GitHub.

**Session 0faa5955 (Previous)**
Deployed and hardened the Z-Brain Memory Synthesizer ecosystem:
1. **Z-Brain Dashboard:** Fixed routing and connection issues for the `zbrain-dashboard` container. Restored proper connection to `synth-postgres` for real-time queue stats and health statuses of OpenBrain, Hermes, and the Synthesizer.
2. **Wiki.js GraphQL Poller:** Pivoted from broken Wiki.js native webhooks to a custom Pull-Based GraphQL Poller. The Synthesizer now runs a daemon querying `http://wikijs:3000/graphql` every 5 minutes, tracking `last_event_timestamp` in Postgres to achieve idempotency and fault-tolerance.
3. **Environment Sync Fix:** Resolved a critical `LLM API error: 401 Unauthorized` extraction failure caused by an accidental rsync overwrite of the `.env` file on the VM. Hardened the `LLM_API_KEY` configuration.

**Session 9f4a44a1 (Previous — Architecture & Planning)**
Designed, planned, and orchestrated the complete Z-Brain Ecosystem build:
1. **Architecture Design** — Ran superbrainstorming with cross-model critique (Claude Opus 4.7 + ChatGPT 5.5). Finalized Zulip (chat) + Wiki.js (wiki) + Postgres-backed Memory Synthesizer + Next.js Dashboard.
2. **Phase 1A Plan** — Wrote 2,247-line TDD implementation plan for the Memory Synthesizer Pipeline (15 tasks, 16 tests). Handed to Gemini 3.1 Pro for execution.
3. **Phase 1B Plan** — Wrote 1,971-line implementation plan for the Z-Brain Dashboard (17 tasks). Handed to Gemini 3.1 Pro for execution.
4. **Deployment Plan** — Wrote deployment plan covering Traefik (wildcard TLS for `*.zb.example.com`), Zulip, Wiki.js, Synthesizer, and Dashboard. Handed for execution.
5. **Key Decisions** — Dedicated `synth-postgres` (not SQLite), `SELECT FOR UPDATE SKIP LOCKED` queue pattern, confidence-based quarantine (< 60%), OKLCH dark theme for dashboard.

**Session 0faa5955 (Previous)**
Built and deployed the complete Zella CLI Proxy system:
1. **Host-Ops Daemon** — Node.js Express server at `YOUR_VM_IP:8650`, systemd-managed, runs as `hermes` user.
2. **CLI Chat Plugin v2** — Hermes native plugin with per-CLI tools.
3. **OpenBrain Capture** — Rewrote from broken REST POST to working MCP SSE protocol.
4. **Zella Briefed** — Sent comprehensive briefing about new tools and usage patterns.

## Key Preferences

- **NO direct Google API key** — route Google models through `openrouter`.
- Hermes fallback order: `openai` → `ollama`
- All config edits on VM via `docker exec`, then sync to local workspace
- SOUL.md loaded fresh each message — no restart needed for behavior changes
- **When env vars or config need changing — just do it and notify.** Don't leave placeholders.
- **Zulip API URL must use `https://chat.zb.example.com`** (not `http://zulip:80`) — Node's fetch won't override Host header, and Zulip rejects mismatched hosts.

## ⛔ Critical Rules

- **NEVER modify files inside the Hermes container image as permanent fixes.** Files under `/opt/hermes/` (including `tools/mcp_tool.py`, `gateway/`, `plugins/`, etc.) get wiped on every upstream `nousresearch/hermes-agent` image update. Only modify: `config.yaml` (`/opt/data/config.yaml`, persisted via volume mount), files in mounted volumes (`./mcp:/opt/mcp`, `./data:/opt/data`), and our own code in `synth-stack/`, `hermes-stack/` compose files. Temporary `docker exec` patches for debugging are OK but must **always** be removed before session ends.
