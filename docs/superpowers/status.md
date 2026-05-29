# Z-Brain Superpowers Status

> Last updated: 2026-05-28T22:07:00-04:00 (Session: b5a2351d)
## Current State — Healthy ✅ | Z-Brain Ecosystem LIVE 🧠 | Phase 2 COMPLETE ✅

### Core Services
- ✅ **CORE Memory Pipeline** — running, OpenRouter limit increased.
- ✅ **Hermes Agent (Zella)** — online, fallback chain properly restored to `openai`.
- ✅ **OpenBrain Server** — running at `core.zb.example.com`.
- ✅ **Memory Ingest / Search** — MCP tools working.

### Z-Brain Ecosystem
- ✅ **Traefik** — reverse proxy with Let's Encrypt wildcard cert for `*.zb.example.com` (Cloudflare DNS-01 challenge).
- ✅ **Zulip** — chat at `chat.zb.example.com`. Topic-threaded. Outgoing webhooks → Synthesizer.
- ✅ **Wiki.js** — wiki at `wiki.zb.example.com`. GraphQL poller → Synthesizer (5-min interval).
- ✅ **Memory Synthesizer** — Node.js daemon at `synth.zb.example.com`. Processes Zulip/Wiki.js events through LLM, commits to OpenBrain. Queue: 9 completed, 0 failed. **Now includes MCP server at `/mcp` with 8 agent tools.**
- ✅ **Z-Brain Dashboard** — Next.js control center at `dash.zb.example.com`. Pipeline view, quarantine review, memory browser, service health.
- ✅ **synth-postgres** — dedicated Postgres for Synthesizer (database: `synthesizer_db`), isolated from core_brain.

### Phase 2: Agent Tooling (NEW — deployed this session)
- ✅ **synth-mcp** — MCP server embedded in synth-app, Streamable HTTP at `POST /mcp`
- ✅ **Zulip posting** — `zulip_post_message` tool verified end-to-end (message ID: 19 posted to #general)
- ✅ **Wiki.js pages** — `wikijs_create_page`, `wikijs_update_page` tools deployed
- ✅ **Pipeline controls** — `synthesizer_pause`, `synthesizer_resume`, `synthesizer_status`, `synthesizer_force_reprocess`, `synthesizer_backfill`
- ✅ **Hermes integration** — synth-mcp registered in Hermes config.yaml via mcp-remote
- ✅ **Zella SOUL.md** — Updated with tool usage guidance, loaded fresh each message
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

## Provider Configuration

| Component | Provider | Model | Endpoint |
|-----------|----------|-------|----------|
| Hermes Primary | OpenRouter | `anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| Hermes Fallback 1 | OpenAI | `gpt-4o-mini` | `https://api.openai.com/v1` |
| Hermes Fallback 2 | Ollama (local) | `gemma4:26b-mlx` | `http://YOUR_OLLAMA_HOST:11434/v1` |
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

**Next Session Priority**
- **Dashboard polish** — use `impeccable` skill to refine the UI now that real data is flowing
- **End-to-end Wiki.js test** — verify `wikijs_create_page` tool works through Hermes
- **Extraction prompt tuning** — review quarantined memories, refine confidence thresholds
- **Zulip stream setup** — create dedicated streams (engineering, homelab, decisions) for organized memory capture
- Investigate/Fix: Zella's `terminal.backend` is set to `ssh` — reconfigure local executor

**Session b5a2351d (Current — Phase 2 Agent Tooling)**
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
