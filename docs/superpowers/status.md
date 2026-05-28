# Z-Brain Superpowers Status

> Last updated: 2026-05-28T01:17:00-04:00 (Session: 8dcc1fc9)
## Current State — Healthy ✅
- ✅ **CORE Memory Pipeline** — running, OpenRouter limit increased.
- ✅ **Hermes Agent (Zella)** — online, fallback chain properly restored to `openai`.
- ✅ **CLI Chat Plugin** — deployed, all 3 CLIs operational (Claude, Codex, Antigravity).
- ✅ **Host-Ops Daemon** — running as systemd service, port 8650.
- ✅ **OpenBrain Capture** — MCP SSE capture working, CLI turns indexed automatically.
- ✅ **Memory Ingest** — MCP tool working.
- ✅ **Memory Search** — vector similarity search returning results.
- ✅ **Skill Sync Permissions** — fixed. `tar` now ignores permissions during SSH extraction, and validation spam from MCP pings has been silenced.
## Provider Configuration

| Component | Provider | Model | Endpoint |
|-----------|----------|-------|----------|
| Hermes Primary | OpenRouter | `anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| Hermes Fallback 1 | OpenAI | `gpt-4o-mini` | `https://api.openai.com/v1` |
| Hermes Fallback 2 | Ollama (local) | `gemma4:26b-mlx` | `http://YOUR_OLLAMA_HOST:11434/v1` |
| OpenBrain Server (Chat) | OpenRouter | `openai/gpt-4o-mini` | `https://openrouter.ai/api/v1` |
| OpenBrain Server (Embed) | OpenRouter | `google/gemini-embedding-2-preview` | `https://openrouter.ai/api/v1` |
| OpenBrain (Fallback) | Ollama (local) | `gemma4:26b-mlx` | `http://YOUR_OLLAMA_HOST:11434/api/chat` |

## Session Work Completed

**Next Session Priority**
- Brainstorm: CLI passthrough mode (direct Telegram-to-CLI without Zella intermediating)
- Brainstorm: Agent+Human wiki built on memory systems (browsable, searchable, editable)
- Brainstorm: Self-hosted Discord-like chat platform for multi-agent communication

**Session 8dcc1fc9 (Current)**
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
