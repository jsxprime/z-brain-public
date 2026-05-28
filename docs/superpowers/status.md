# Z-Brain Superpowers Status

> Last updated: 2026-05-28T18:20:00-04:00 (Session: 9f4a44a1)
## Current State — Healthy ✅ | Z-Brain Ecosystem LIVE 🧠

### Core Services
- ✅ **CORE Memory Pipeline** — running, OpenRouter limit increased.
- ✅ **Hermes Agent (Zella)** — online, fallback chain properly restored to `openai`.
- ✅ **OpenBrain Server** — running at `core.zb.example.com`.
- ✅ **Memory Ingest / Search** — MCP tools working.

### Z-Brain Ecosystem (NEW — deployed this session)
- ✅ **Traefik** — reverse proxy with Let's Encrypt wildcard cert for `*.zb.example.com` (Cloudflare DNS-01 challenge).
- ✅ **Zulip** — chat at `chat.zb.example.com`. Topic-threaded. Outgoing webhooks → Synthesizer.
- ✅ **Wiki.js** — wiki at `wiki.zb.example.com`. GraphQL poller → Synthesizer (5-min interval).
- ✅ **Memory Synthesizer** — Node.js daemon at `synth.zb.example.com`. Processes Zulip/Wiki.js events through LLM, commits to OpenBrain. Queue: 8 completed, 0 failed.
- ✅ **Z-Brain Dashboard** — Next.js control center at `dash.zb.example.com`. Pipeline view, quarantine review, memory browser, service health.
- ✅ **synth-postgres** — dedicated Postgres for Synthesizer (database: `synthesizer_db`), isolated from core_brain.

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

## Session Work Completed

**Next Session Priority**
- **Phase 2: Agent Tooling** — Build MCP tools for Hermes/Zella to post in Zulip and write Wiki.js pages
- **Synthesizer control tools** — pause/resume ingestion, force reprocess, backfill
- **Dashboard polish** — use `impeccable` skill to refine the UI now that real data is flowing
- Investigate/Fix: Zella's `terminal.backend` is set to `ssh` — reconfigure local executor

**Session 0faa5955 (Current)**
Deployed and hardened the Z-Brain Memory Synthesizer ecosystem:
1. **Z-Brain Dashboard:** Fixed routing and connection issues for the `zbrain-dashboard` container. Restored proper connection to `synth-postgres` for real-time queue stats and health statuses of OpenBrain, Hermes, and the Synthesizer.
2. **Wiki.js GraphQL Poller:** Pivoted from broken Wiki.js native webhooks to a custom Pull-Based GraphQL Poller. The Synthesizer now runs a daemon querying `http://wikijs:3000/graphql` every 5 minutes, tracking `last_event_timestamp` in Postgres to achieve idempotency and fault-tolerance.
3. **Environment Sync Fix:** Resolved a critical `LLM API error: 401 Unauthorized` extraction failure caused by an accidental rsync overwrite of the `.env` file on the VM. Hardened the `LLM_API_KEY` configuration.

**Session 9f4a44a1 (Current — Architecture & Planning)**
Designed, planned, and orchestrated the complete Z-Brain Ecosystem build:
1. **Architecture Design** — Ran superbrainstorming with cross-model critique (Claude Opus 4.7 + ChatGPT 5.5). Finalized Zulip (chat) + Wiki.js (wiki) + Postgres-backed Memory Synthesizer + Next.js Dashboard.
2. **Phase 1A Plan** — Wrote 2,247-line TDD implementation plan for the Memory Synthesizer Pipeline (15 tasks, 16 tests). Handed to Gemini 3.1 Pro for execution.
3. **Phase 1B Plan** — Wrote 1,971-line implementation plan for the Z-Brain Dashboard (17 tasks). Handed to Gemini 3.1 Pro for execution.
4. **Deployment Plan** — Wrote deployment plan covering Traefik (wildcard TLS for `*.zb.example.com`), Zulip, Wiki.js, Synthesizer, and Dashboard. Handed for execution.
5. **Key Decisions** — Dedicated `synth-postgres` (not SQLite), `SELECT FOR UPDATE SKIP LOCKED` queue pattern, confidence-based quarantine (< 60%), OKLCH dark theme for dashboard.

**Session 0faa5955 (Previous)**

Built and deployed the complete Zella CLI Proxy system:
1. **Host-Ops Daemon** — Node.js Express server at `YOUR_VM_IP:8650`, systemd-managed, runs as `hermes` user. Handles CLI routing, workspace diffing, thread management (SQLite), and async OpenBrain capture via MCP SSE.
2. **CLI Chat Plugin v2** — Hermes native plugin with per-CLI tools (`ask_claude`, `ask_codex`, `ask_antigravity`) plus shared utilities (`list_threads`, `archive_thread`, `fetch_artifact`). Flat Hermes schema format, `handler(args, **kwargs)` dispatch pattern.
3. **Auth Setup** — Created `hermes` user, copied CLI auth tokens from `YOUR_VM_USER`. Fixed PATH for systemd (agy wasn't found).
4. **OpenBrain Capture** — Rewrote from broken REST POST to working MCP SSE protocol (fresh connection per capture, handles "Accepted" response).
5. **Lockdown** — Disabled old `cli_router` plugin. All 3 CLIs verified working end-to-end via Telegram.
6. **Zella Briefed** — Sent comprehensive briefing about new tools and usage patterns.

**Session 2366ea87 (Previous)**
Reviewed Codex's brainstorming documents regarding the Hermes agent host migration. Solidified the decision to keep Hermes containerized to avoid host dependency rot. Concluded that the current `terminal.backend: ssh` to the host as YOUR_VM_USER defeats container isolation. Captured the two-phase boundary hardening roadmap (Quick Wins vs Host-Ops MCP) into OpenBrain memory for the next session.

**Session ebe04539 (Previous)**
Resolved persistent file sync permission errors and MCP validation spam:
1. **File Sync Permissions (ssh.py):** Added `--no-same-owner --no-same-permissions` to the remote `tar xf` command in `/opt/hermes/tools/environments/ssh.py` on the `hermes-agent` container. This prevents `tar` from trying to forcefully change directory permissions (e.g., `chmod rwxr-xr-x`) on the VM during sandbox file syncing, which previously caused `Operation not permitted` failures.
2. **MCP Protocol Validation Spam (mcp/types.py):** Injected a custom `PingNotification` model into the Pydantic schema for `ServerNotificationType` inside the container's SDK (`/opt/hermes/.venv/lib/python3.13/site-packages/mcp/types.py`). This prevents the Python MCP client from throwing 15 validation errors every time `openbrain-server` sends a keep-alive ping.
3. **Ghost Errors:** Confirmed with Zella that a lingering `tar create failed` permission error on `.bundled_manifest` was fully resolved after restarting the container with the applied patches.

**Session f3250ecc (Previous)**
Diagnosed continuing Z-Brain degradation after provider swap:
1. **File Permissions Fixed on Host:** Changed ownership of `/home/YOUR_VM_USER/.hermes/skills/` to `YOUR_VM_USER:YOUR_VM_USER` (from `root`).
2. **Container Data Permissions:** Changed permissions of container mapped dir `/opt/data/skills` to `755` (from `700`) to aid extraction.
3. **Root-Owned Startup Files Fixed:** Fixed `.bundled_manifest` and `.hub` files inside the container that were being incorrectly created as `root:root` by the startup script.
4. **Tar Wrapper Deployed:** Created a global `/usr/local/bin/tar` wrapper on the host injecting `--no-overwrite-dir` to prevent `tar` from trying to `chmod` parent directories (`/`, `/home`) over SSH.
5. **NPM Dependencies:** Installed missing `telegram_push` MCP dependencies (`@modelcontextprotocol/sdk`).
6. **Ongoing Issue Detected:** While the fixes allowed the synchronization pipeline to resume without fatal errors locally, Zella continues to report active `file_sync` errors (`tar: Cannot change mode to rwxr-xr-x: Operation not permitted`), specifically from `tar` extracting over SSH. We have decided to defer the deeper investigation of these persistent `tar` errors to the next session.

**Session 705d2e02 (Previous)**
Diagnosed and resolved Zella's Telegram hallucinations:
1. **Fallback Chain Trap Identified:** Zella's Abacus credits were exhausted, causing her to fall back to the local `gemma4:26b-mlx` model. Because Gemma lacks the complex reasoning needed for Hermes tool orchestration, she began hallucinating tools (e.g., `himalaya`).
2. **Abacus Removed & OpenAI Configured:** Ripped out Abacus entirely. Added `openai` provider to Hermes `config.yaml` to ensure a highly capable "mini" model is always available in the fallback chain.
3. **Fallback Priority Flipped:** Reordered Hermes fallbacks so `openai` is preferred over `ollama`. Ollama is now the absolute last resort for offline survival only.
4. **Google AI Studio Purged:** Stripped all direct `GEMINI_API_KEY` configurations from `openbrain-server` and `core-stack` to ensure all traffic goes through OpenRouter. Note: `core-worker` is currently paused in BullMQ waiting for OpenRouter weekly limits to be increased.
5. **OpenBrain Cost Optimization:** Refactored `openbrain-server/index.js` to dynamically read chat models from `.env`. Transitioned OpenBrain's primary synthesis model from `gemini-2.5-flash` to `openai/gpt-4o-mini` via OpenRouter to save costs. Added a local Ollama `gemma4:26b-mlx` fallback path. Vector embeddings remain safely on `gemini-embedding-2-preview` to prevent vector space corruption.

## Key Preferences

- **NO direct Google API key** — route Google models through `openrouter`.
- Hermes fallback order: `openai` → `ollama`
- All config edits on VM via `docker exec`, then sync to local workspace
- SOUL.md loaded fresh each message — no restart needed for behavior changes
