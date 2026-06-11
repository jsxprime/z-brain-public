# Z-Brain Superpowers Status

> Last updated: 2026-06-11T13:49:00-04:00 (Session: 5086fad4)
## Current State — Healthy ✅ | Z-Brain Ecosystem LIVE 🧠 | CORE Pipeline ✅ RESTORED | Memory Search ✅ FIXED | synth-mcp ✅ FULLY OPERATIONAL | Hermes Desktop ✅ REMOTE ACCESS | Z-Brain Chronicle ✅ LAUNCHED | Hermes Native MCP ✅ DEPLOYED | Fable 5 ✅ 10/10 COMPLETE | Recall Facade ✅ LIVE | OpenBrain Embeddings ✅ UNIFIED 1024-dim

### Core Services
- ✅ **CORE Memory Pipeline** — v0.7.15, running. Episode pipeline restored. Routing via `CHAT_PROVIDER=openai` + `OPENAI_BASE_URL` proxy to OpenRouter. See `docs/maintenance/core-version-tracking.md` for upgrade protection.
- ✅ **Hermes Agent (Zella)** — v0.16.0 (pinned `sha256:246fd54b`), all platforms connected. **s6-overlay bootstrap restored to official upstream design.** UID remapped to 1001 (matching host YOUR_VM_USER). MCP bridge running as s6-supervised longrun service.
- ✅ **CORE Semantic Search** — **FIXED.** `EMBEDDING_MODEL_SIZE` corrected from 768→1024 (matches `mxbai-embed-large` native output and existing DB vectors/indexes). `gemini-embedding-2` (1024-dim) undeprecated as fallback. `memory_search` MCP tool verified returning results.
- ✅ **Hermes Native MCP** — Built-in `mcp_serve.py` exposed on port 8643 via SSE/HTTP. 10 tools (conversations, messages, events, permissions). Registered as `hermes-native` in Antigravity IDE MCP config. Runs alongside z-relay (additive, not replacement).
- ✅ **Hermes Desktop** — Remote access via `zella.zb.example.com` (Traefik TLS). Native `_SESSION_TOKEN` auth. 3 Mac deployment (1/3 connected). Dashboard TUI mode enabled.
- ✅ **synth-mcp** — FULLY OPERATIONAL. All 8 tools verified working.
- ✅ **OpenBrain Server** — running at `core.zb.example.com`. **SDK migrated to @google/genai v1.0.**
- ✅ **Memory Ingest / Search** — MCP tools working. **Neo4j: temporal relation fields deployed, `invalidate_relations` + `search_relations` tools added.**
- ✅ **Synth→CORE Routing** — Worker dual-writes to OpenBrain (primary, **LLM-chosen domain**) + CORE episodic pipeline (secondary, best-effort via MCP Streamable HTTP).
- ✅ **Recall Facade** — NEW. Standalone MCP server at `hermes-stack/mcp/recall/`. Fans out to OpenBrain (SSE), CORE (MCP HTTP), Neo4j (Bolt). Registered in Hermes config. IDE access via z-relay `zella_recall`.
- ✅ **Daily Morning Brief** — Cron at `0 14 * * *` (10 AM EDT). Reads all memory layers, posts structured brief to Telegram + Pushover. Uses Claude Sonnet 4.
- ⚠️ **Synth Pipeline Stale** — Last processed event: June 4 (148h ago). The freshness alarm correctly catches this. Likely needs new Zulip/Wiki.js events to resume processing. Not a bug — pipeline is idle due to no new source events.

### Z-Brain Ecosystem
- ✅ **Traefik** — reverse proxy with Let's Encrypt wildcard cert for `*.zb.example.com` (Cloudflare DNS-01 challenge).
- ✅ **Zulip** — chat at `chat.zb.example.com`. Topic-threaded. Outgoing webhooks → Synthesizer.
- ✅ **Wiki.js** — wiki at `wiki.zb.example.com`. GraphQL poller → Synthesizer (5-min interval).
- ✅ **Memory Synthesizer** — Node.js daemon at `synth.zb.example.com`. **Now with freshness alarm** (`/health/detailed` returns `isStale` when no event processed in 6+ hours). Health Check cron augmented to monitor and escalate via Pushover. **LLM now picks domain per memory from 13 available domains.**
- ✅ **Z-Brain Dashboard** — Next.js control center at `dash.zb.example.com`.
- ✅ **synth-postgres** — dedicated Postgres for Synthesizer (database: `synthesizer_db`).

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
| CORE Chat/Extraction | OpenAI SDK → OpenRouter | `openai/anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| CORE Embeddings | Ollama (local) | `mxbai-embed-large` (1024-dim native) | `http://YOUR_OLLAMA_HOST:11434` |
| Hermes Primary (config default) | OpenRouter | `nvidia/nemotron-3-super-120b-a12b` | `https://openrouter.ai/api/v1` |
| Hermes Fallback 1 | OpenAI | `gpt-4o-mini` | `https://api.openai.com/v1` |
| Hermes Fallback 2 | Ollama (local) | `gemma4:26b-mlx` | `http://YOUR_OLLAMA_HOST:11434/v1` |
| Cron Jobs (pinned) | OpenRouter | `anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| OpenBrain Server (Chat) | OpenRouter | `openai/gpt-4o-mini` | `https://openrouter.ai/api/v1` |
| OpenBrain Server (Embed) | OpenRouter | `google/gemini-embedding-2` (1024-dim, GA) | `https://openrouter.ai/api/v1` |
| Synthesizer LLM | Hermes Agent | via `hermes-agent:8642` | Internal Docker network |

## Architecture — Automatic Pipeline

```
Zulip message → Webhook → events table → Worker → [LLM Extraction] → OpenBrain + CORE (dual-write)
Wiki.js edit  → Poller  → events table ↗        (the only AI step)
```

Everything from event capture to memory storage runs autonomously 24/7. The only AI model call is the extraction step. Worker now dual-writes to OpenBrain (primary, LLM-chosen domain) and CORE (secondary, entity/statement extraction via MCP HTTP).

## Session Work Completed

**Session 5086fad4 (Current — Embedding Unification + Diagnostics)**
Unified all OpenBrain embeddings to 1024-dim, fixed 429 spending cap blocker, diagnosed synth pipeline staleness. Commits: see git log.

1. **OpenBrain embedding model swap:** Changed from `google/gemini-embedding-2-preview` (hitting Google AI Studio 429 spending cap) to `google/gemini-embedding-2` (GA). Fixed both OpenRouter and Gemini SDK fallback paths.
2. **Dimension unification 768→1024:** Altered DB column from `vector(768)` to `vector(1024)`, rebuilt HNSW index, re-embedded all 1,890 thoughts with zero failures. OpenBrain now matches CORE's 1024-dim `mxbai-embed-large` vectors.
3. **Synth pipeline diagnosis:** Investigated 7-day staleness — confirmed pipeline is healthy, was idle due to no new Zulip/Wiki.js events since June 4. Pipeline resumed when the operator created a Wiki.js page via Telegram.
4. **Re-embedding migration script:** Created `scripts/openbrain-server/re-embed-1024.js` — idempotent batch re-embedding tool with rate limiting, progress tracking, and dry-run mode.

**Session 2813cae8 (Fable 5 Items #3-#6 + LLM Domain)**
Completed all remaining Fable 5 items. Commits: `8466271`, `f9c0ce8`, `3b4f980`.

1. **#4 — Synth LLM-chosen domain + hardening:** `buildSystemPrompt(availableDomains)` replaces static `SYSTEM_PROMPT`. Worker fetches 13 domains from OpenBrain per batch. `openbrain.js` uses `memory.domain` with config fallback. Empty LLM content throws instead of returning `[]`.
2. **#3 — Daily brief schedule fix:** Updated from `0 7 * * *` (3 AM EDT) to `0 14 * * *` (10 AM EDT). Manual test verified — all layers checked, Pushover sent.
3. **#5 — Recall facade MCP server:** Standalone at `hermes-stack/mcp/recall/`. Fans out to OpenBrain (MCP SSE client), CORE (MCP Streamable HTTP), Neo4j (Bolt driver). Merge + dedup + rank. Registered in Hermes config.yaml. Z-relay wrapper `zella_recall` added. Verified all 3 layers returning results.
4. **#6 — Session-start recall hook:** `z-cortex-session-sync` updated with recall step + decision-time capture convention. `z-brain-zella-comms` updated with `zella_recall` in tools table + startup checklist.

**Session ccbaa298 (Fable 5 Tiers 1-3)**
Resolved 6 of 10 Fable 5 architectural recommendations across three implementation tiers.

**Tier 1+2 (commits: `3487ae7`):**
1. **#8 — Neo4j temporal relation fields:** `valid_at`/`invalid_at` on all relations. `add_relations` refreshes `valid_at` on MERGE. New `invalidate_relations` tool (marks facts superseded without deletion). New `search_relations` tool with temporal filtering. `search_entities` filters invalidated relations by default. Backfilled 99 relations.
2. **#10 — Synth→CORE routing:** Created `core-ingest.js` (MCP Streamable HTTP client). Worker dual-writes after OpenBrain commit. Best-effort secondary write — CORE failure is non-fatal. Optional via `CORE_MCP_URL`/`CORE_MCP_TOKEN` env vars.
3. **#9 — Unified memory access:** Audited cron toolsets (correct). Documented `skip_memory=True` rationale. SOUL.md updated with Memory Access Architecture section. Created `docs/architecture/memory-access-patterns.md` (3-layer model, agent access matrix, pipeline flow).

**Tier 3 (commit: `3754d06`):**
4. **#1 — Memory freshness alarm:** `/health/detailed` now includes `freshness.isStale` (6h threshold). Immediately caught real 148h gap. Health Check cron updated to curl synth health and Pushover alert when stale.
5. **#2 — Extraction prompt fix:** Already deployed in session e90e6146. Verified.
6. **#7 — Entity dedup investigation:** Zero duplicates across 583 entities. `normKey()` working.

---

## 🔴 NEXT SESSION PRIORITY — READ FIRST

### Immediate — Low Hanging Fruit

**DeepInfra model routing** — the operator requested: make DeepInfra the provider when Nemotron Super 3 is chosen. NOT STARTED.

**Secret rotation** — `CORE_MCP_TOKEN` shares the same PAT as IDE MCP config. Plus 6 other secrets flagged for rotation.

### Strategic — Feature Work

**Synth pipeline flow testing** — ~~Pipeline was idle for 148h.~~ PARTIALLY RESOLVED: Pipeline resumed processing (Wiki.js page created by the operator via Telegram on June 11). Still worth testing the Zulip webhook path end-to-end.

**Dashboard polish** — Use `impeccable` skill to refine the Z-Brain Dashboard UI at `dash.zb.example.com`.

**Claude Code z-relay integration** — z-relay MCP doesn't load in Claude Code sessions. Needed for recall to reach all IDE agents.

**Agent-Managed Business Stack** — the operator created a major architecture doc via Telegram (Twenty CRM, Stripe, etc.). Zella saved to Wiki.js + OpenBrain + Neo4j. May need follow-up implementation work.

### 📝 CONTENT PROJECT (flagged by user)
- **Z-Brain Build Story** — Extract the full build journey into a blog post series or narrative. Raw material: conversation transcripts (JSONL), status.md session summaries, OpenBrain captures, artifacts. Follows the Meta-Content Cascade strategy from Slopthing.

## Key Preferences

- **NO direct Google API key** — route Google models through `openrouter`.
- Hermes fallback order: `openai` → `ollama`
- All config edits on VM via `docker exec`, then sync to local workspace
- SOUL.md loaded fresh each message — no restart needed for behavior changes
- **When env vars or config need changing — just do it and notify.** Don't leave placeholders.
- **Zulip API URL must use `https://chat.zb.example.com`** (not `http://zulip:80`) — Node's fetch won't override Host header, and Zulip rejects mismatched hosts.

## ⛔ Critical Rules

- **NEVER modify files inside the Hermes container image as permanent fixes.** Files under `/opt/hermes/` get wiped on every upstream image update. Only modify: `config.yaml` (`/opt/data/config.yaml`, persisted via volume mount), files in mounted volumes (`./mcp:/opt/mcp`, `./data:/opt/data`), and our own code in `synth-stack/`, `hermes-stack/` compose files.
- **CORE model routing: `MODEL` MUST use `openai/` prefix** (e.g., `openai/anthropic/claude-sonnet-4`). CORE's `getProvider()` splits on the first `/`. See `docs/maintenance/core-version-tracking.md`.
- **core-app bind-mount patches survive container restarts but NOT image rebuilds.** After any CORE upstream rebuild, re-extract the bundle, re-apply patches, update bind mount path.
