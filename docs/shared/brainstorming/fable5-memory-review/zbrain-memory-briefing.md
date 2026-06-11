# Z-Brain Memory Architecture — Comprehensive Briefing for Architectural Review

> **Purpose**: This document is a self-contained briefing for an external model (Claude Fable 5) to review, audit, and critique the Z-Brain memory architecture. It covers the full system design, memory pipeline, multi-agent access patterns, known issues, and specific review questions. The reviewer has read-only access to the full workspace at `/Volumes/nvme-2tb/ant-workspace/z-brain/`.

---

## 1. What Z-Brain Is

Z-Brain is a **self-hosted, autonomous AI integration ecosystem** deployed on a single Linux VM (`YOUR_VM_IP`). It functions as a personal "AI Operating System" — bridging real-time conversational AI, durable memory, and multi-agent coordination under one roof, owned and operated by a single user.

### Core Philosophy: "Everything is a Thing"

The system unifies structured data (Postgres), semantic vectors (pgvector), and relationship maps (Neo4j) into a single overarching context graph. Agents don't just read data — they live within the graph, actively generating and modifying relationships. Models are treated as interchangeable — they can be swapped without losing the agent's identity, history, or capabilities. **The architecture's center of gravity is the memory layer, not the model.**

### The Four Pillars

| Pillar | What It Does | Container(s) |
|--------|-------------|---------------|
| **CORE Memory Pipeline** (Z-Cortex) | Long-term memory infrastructure: semantic vectors, knowledge graph, async job queues | `core-app`, `core-postgres`, `core-neo4j`, `core-redis` |
| **Hermes Agent (Zella)** | Always-on autonomous AI persona. Runs 24/7 on Telegram + API. Has native tools, cron jobs, MCP integrations. | `hermes-agent` |
| **OpenBrain Server** | Durable semantic memory broker — agents capture, search, and retrieve thoughts across domains | `openbrain-server` |
| **Z-Relay** | Local MCP server wrapping the Hermes API for IDE agents | (local stdio process on Mac, not containerized) |

### Container Inventory (22 containers total)

| Stack | Containers |
|-------|-----------|
| core-stack | core-app, core-postgres, core-neo4j, core-redis, openbrain-server |
| hermes-stack | hermes-agent |
| traefik | traefik |
| zulip-stack | zulip, zulip-database, zulip-memcached, zulip-rabbitmq, zulip-redis |
| wikijs-stack | wikijs, wikijs-database |
| synth-stack | synth-app, synth-postgres |
| dashboard | zbrain-dashboard |
| other | portainer, dockge, zella-speedtest |

---

## 2. Memory Architecture Deep Dive

Z-Brain has **three independent but complementary memory layers**, plus a **synthesis pipeline** that feeds extracted memories into the durable layers.

### Layer 1: pgvector (Semantic Vector Store)

**Purpose**: Fast similarity search for episodic recall, entity resolution, and statement matching.

**Configuration**:
- Embedding model: `mxbai-embed-large` via local Ollama (`YOUR_OLLAMA_HOST:11434`)
- Dimensionality: **1024** (native model output, no truncation)
- Database: PostgreSQL 15 with pgvector extension
- 6 HNSW indexes at `vector(1024)` for fast approximate nearest neighbor search

**Three namespaces** (see `VECTOR_NAMESPACES`):
1. **ENTITY** — Entity name embeddings. Used for deduplication and fuzzy entity matching. Search threshold: `0.5`, limit: `10`.
2. **STATEMENT** — Factual statement embeddings (extracted from conversations). Search threshold: `0.5`, limit: `100`.
3. **EPISODE** — Full conversation chunk embeddings. Search threshold: `0.2` (deliberately low — casts a wide net for episodic recall), limit: `50`.

**Key source file**: `core-stack/core/apps/webapp/app/services/vectorStorage.server.ts`

### Layer 2: Neo4j (Knowledge Graph)

**Purpose**: Hard logical relationships between entities. Temporal, directional, typed edges linking concepts, people, places, and decisions.

**Configuration**:
- Neo4j Community Edition 5
- Entities stored as nodes, relations as directed edges with `type` property
- MCP tools: `add_entities`, `add_relations`, `search_entities`, `search_relations`, `delete_entities`, `delete_relations`

**Known bug**: The `add_relations` MCP tool creates **~2-3 duplicate relations per related entity**. The upsert logic was previously fixed (MERGE on relation geometry, SET type), but the duplicates are still appearing. A cron job (`e4dbe4fd`) runs a KG auto-update that includes a dedup cleanup pass.

**Missing capability**: No temporal metadata on edges. Edges have no `valid_from`/`valid_until` timestamps, which means the graph cannot distinguish between "this was true in May" and "this is true now".

### Layer 3: OpenBrain (Domain-Segregated Thought Store)

**Purpose**: Cross-agent durable memory with domain segregation. Agents capture "thoughts" (structured text blobs) into named domains, and retrieve them via semantic search.

**Configuration**:
- Node.js/Express server at `core.zb.example.com` (port 3040 internally)
- Embedding: `google/gemini-embedding-2-preview` via OpenRouter (fallback: `gemini-embedding-2` via Google AI Studio, then local Ollama `gemma4:26b-mlx`)
- Chat synthesis: `openai/gpt-4o-mini` via OpenRouter (fallback: Ollama)
- Currently holds **1,712 thoughts**
- Domain examples: `engineering`, `personal`, `slopthing`

**MCP tools**:
- `capture` — Store a new thought (requires `content` + `domain`)
- `search` — Semantic search across thoughts
- `fetch` — Retrieve a specific thought by ID
- `recent` — Get most recent thoughts
- `stats` — Domain statistics
- `list_domains` — List all active domains
- `force_synthesis_run` — Manually trigger persona synthesis

**Persona Synthesis Loop**:
Every 4 hours (or manually via `force_synthesis_run`), a BullMQ worker:
1. Scoops up recent raw thoughts per domain
2. Uses an LLM to synthesize them into a dense "Role-Specific Context Brief"
3. Saves the brief as a `persona-v2` document
4. The CORE Dashboard renders these for human review

---

## 3. Episodic Pipeline (CORE's BullMQ Queues)

The CORE Memory OS has an **autonomous episodic ingestion pipeline** powered by Redis-backed BullMQ job queues. This is the primary path for turning Hermes/Zella conversations into searchable, vectorized memories.

### Pipeline stages:

```
Raw conversation (Hermes state.db / MCP ingest)
  → ingest-episode (ingestion queue)
    → preprocess-episode (text preprocessing)
      → [LLM extraction via model.server.ts]
        → session-compaction (compress long sessions)
          → label-assignment (auto-label episodes)
            → title-generation (generate episode titles)
              → [Store in pgvector as EPISODE namespace]
              → [Store entities/statements in Neo4j]
```

### Model routing for extraction:

The extraction step uses `makeStructuredModelCall` and `makeModelCall` from `model.server.ts`. Current configuration:

| Component | Provider | Model | Endpoint |
|-----------|----------|-------|----------|
| CORE Chat/Extraction | OpenAI SDK → OpenRouter | `openai/anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| CORE Embeddings | Ollama (local) | `mxbai-embed-large` (1024-dim native) | `http://YOUR_OLLAMA_HOST:11434` |

**Critical routing note**: `MODEL` env var must use `openai/` prefix (e.g., `openai/anthropic/claude-sonnet-4`). CORE's `getProvider()` splits on the first `/` — without the prefix, `anthropic/*` models route to `api.anthropic.com` instead of through the OpenRouter proxy.

### Current status:

- All 9 BullMQ queues healthy (0 failed across all)
- **38-hour episodic ingestion gap** — last episode ingested June 9 04:18 UTC
- `core-app` container has been bouncing (3 solo restarts today, root cause unknown)
- Dimension mismatch bug was recently fixed (`EMBEDDING_MODEL_SIZE` corrected from 768→1024)

---

## 4. Memory Synthesizer Pipeline (synth-stack)

A **separate** pipeline from the CORE episodic pipeline. This one processes events from Zulip (chat) and Wiki.js (wiki) through LLM extraction and commits the results to OpenBrain.

### Pipeline flow:

```
Zulip message → Webhook → events table (synth-postgres)
Wiki.js edit  → GraphQL Poller (5-min interval) → events table
                                                     ↓
                                            Worker (SELECT FOR UPDATE SKIP LOCKED)
                                                     ↓
                                            LLM Extraction (via Hermes Agent API)
                                                     ↓
                                            Confidence check:
                                              ≥ 0.6 → Commit to OpenBrain
                                              < 0.6 → Quarantine for human review
                                                     ↓
                                            processed_memories table
```

### Extraction prompt:

The Memory Curator system prompt (in `synth-stack/src/extraction/prompts.js`) extracts five memory types:
- `decision` — Choices or conclusions ("We chose Zulip over Mattermost")
- `snippet` — Code blocks, Docker templates, config fragments
- `command` — CLI commands worth remembering
- `summary` — High-level conversation or page summaries
- `reference` — URLs, tool names, external resources

Each extracted memory has a `confidence` score (0.0-1.0). **Confidence < 0.6 triggers quarantine** for human review.

### Current status:

- Queue: **12 completed, 0 failed, 0 quarantined** (pipeline running cleanly)
- LLM for extraction: Routes through the **Hermes Agent API** internally (`hermes-agent:8642`)
- Dedicated Postgres (`synth-postgres`) separate from `core-postgres`

### Key source files:

- `synth-stack/src/extraction/prompts.js` — Extraction prompt templates
- `synth-stack/src/extraction/extractor.js` — LLM call logic
- `synth-stack/src/queue/worker.js` — Queue processor with `SELECT FOR UPDATE SKIP LOCKED`
- `synth-stack/src/commit/openbrain.js` — OpenBrain commit logic with provenance

---

## 5. Multi-Agent Memory Access Patterns

### Who accesses memory and how:

| Agent | Memory Layers Used | Access Method | What They Do |
|-------|-------------------|---------------|-------------|
| **Zella (Hermes Agent)** | Neo4j, OpenBrain, pgvector (via CORE MCP) | MCP tools: `neo4j_memory`, `openbrain`, `z-brain` | Reads memory for conversation context, writes KG entities via cron, captures thoughts to OpenBrain. Native `session_search` tool for conversation history. |
| **Antigravity IDE Agent** | OpenBrain, pgvector (via CORE MCP) | MCP tools: `openbrain`, `z-brain` | `capture` to store session summaries, `search` for context, `memory_ingest` for episode ingestion, `memory_search` for semantic recall |
| **Claude Code CLI** | None currently | Has workspace read access, no MCP connection | Can read source code and documentation but doesn't write to or read from the memory system |
| **Synthesizer Worker** | OpenBrain (write only) | Direct HTTP to OpenBrain `/capture` | Commits extracted memories with provenance metadata |
| **Cron Jobs (Hermes)** | Neo4j, OpenBrain | MCP tools (must be in `enabled_toolsets`) | KG Auto-Update mines conversations → writes to Neo4j. Health Check queries all memory layers. |

### Important architectural details:

1. **Hermes's native `memory` tool** is **hard-disabled in cron jobs** (`skip_memory=True` in Hermes's `scheduler.py`). Cron jobs must use MCP-based tools (`neo4j_memory`, `openbrain`) instead.

2. **Cron job toolset filtering**: Hermes cron jobs use `enabled_toolsets` as a strict whitelist. MCP tools are discovered via `discover_mcp_tools()` but filtered by toolset name. The toolset names for MCP servers are `mcp-{name}` (e.g., `mcp-neo4j_memory`). If a cron job doesn't include the right toolset, the tools are registered but invisible to the agent.

3. **Context compression**: Hermes has a native context compression system that summarizes older conversation turns to fit within context limits. This was broken (dropping mid-conversation turns) and fixed by migrating the `auxiliary` task provider from `openai` to `openrouter` (`openai/gpt-4o-mini`).

4. **SOUL.md**: Zella's behavior is governed by `/opt/data/SOUL.md`, loaded fresh on every message. It includes tool usage guidance, security rules, execution context awareness, and cross-channel awareness instructions (teaching Zella to use `session_search` for IDE/API communication history).

5. **Cross-channel awareness**: All messages from all channels (Telegram, API, SSH injection, cron) land in the same `state.db` SQLite database. Zella can search across channels via `session_search`.

### Gap: Coding agents don't meaningfully use memory

The system was designed for multi-agent use, but in practice:
- IDE agents (Antigravity) mostly just **write** session summaries via `memory_ingest` at session end
- They don't systematically **read** from memory at session start (beyond the handoff protocol in `status.md`)
- Claude Code CLI has no MCP integration at all — it can only read local files
- There's no pattern for a coding agent to query "what decisions have been made about X?" before making architectural choices

---

## 6. Known Issues & Gaps

### Operational Issues

| Issue | Severity | Status |
|-------|----------|--------|
| **38h episodic ingestion gap** | High | No new episodes since June 9 04:18 UTC. Synthesizer is producing `persona-v2` briefs but raw conversation isn't being fed back into CORE. |
| **core-app bouncing** | High | 3 solo restarts today. Root cause unknown (OOM? crash? health check bounce?). Container logs not accessible from Zella's side. |
| **Neo4j add_relations duplicate bug** | Medium | Produces ~2-3 duplicate relations per related entity. Backend fix needed. Cron job does periodic cleanup. |
| **MCP add_relations upsert logic** | Medium | Despite prior fix (MERGE on geometry + SET type), duplicates persist. May need investigation at the MCP plugin level. |

### Architectural Gaps

| Gap | Description |
|-----|-------------|
| **No temporal metadata on graph edges** | Neo4j relations have no `valid_from`/`valid_until`. Can't distinguish past facts from current facts. A decision from May looks identical to a decision from today. |
| **Utilization 3/10** | Infrastructure is 9/10 but the system is mostly self-referential — monitoring itself, building itself. Not yet used for "real work" (daily briefings, research, project tracking). |
| **Extraction prompt quality unaudited** | No systematic review of quarantined memories. The 60% confidence threshold was set heuristically. No data on false positive/negative rates. |
| **Domain segregation underexercised** | OpenBrain supports per-domain segregation but most captures go to `engineering`. Personal/project-specific domains are sparse. |
| **Hermes `memory` tool vs MCP tools** | Hermes has a native `memory` tool (OpenBrain MCP bridge) but it's disabled in cron (`skip_memory=True`). The relationship between this tool and the standalone MCP-based tools is unclear and potentially redundant. |
| **No coding agent memory integration** | IDE agents don't query the memory system for context before making decisions. The "Three Brains" architecture (IDE agent as Brain #1 deep reader) isn't actualized for memory retrieval. |

---

## 7. Provider Configuration

| Component | Provider | Model | Endpoint |
|-----------|----------|-------|----------|
| CORE Chat/Extraction | OpenAI SDK → OpenRouter | `openai/anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| CORE Embeddings | Ollama (local) | `mxbai-embed-large` (1024-dim native) | `http://YOUR_OLLAMA_HOST:11434` |
| Hermes Primary | OpenRouter | `nvidia/nemotron-3-super-120b-a12b` | `https://openrouter.ai/api/v1` |
| Hermes Fallback 1 | OpenAI | `gpt-4o-mini` | `https://api.openai.com/v1` |
| Hermes Fallback 2 | Ollama (local) | `gemma4:26b-mlx` | `http://YOUR_OLLAMA_HOST:11434/v1` |
| Cron Jobs (pinned) | OpenRouter | `anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| OpenBrain Chat | OpenRouter | `openai/gpt-4o-mini` | `https://openrouter.ai/api/v1` |
| OpenBrain Embed | OpenRouter | `google/gemini-embedding-2-preview` | `https://openrouter.ai/api/v1` |
| Synthesizer LLM | Hermes Agent | via `hermes-agent:8642` | Internal Docker network |

---

## 8. Key Source Files for Deeper Exploration

The reviewer has read-only access to the full workspace. Key files:

### Memory Pipeline
- `core-stack/core/apps/webapp/app/services/vectorStorage.server.ts` — pgvector operations (entity, statement, episode CRUD + search)
- `core-stack/core/apps/webapp/app/lib/model.server.ts` — Model routing, embedding generation, structured model calls
- `core-stack/core/apps/webapp/app/services/llm-provider.server.ts` — Provider config resolution, API key management

### Synthesizer Pipeline
- `synth-stack/src/extraction/prompts.js` — LLM extraction prompt templates
- `synth-stack/src/extraction/extractor.js` — LLM call wrapper
- `synth-stack/src/queue/worker.js` — Queue processor (SELECT FOR UPDATE SKIP LOCKED)
- `synth-stack/src/commit/openbrain.js` — OpenBrain commit with provenance

### Docker / Infrastructure
- `core-stack/docker-compose.yml` — CORE stack (Postgres, Neo4j, Redis, OpenBrain)
- `hermes-stack/` — Hermes Agent stack (not in local workspace — lives on VM)
- `synth-stack/docker-compose.yml` — Synthesizer + its dedicated Postgres

### Documentation
- `docs/superpowers/Z-Brain-System-Manual.md` — System manual
- `docs/superpowers/status.md` — Operational status snapshot (very long, comprehensive)
- `docs/foundational_stack.md` — Tech stack manifest
- `docs/reports/claude/2026-05-27_zbrain-project-orientation.md` — Prior Claude assessment
- `docs/reports/claude/2026-05-27_zbrain-degradation-diagnostic/report.md` — Prior Claude diagnostic

### Hermes Agent
- `hermes-stack/data/SOUL.md` — Zella's behavior directives (not in local workspace — on VM)
- `hermes-stack/data/config.yaml` — Hermes configuration (not in local workspace — on VM)

---

## 9. Review Questions

Please provide a detailed, structured response addressing each of these questions:

### Architecture & Design
1. **Is the three-layer memory architecture (pgvector + Neo4j + OpenBrain) the right design for a multi-agent personal memory system?** What would you keep, merge, or replace? Is there unnecessary overlap or missing functionality between the layers?

2. **How does this compare to Anthropic's recommended memory architecture for Fable 5 agents?** Specifically, the "memory tool" primitive (read/write/update/delete files in a `/memories` directory) vs. this database-backed approach. What are the tradeoffs?

3. **Is the separation between CORE episodic pipeline and Synthesizer pipeline the right decomposition?** They serve different data sources (conversations vs. Zulip/Wiki events) but ultimately feed the same downstream stores. Should they converge?

### Multi-Agent Memory
4. **What's missing for coding agents (like Claude Code, Antigravity, Codex) to meaningfully consume and contribute to this memory system?** Today, IDE agents mostly write session summaries but don't query for context. What patterns would make the "Three Brains" architecture work in practice?

5. **How should the Hermes native `memory` tool (currently disabled in cron via `skip_memory=True`) be reconciled with the MCP-based memory tools (`neo4j_memory`, `openbrain`, `z-brain`)?** Is the duplication intentional/beneficial, or should they be unified?

### Memory Quality & Configuration
6. **How should temporal validity be implemented on the Neo4j knowledge graph?** The current graph has no `valid_from`/`valid_until` on edges. Facts from May look identical to facts from today. What's the right implementation approach — and is it worth the complexity?

7. **Is the confidence-based quarantine system (< 0.6 = quarantine) well-calibrated?** The threshold was set heuristically. Zero quarantined memories currently exist (12 completed events, all above 0.6). What would a well-calibrated system look like, and how should the extraction prompt be improved?

8. **What does healthy "utilization" look like for this kind of personal multi-agent memory system?** The infrastructure is rated 9/10 but utilization is 3/10. What specific Tier 1 use cases should be built to close this gap, and what does the "daily heartbeat" of a well-utilized system look like?
