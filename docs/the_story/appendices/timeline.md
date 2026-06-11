# Z-Brain Timeline

> A chronological record of major events, decisions, and milestones in the Z-Brain project.

This timeline is reconstructed from session logs in `docs/superpowers/status.md`, conversation transcripts, git history, and interview notes. Dates are approximate where noted.

---

## Phase 0: Genesis

### ~Late April – Early May 2026
- **Concept crystallized.** The idea of a self-hosted, persistent AI agent with real memory — not just conversation history, but vector-embedded semantic memory in a database you own.
- **Influenced by:** Nate B. Jones's "Open Brain" concept and philosophy. Also informed by prior experience building [Slopthing.com](https://slopthing.com) with agentic collaboration (Payload CMS, Antigravity IDE).
- **Key decision:** Memory-first architecture. The center of gravity is the memory layer (pgvector + Neo4j), not the model. Models can be swapped without losing the agent's identity, history, or capabilities.

---

## Phase 1: Foundation

### ~May 2026 (Early)
- **CORE Memory Pipeline deployed** — Node.js service with Postgres (pgvector, 1024-dim embeddings), Neo4j temporal graph, Redis + BullMQ queue.
- **OpenBrain Server stood up** — The vector search API layer over the CORE database.
- **Hermes Agent (Zella) deployed** — NousResearch's hermes-agent running in Docker on the homelab VM (YOUR_VM_IP). Connected to Telegram for the primary user interface.
- **Initial provider chain:** Google Generative AI for embeddings (`text-embedding-004`), direct provider APIs for chat.

### The Amnesia Incident (~May 27, 2026)
- **💥 Catastrophic failure.** Google Generative AI API prepayment credits depleted. All embedding calls return `429 Too Many Requests`. Background ingestion jobs pile up in Redis `ingest-queue:failed`. Zella loses access to `session_search` and memory retrieval — effectively amnesia.
- **24-hour migration response:**
  - Embedding engine → local Ollama running `mxbai-embed-large` (1024 dimensions)
  - Chat routing → OpenRouter, standardizing on `anthropic/claude-sonnet-4`
  - Fallback chain → Local Ollama → Abacus → OpenRouter
  - Queue recovery → `ingest-queue:failed` backlog flushed and retried
  - Hermes model router tiers updated from dead `openai-codex` models to OpenRouter Anthropic
  - Config protection rules added to SOUL.md
- **Documented:** `docs/maintenance/2026-05-27_core-memory-pipeline-migration.md`

### Code Review (~May 26, 2026)
- Claude Code (Opus 4.7) performed a read-only review of the entire Z-Brain codebase. No modifications made. Findings captured in `docs/code-review-2026-05-26.md`.

---

## Phase 2: The Organism

### Session 9f4a44a1 — Architecture & Planning
- **Superbrainstorming session** with cross-model critique (Claude Opus 4.7 + ChatGPT 5.5).
- **Decisions:**
  - Zulip for chat (topic-threaded, webhook-capable)
  - Wiki.js for knowledge base (GraphQL API)
  - Custom Memory Synthesizer (Node.js) for LLM-powered event extraction
  - Next.js Dashboard for operational control
  - Dedicated `synth-postgres` (not SQLite)
  - `SELECT FOR UPDATE SKIP LOCKED` queue pattern
  - Confidence-based quarantine (< 60%)
  - OKLCH dark theme for dashboard
- **Implementation plans written:**
  - Phase 1A: Memory Synthesizer Pipeline (2,247-line TDD plan, 15 tasks, 16 tests)
  - Phase 1B: Z-Brain Dashboard (1,971-line plan, 17 tasks)
  - Deployment plan for Traefik + all services
- **Execution delegated to Gemini 3.1 Pro** in separate sessions

### Session 0faa5955 — Ecosystem Deployment
- **Zella CLI Proxy built:** Host-Ops daemon (Node.js/Express at YOUR_VM_IP:8650), systemd-managed.
- **OpenBrain capture rewritten** from broken REST POST to working MCP SSE protocol.
- **Z-Brain Dashboard deployed:** Fixed routing and connection issues. Connected to `synth-postgres` for real-time stats.
- **Wiki.js GraphQL Poller deployed:** Custom pull-based poller (5-min interval) replacing broken native webhooks. Idempotent via `last_event_timestamp` tracking in Postgres.
- **Critical bug found and fixed:** Accidental rsync overwrite of `.env` on VM caused `401 Unauthorized` on all LLM extraction calls.

---

## Phase 3: Agent Tooling & Hardening

### Session b5a2351d — Phase 2 Agent Tooling
- **MCP tooling plan** — 12-task TDD implementation plan for agent tools.
- **Merge fix** — Restored WikiJsPoller and `pollIntervalMs` lost during feature branch merge.
- **Alpine IPv6 bug** — Dockerfile healthcheck `wget localhost` resolved to `::1` but Node listens on `0.0.0.0`. Fixed to `127.0.0.1`.
- **Zulip bot credentials** — Found existing `zella-bot` in Zulip DB, extracted API key, replaced placeholder in VM `.env`.
- **"Already connected to transport" crash** — Singleton McpServer → per-session instances.
- **Zulip routing mystery** — `ZULIP_API_URL` changed from `http://zulip:80` to `https://chat.zb.example.com` because Node's `fetch` won't override the `Host` header and Zulip rejects mismatched hosts.
- **SOUL.md updated** with Z-Brain Ecosystem Tools section (all 8 tool descriptions).
- **48 local commits pushed to GitHub.**

### Session e6afc740 — Zella Bug Fixes
- **Wiki.js tool bypass fixed** — Zella had been dumping `WIKIJS_API_KEY` from container environment when MCP tool was unavailable. SOUL.md updated with security rules.
- **Context compression restored** — Zella was dropping middle conversation turns. All `auxiliary` background tasks migrated from failing `openai` provider to `openrouter` (`openai/gpt-4o-mini`).
- **`HERMES_HOME` env var added** — Fixed SOUL.md loading failure.
- **Terminal backend → `local`** — Prevents Zella from escaping container to host VM during API calls.
- **TUI ghost connection discovered** — `hermes chat` CLI still connects via ghost SSH session to host despite config removal. Flagged for future investigation.

---

## Phase 4: Operational Maturity

### Session 1a6a81be — Ops Hardening & synth-mcp Fix
- **Telegram session audit** — Reviewed Zella's session `20260603_093019_f7461f40`. Found 5 error categories: Docker socket self-abuse, wiki tool failures, browser workarounds, DeepSeek model errors, Hermes Desktop research tangents.
- **SOUL.md Execution Context** — Taught Zella she runs *inside* the hermes-agent container. Correct/incorrect path examples, Docker socket restriction rules, filesystem editability flags.
- **Docker image pinning** — All 5 infrastructure images pinned to SHA256 digests across all compose files.
- **Hermes upgraded to v0.15.2.**
- **synth-mcp triple bug fix:**
  1. Config entry was under `streaming:` instead of `mcp_servers:` — Hermes never loaded it
  2. URL pointed to `3080/mcp` instead of `3081/sse`
  3. `raw-transport.js` imported diagnostic `server-minimal.js` instead of real `server.js`
- **Wiki.js article published by Zella** — First successful use of `wikijs_create_page` tool (page ID: 5).
- **Terminal backend investigation** — Hermes terminal backends for containerized deployments. 3 open P2 bugs on Docker backend. Stayed on `local` with SOUL.md restrictions.

### Session e03cd5be — synth-mcp Resolution
- **10-point instrumentation patch** applied inside Hermes container via `docker exec`.
- **7/7 restart tests passed** — synth-mcp confirmed stable.
- **Cross-model critique workflow tested** — Submitted original Streamable HTTP migration plan to Claude Opus 4.8. Opus identified diagnosis/treatment mismatch. Plan rewritten.
- **Critical rule established:** Never modify files inside the Hermes container image (`/opt/hermes/`). Only modify bind-mounted volumes (`/opt/data/`, `/opt/mcp/`).

### Session 05f5df02 — Hermes + CORE Upgrade
- **Hermes v0.14.0 → v0.15.1** — Zero data loss (237 sessions, 7,142 messages).
- **CORE v0.7.13 → v0.7.14** — 20 upstream commits. Includes Ollama `toOllamaApiBase()` fix.
- **Cross-model plan review** — Codex (gpt-5-codex) and Claude Opus 4.8 independently reviewed upgrade plan. Both identified 6 critical issues. All incorporated.
- **MCP mount fix** — `./mcp:/opt/mcp` volume was missing from compose. `telegram_push` and `neo4j_memory` MCP servers had never been mounted. Fixed — all 7 MCP servers connected.
- **Backup suite created:** Atomic SQLite `.backup`, full data tarball (945 MB), Postgres dump (18 MB), Docker image tarball (2.5 GB).

---

## Phase 5: Intelligence & Autonomy

### Session 4e3a9fc4 — Cron Job Fix
- **Root-caused all 4 cron jobs.** Two script-based (Docker Stack Monitor, File System Monitor) were healthy. Two LLM-based were broken.
- **Memory Systems Health Check fixed** — Was crashing every 3 hours with `RuntimeError: Model generated invalid tool call: terminal`. Fix: corrected `enabled_toolsets`, removed dead skill reference, rewrote prompt.
- **Neo4j KG Auto-Update fixed** — Had only `[terminal]` toolset so couldn't mine conversations or reach Neo4j MCP. Fix: added `session_search`, pinned model to `anthropic/claude-sonnet-4`.
- **Default model reliability issue discovered** — `nvidia/nemotron-3-super-120b-a12b` causes 180s stream stalls on OpenRouter for cron workloads. Cron jobs pinned to `claude-sonnet-4`.

### Session 7f2001ab — Cron MCP Toolset Fix
- **Root-cause investigation** — Read Hermes source code (`scheduler.py`, `model_tools.py`, `toolsets.py`, `registry.py`, `mcp_tool.py`) AND asked Zella for her first-person account. Both confirmed the same root cause from different perspectives.
- **Root cause:** `discover_mcp_tools()` IS called in cron, but `enabled_toolsets` acts as a strict whitelist filter. MCP tools are discovered but filtered out before the agent sees them. Zella's report of "MCP unavailable" was experientially accurate but mechanistically imprecise.
- **Fix:** Added `neo4j_memory`, `openbrain`, `telegram_push` to cron job enabled_toolsets. All 7 pending Neo4j entities written successfully on first run.
- **Investigation artifact** compared source code findings with Zella's first-person account. Source code won on mechanism; Zella won on symptom identification.

---

## Phase 6: Public Presence & Desktop

### Session cc5ffd84 — Public Repository
- **Repository sanitized** — 33 files scrubbed: IPs, usernames, emails, domains.
- **Git history scrubbed (4 passes)** — `git-filter-repo`: API keys/IPs/usernames → emails/author metadata → domain `example.com` → Ollama IP/personal name/private repo refs.
- **Comprehensive README** written for public repo.
- **`jsxprime/z-brain-public` published** on GitHub. Push Protection scan passed.
- **Automated sync script** created — `scripts/public-sync/sync-to-public.sh` with `--dry-run`, auto-verification, gitignored config.
- **⚠️ 6 local secrets flagged for rotation** (Hermes API key, Telegram bot token, Gemini key, OpenRouter key, host-ops secret, GitHub PAT).

### Session 05c2bb51 — Strategic Brainstorm
- **Three Brains analysis** — Mapped Chris Lema's "Your AI Has Three Brains" to Z-Brain architecture. Finding: Z-Brain already implements all three composable layers. MCP + status.md + cron jobs form the "spine" Lema says nobody has built.
- **Nate B. Jones integration** — Mapped Jones's four disciplines (Prompt Craft, Context Engineering, Intent Engineering, Specification Engineering) to Z-Brain components.
- **"Real Work" gap identified** — Infrastructure 9/10, utilization 3/10. Three tiers of use cases defined.
- **Content project flagged** — Z-Brain Build Story as multi-tiered content following Slopthing's Meta-Content Cascade.

### Session 7f254e83 — Hermes Desktop Remote Access
- **Hermes upgraded to v0.16.0** for Desktop compatibility.
- **Desktop remote access deployed** — `zella.zb.example.com` via Traefik TLS. Native `_SESSION_TOKEN` auth.
- **Dashboard TUI mode enabled.**
- **Mac 1 of 3 connected successfully.**
- **Design spec written:** `docs/superpowers/specs/2026-06-05-hermes-desktop-remote-design.md`

---

## Phase 7: The Chronicle (Current)

### Session 5198c89f — Documentation Project Launch
- **Decision to document the journey** — the operator recognized that what was built is important and should be shared.
- **Z-Brain Chronicle designed** — Three-layer documentation system (narrative chapters, technical reference, perspectives).
- **Story-capture skill designed** — Event-triggered interview workflow integrated with session sync.
- **Zella given a voice** — First-person AI agent perspective, unprecedented in the field.
- **This timeline created** from reconstruction of all session logs.

---

## Phase 8: Resilience & Recovery (Current)

### Session 50794e9b — Episodic Recency Gap Fix
- **💥 9-day pipeline outage discovered.** CORE episode ingestion had been dead since May 28. Root cause: upstream CORE rebuild (v0.7.14 → v0.7.15) wiped the source patches from the May 27 migration. The `CHAT_PROVIDER=openrouter` configuration relied on custom code that no longer existed.
- **Key discovery: CORE's built-in OpenAI proxy path.** Read the compiled `server-build-3i94IH5G.js` source and found that CORE natively supports routing through any OpenAI-compatible endpoint via `OPENAI_BASE_URL` + `OPENAI_API_MODE=chat_completions`. No source patches needed — the capability was always there.
- **Critical routing fix: `MODEL=openai/anthropic/claude-sonnet-4`.** CORE's `getProvider()` splits on the first `/` to determine provider routing. Without the `openai/` prefix, `anthropic/claude-sonnet-4` routes to `api.anthropic.com` directly (with no API key → `invalid x-api-key`). The `openai/` prefix forces the OpenAI proxy path.
- **5 real episodes recovered** from the June 1-4 failure period (Chris Lema Three-Brain analysis, MemPalace evaluation, artifact pipeline design, CrowdSec Q&A, personal conversation).
- **Database cleanup:** Disabled GPT-5.x, direct Anthropic, and Azure models from the `LLMModel` table (no keys for those providers on this deployment).
- **BullMQ/Postgres disconnect discovered:** Updating `IngestionQueue.status` in Postgres does NOT create Redis jobs. BullMQ tracks job state in Redis independently. Must restart CORE or re-submit via API.
- **OpenBrain SDK migrated:** `@google/generative-ai` → `@google/genai` (SDK 1.0).
- **Neo4j cleanup:** 13 stale/duplicate entities cleaned. `delete_entities` and `delete_relations` tools added to neo4j-memory MCP.
- **CORE version tracking established:** `docs/maintenance/core-version-tracking.md` — pre-upgrade checklist and post-upgrade verification for future CORE updates.
- **Documented:** `docs/maintenance/2026-06-06_episodic-recency-gap-fix.md`

### Session 8c02e948 — Hermes s6-Overlay Restore & Memory Pipeline Repair
- **💥 Hermes running outside s6-overlay.** Custom `entrypoint:` in docker-compose.yml had been bypassing the official `/init` bootstrap since a prior debugging session. Result: hermes ran as UID 10000 (not host-matching), skills directory was root-owned, Docker socket group wasn't set, MCP bridge ran unsupervised as root.
- **Fix: restored upstream design.** Removed entrypoint override, added `HERMES_UID=1001`/`HERMES_GID=1001` (matching host `YOUR_VM_USER`), created MCP bridge as proper s6 longrun service (same pattern as built-in dashboard), fixed file ownership.
- **Cross-model plan review:** GPT-5.5 (via Codex CLI) reviewed the deployment plan before execution. Identified 3 improvements (UID pre-flight check, Docker socket group confirmation, absolute Python path).
- **💥 Memory search broken.** Semantic search returning "No relevant memories found" — degraded since May 27. Root cause chain: Mac workstation Ollama unreachable → CORE embedding pipeline failures → 712 of 1567 thoughts missing embeddings → `.slice()` crash on null vectors.
- **53 failed ingestion queue jobs** reset and re-processed. 37 orphaned PENDING rows cleaned up.
- **712 missing embeddings backfilled** via custom Python script using Matryoshka truncation (mxbai-embed-large 1024→768 dims, L2 renormalized). All 1567 thoughts now have embeddings.
- **Key discovery: vector dimension mismatch.** Column is `vector(768)` but `.env` said `EMBEDDING_MODEL_SIZE=1024`. CORE handles Matryoshka truncation internally. `.env` corrected to 768.
- **Config sync:** Repo and VM `.env` files synced. `GEMINI_API_KEY=not_needed` added to silence Docker Compose warning.

### Session 73e58237 — Operations Hardening & Timezone Shift
- **Timezone shift to EDT:** Migrated Z-Brain ecosystem from UTC to `America/New_York`. Configured host VM via `timedatectl`, injected `TZ` into compose files, and added `tzdata` to `core-app` Alpine base.
- **Neo4j duplicate relation bug fixed:** Decoupled relation property creation from the `MERGE` clause in the Neo4j MCP plugin to guarantee idempotency and prevent duplicate accumulation on entity updates.
- **Episodic ingestion investigated:** Flagged by SITREP. Verified `core-app` BullMQ worker was healthy and empty; ingestion was idle organically due to no new Telegram interactions, not stalled.
- **Configuration drift incident:** Accidental overwrite of live `docker-compose.yml` with outdated local version crashed Hermes (lost `HERMES_UID=1001` leading to `[Errno 13] Permission denied`). Reconstructed live compose file, restored UID, and learned critical lesson about VM/local sync boundaries.

---

## Phase 9: Architectural Review & Hardening

### Session c0ff9750 — Fable 5 Memory Architecture Review
- **First external architectural review.** Claude Fable 5 (claude-fable-5) reviewed the entire memory architecture against a 15K-token briefing document. Produced a 200-line structured report answering 8 architectural questions.
- **Three cross-cutting findings:** (a) Silent failure is the default — error paths catch, log, and continue, making "couldn't check" indistinguishable from "nothing found." (b) Quarantine gate is structurally broken — the prompt tells the model the 0.6 threshold, anchoring it to never score below. (c) Write paths duplicated, read paths missing — no agent has a single `recall()` call fusing memory layers.
- **Top 10 prioritized recommendations** ranging from hours to days of effort, covering memory freshness alarms, extraction prompt fixes, recall facades, session-start hooks, and synth→CORE routing convergence.
- **Entity duplication root-caused** — Fable 5 hypothesized (correctly) that relation duplicates were an entity-resolution bug, not a MERGE bug. 17+ entities had duplicate nodes across CORE and MCP write paths.

### Session e90e6146 — Fable 5 Implementation (Items 1-5 + 2 Bugs)
- **All 5 prioritized items executed in a single session:**
  1. Core-app crash investigation: determined manual container cycling caused the 41h gap (not a crash loop)
  2. Extraction prompt: removed threshold disclosure, added rubric confidence, self-containment rules, date anchoring, max 3 extractions, raised max_tokens 2000→4000, made JSON parse failure retryable
  3. Neo4j entity dedup: 23 duplicate nodes merged via Cypher, uniqueness constraint on `name_key`, write-time prevention deployed in MCP plugin
  4. Daily morning brief cron: already existed from prior session, verified correct
  5. Synth worker: full rewrite to claim→process→record pattern with idempotency keys
- **Two additional bugs discovered and fixed:**
  - **Bug #2 (DATA LOSS):** `memory_ingest` MCP tool crashed silently on undefined `message` parameter. `countTokens()` → `gpt-tokenizer encode()` called on undefined. Returned HTTP 200 with `isError: true` — agents ignored the error and moved on. Fix: input guard rejecting empty messages.
  - **Bug #1 (noise):** `prisma.mCPSession.update()` "Record to update not found" every ~3 min. `deleteSession()` used `.update()` on sessions that were never persisted. Fix: `.updateMany()` with `deleted:null` filter.
  - **Both fixes deployed via bind mount** of patched `server-build-dYxw1cQH.js` — survives restarts, must be re-applied after upstream image rebuild.
- **Commits:** `27d327f` (synth + neo4j), `9e8f1d1` (core-app patches)

## Container Inventory (as of 2026-06-05)

22 containers across 8 stacks on VM YOUR_VM_IP:

| Stack | Containers |
|---|---|
| core-stack | core-app, core-postgres, core-redis, core-neo4j, openbrain-server |
| hermes-stack | hermes-agent |
| traefik | traefik |
| zulip-stack | zulip, zulip-database, zulip-memcached, zulip-rabbitmq, zulip-redis |
| wikijs-stack | wikijs, wikijs-database |
| synth-stack | synth-app, synth-postgres |
| dashboard | zbrain-dashboard |
| other | portainer, dockge, zella-speedtest |

## Provider Configuration (as of 2026-06-09)

| Component | Provider | Model |
|---|---|---|
| CORE Chat/Extraction | OpenAI SDK → OpenRouter | `openai/anthropic/claude-sonnet-4` |
| CORE Embeddings | Ollama (local) | `mxbai-embed-large` (768-dim, Matryoshka from 1024) |
| Hermes Primary | OpenRouter | `nvidia/nemotron-3-super-120b-a12b` |
| Hermes Fallback 1 | OpenAI | `gpt-4o-mini` |
| Hermes Fallback 2 | Ollama (local) | `gemma4:26b-mlx` |
| Cron Jobs (pinned) | OpenRouter | `anthropic/claude-sonnet-4` |
| OpenBrain Chat | OpenRouter | `openai/gpt-4o-mini` |
| OpenBrain Embed | OpenRouter | `google/gemini-embedding-2-preview` |
| Synthesizer LLM | Hermes Agent | via internal Docker network |

---

*This timeline is a living document. It is updated at session teardown as part of the story-capture workflow.*
