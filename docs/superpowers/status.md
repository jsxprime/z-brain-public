# Z-Brain Superpowers Status

> Last updated: 2026-06-10T20:00:00-04:00 (Session: e90e6146)
## Current State — Healthy ✅ | Z-Brain Ecosystem LIVE 🧠 | CORE Pipeline ✅ RESTORED | Memory Search ✅ FIXED | synth-mcp ✅ FULLY OPERATIONAL | Hermes Desktop ✅ REMOTE ACCESS | Z-Brain Chronicle ✅ LAUNCHED | Hermes Native MCP ✅ DEPLOYED | Fable 5 Fixes ✅ DEPLOYED

### Core Services
- ✅ **CORE Memory Pipeline** — v0.7.15, running. Episode pipeline restored. Routing via `CHAT_PROVIDER=openai` + `OPENAI_BASE_URL` proxy to OpenRouter. See `docs/maintenance/core-version-tracking.md` for upgrade protection.
- ✅ **Hermes Agent (Zella)** — v0.16.0 (pinned `sha256:246fd54b`), all platforms connected. **s6-overlay bootstrap restored to official upstream design.** UID remapped to 1001 (matching host YOUR_VM_USER). MCP bridge running as s6-supervised longrun service.
- ✅ **CORE Semantic Search** — **FIXED.** `EMBEDDING_MODEL_SIZE` corrected from 768→1024 (matches `mxbai-embed-large` native output and existing DB vectors/indexes). `gemini-embedding-2` (1024-dim) undeprecated as fallback. `memory_search` MCP tool verified returning results.
- ✅ **Hermes Native MCP** — Built-in `mcp_serve.py` exposed on port 8643 via SSE/HTTP. 10 tools (conversations, messages, events, permissions). Registered as `hermes-native` in Antigravity IDE MCP config. Runs alongside z-relay (additive, not replacement).
- ✅ **Hermes Desktop** — Remote access via `zella.zb.example.com` (Traefik TLS). Native `_SESSION_TOKEN` auth. 3 Mac deployment (1/3 connected). Dashboard TUI mode enabled.
- ✅ **synth-mcp** — FULLY OPERATIONAL. Fixed triple bug: (1) config entry was under `streaming:` instead of `mcp_servers:`, (2) URL pointed to wrong port (3080→3081), (3) raw-transport.js imported diagnostic minimal server instead of real server. All 8 tools verified working: `wikijs_create_page`, `wikijs_update_page`, `zulip_post_message`, `synthesizer_status`, `synthesizer_pause`, `synthesizer_resume`, `synthesizer_force_reprocess`, `synthesizer_backfill`.
- ✅ **OpenBrain Server** — running at `core.zb.example.com`. **SDK migrated to @google/genai v1.0.**
- ✅ **Memory Ingest / Search** — MCP tools working. **Neo4j: delete_entities + delete_relations tools added.** **Bug #2 fix: memory_ingest now rejects undefined/empty messages with clear error instead of crashing silently.**

### Z-Brain Ecosystem
- ✅ **Traefik** — reverse proxy with Let's Encrypt wildcard cert for `*.zb.example.com` (Cloudflare DNS-01 challenge). Confirmed NOT interfering with Docker-internal traffic (verified via live curl from hermes-agent to synth-app:3081).
- ✅ **Zulip** — chat at `chat.zb.example.com`. Topic-threaded. Outgoing webhooks → Synthesizer.
- ✅ **Wiki.js** — wiki at `wiki.zb.example.com`. GraphQL poller → Synthesizer (5-min interval). Zella successfully published article (page ID: 5).
- ✅ **Memory Synthesizer** — Node.js daemon at `synth.zb.example.com`. Processes Zulip/Wiki.js events through LLM, commits to OpenBrain. **Worker rewritten to claim→process→record pattern with idempotency keys.** Queue: 9 completed, 0 failed. **MCP server at :3081/sse with raw HTTP transport + full instrumentation.**
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
| CORE Chat/Extraction | OpenAI SDK → OpenRouter | `openai/anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| CORE Embeddings | Ollama (local) | `mxbai-embed-large` (1024-dim native) | `http://YOUR_OLLAMA_HOST:11434` |
| Hermes Primary (config default) | OpenRouter | `nvidia/nemotron-3-super-120b-a12b` | `https://openrouter.ai/api/v1` |
| Hermes Fallback 1 | OpenAI | `gpt-4o-mini` | `https://api.openai.com/v1` |
| Hermes Fallback 2 | Ollama (local) | `gemma4:26b-mlx` | `http://YOUR_OLLAMA_HOST:11434/v1` |
| Cron Jobs (pinned) | OpenRouter | `anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| OpenBrain Server (Chat) | OpenRouter | `openai/gpt-4o-mini` | `https://openrouter.ai/api/v1` |
| OpenBrain Server (Embed) | OpenRouter | `google/gemini-embedding-2-preview` | `https://openrouter.ai/api/v1` |
| OpenBrain (Embed Fallback) | Google AI Studio | `gemini-embedding-2` | `https://generativelanguage.googleapis.com` |
| OpenBrain (Fallback) | Ollama (local) | `gemma4:26b-mlx` | `http://YOUR_OLLAMA_HOST:11434/api/chat` |
| Synthesizer LLM | Hermes Agent | via `hermes-agent:8642` | Internal Docker network |

## Architecture — Automatic Pipeline

```
Zulip message → Webhook → events table → Worker → [LLM Extraction] → OpenBrain → Vector DB
Wiki.js edit  → Poller  → events table ↗        (the only AI step)
```

Everything from event capture to memory storage runs autonomously 24/7. The only AI model call is the extraction step. If the LLM API goes down, events queue and retry automatically.

## Session Work Completed

**Session e90e6146 (Current — Fable 5 Implementation + Bug Fixes)**
Executed all 5 items from the Fable 5 Memory Architecture Review implementation plan, plus discovered and fixed 2 additional core-app bugs.

1. **Item 1 — core-app crash investigation:** Determined the 41h episodic ingestion gap was caused by manual container cycling during debugging, not a crash loop or poison BullMQ job. Two non-fatal bugs discovered during investigation (see below).
2. **Item 2 — Extraction prompt fix:** Removed threshold disclosure from `prompts.js` (the model was told 0.6 = quarantine, anchoring it to never score below). Added rubric-anchored confidence scale (0.1-1.0 with explicit definitions), self-containment rules (no pronouns, no "we"), date anchoring (convert relative to absolute), max 3 extractions per event (selectivity pressure). Raised `max_tokens` 2000→4000. Made JSON parse failure throw (retryable) instead of returning `[]` (silent data loss).
3. **Item 3 — Neo4j entity dedup:** Executed 7-step Cypher script to merge 23 cross-origin duplicate entities. Migrated `name_key` property (NFKC-normalized, lowercased, trimmed). Created uniqueness constraint on `name_key`. Deployed write-time prevention in `neo4j-memory/index.js`: `normKey()` function, MERGE on `name_key`, observation append (not clobber), case-insensitive search, `type` in MERGE pattern for relations.
4. **Item 4 — Daily morning brief cron:** Already existed from prior session. Verified correct job definition with 7 toolsets.
5. **Item 5 — Synth worker transaction fix:** Full rewrite of `worker.js` to 3-phase claim→process→record pattern. Phase 1 commits immediately (no row locks during LLM calls). Per-event independence (one failure doesn't roll back others). Idempotency key (`{event_id}:{sha256(content)[:16]}`) prevents duplicate OpenBrain commits on retry. Migration 003 for `idempotency_key` column + unique index.
6. **Bug #2 — memory_ingest TypeError (DATA LOSS):** `handleMemoryIngest` crashed with `TypeError: Cannot read properties of undefined (reading 'match')` when called with undefined `message` parameter. The error was caught, logged, and returned as HTTP 200 — silently dropping the episode. Root cause: `countTokens()` → `gpt-tokenizer encode()` called on undefined string. **Fix:** Input guard rejecting empty/undefined messages before any processing. **Deployed via bind mount** of patched `server-build-dYxw1cQH.js` in docker-compose.
7. **Bug #1 — MCP session heartbeat noise:** `prisma.mCPSession.update()` threw "Record to update not found" every ~3 min. Root cause: `deleteSession()` used `prisma.update()` which throws on missing records — triggered when stateless transport `onclose` fires for sessions that were never persisted to DB. **Fix:** Changed to `updateMany` with `deleted:null` filter (no-throw, idempotent). **Deployed via same bind mount.**

**Commits:** `27d327f` (synth-stack + neo4j-memory fixes), `9e8f1d1` (core-app bind-mount patches)

**🔴 NEXT SESSION PRIORITY — READ FIRST**
**Continue Fable 5 Architectural Recommendations.** The 5 implementation items are complete. Four significant architectural recommendations remain:
- **⚠️ #5: Single `recall` facade tool** — Fuse episodes/statements/graph/OpenBrain into one `recall(query, opts)` MCP tool that fans out, fuses results, and returns one ranked list with provenance tags. This is the highest-leverage remaining item — agents don't query memory because it requires knowing the topology of 4 different stores.
- **⚠️ #6: Session-start recall hook** — Make recall mandatory at session start (not hope-based). Requires z-relay MCP loading fix first. Add decision-time capture convention ("when you make a decision, capture it immediately with type=decision").
- **#8: Complete temporal fields** — `created_at`/`valid_at` partially done on new relations. Need `invalid_at` + invalidation-on-contradiction for functional relations (same subject, same type, different object → set `invalid_at` on old edge).
- **#9: Unify Hermes memory access** — Retire `skip_memory` special-casing. Default memory toolsets on in cron. Every Zella invocation (Telegram, API, cron) should see the same memory through the same interface.
- **#10: Route synth output into CORE ingestion** — Synth currently commits to OpenBrain only. Should also emit into CORE's `ingest-episode` queue so Zulip/Wiki.js content gets entity/statement extraction. LLM-chosen domain instead of config-hardcoded.
- **Full Fable 5 review:** `docs/reports/claude/2026-06-10_fable5-memory-review.md`

**Other Priorities (lower)**
- **DeepInfra model routing** — the operator requested: make DeepInfra the provider when Nemotron Super 3 is chosen through OpenRouter. NOT STARTED.
- **Review CORE stashed patches** — 4 local patches in `git stash`
- **Dashboard polish** — use `impeccable` skill to refine the UI
- **⚠️ REMINDER:** Rotate 6 local secrets (Hermes API key, Telegram bot token, Gemini key, OpenRouter key, host-ops secret, GitHub PAT in hermes-stack/data/config.yaml).

**📝 CONTENT PROJECT (flagged by user)**
- **Z-Brain Build Story** — Extract the full build journey into a blog post series or narrative. Raw material: conversation transcripts (JSONL), status.md session summaries, OpenBrain captures, artifacts (debug reports, cross-model critiques, implementation plans). Key beats: cross-model architecture brainstorming → Zulip routing mystery → Phase 2 TDD handoff to Gemini → Hermes upgrade with zero data loss → the Gateway Boot Paradox. Meta-theme: building a memory system for an AI, debugged by another AI, verified by a third. Follows the Meta-Content Cascade strategy from Slopthing.

## Key Preferences

- **NO direct Google API key** — route Google models through `openrouter`.
- Hermes fallback order: `openai` → `ollama`
- All config edits on VM via `docker exec`, then sync to local workspace
- SOUL.md loaded fresh each message — no restart needed for behavior changes
- **When env vars or config need changing — just do it and notify.** Don't leave placeholders.
- **Zulip API URL must use `https://chat.zb.example.com`** (not `http://zulip:80`) — Node's fetch won't override Host header, and Zulip rejects mismatched hosts.

## ⛔ Critical Rules

- **NEVER modify files inside the Hermes container image as permanent fixes.** Files under `/opt/hermes/` (including `tools/mcp_tool.py`, `gateway/`, `plugins/`, etc.) get wiped on every upstream `nousresearch/hermes-agent` image update. Only modify: `config.yaml` (`/opt/data/config.yaml`, persisted via volume mount), files in mounted volumes (`./mcp:/opt/mcp`, `./data:/opt/data`), and our own code in `synth-stack/`, `hermes-stack/` compose files. Temporary `docker exec` patches for debugging are OK but must **always** be removed before session ends.
- **CORE model routing: `MODEL` MUST use `openai/` prefix** (e.g., `openai/anthropic/claude-sonnet-4`). CORE's `getProvider()` splits on the first `/` — without the `openai/` prefix, `anthropic/*` models route to `api.anthropic.com` directly instead of through the OpenRouter proxy. After any CORE upgrade, verify: (1) `MODEL` env var still has `openai/` prefix, (2) `LLMModel` table doesn't have re-enabled GPT/Anthropic models overriding the env var, (3) test episode ingest succeeds. See `docs/maintenance/core-version-tracking.md`.
- **core-app bind-mount patches survive container restarts but NOT image rebuilds.** The patched `server-build-dYxw1cQH.js` in `~/docker/core-stack/patches/` is bind-mounted read-only. After any CORE upstream rebuild, re-extract the bundle, re-apply the patches, and update the bind mount path if the filename hash changes.
