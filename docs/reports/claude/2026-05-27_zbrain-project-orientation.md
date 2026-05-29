---
title: Z-Brain — Initial Project Orientation
date: 2026-05-27
author: Claude Haiku 4.5 (Claude Code session)
purpose: First-pass assessment of project meaning, function, and purpose
sources:
  - docs/reports/system_overview/z_brain_architecture_summary.md
  - docs/foundational_stack.md
  - docs/superpowers/status.md
  - directory layout of /Volumes/nvme-2tb/ant-workspace/z-brain
---

# Z-Brain — Initial Project Orientation

This is the first-pass assessment Claude made when asked to familiarize itself with the project. It captures the meaning, function, and purpose of Z-Brain at the moment of investigation (2026-05-27), independent of any specific bug or incident.

---

## What Z-Brain Is

**Z-Brain is a self-hosted, autonomous AI integration ecosystem deployed on a local homelab VM (`YOUR_VM_IP`).** It functions as a personalized "AI Operating System," bridging the gap between real-time conversational AI (via interfaces like Telegram) and robust, durable, graph-based memory systems.

The project is designed to provide:
- Seamless cross-channel communication for resident AI agents
- Autonomous task execution
- Long-term recall via a graph-based knowledge store

---

## The Four Pillars

### 1. Hermes Agent (Zella)
**Location:** `~/docker/hermes-stack/` on the VM. Mirror at [hermes-stack/](../../../hermes-stack/) in this workspace.

Zella is the primary autonomous persona, built on `nousresearch/hermes-agent`. She is the user-facing interface, accessible via Telegram long-polling and a local OpenAI-compatible API.

- **State & Memory:** Conversational state in SQLite (`state.db`), making her cross-channel aware — she remembers Telegram conversations even when accessed via API.
- **Persona Management:** Behavior governed by a dynamic `SOUL.md` file, loaded fresh on every message without requiring a container restart.
- **Capabilities:** A large native toolset spanning web search, terminal execution (via SSH injection back to the host), browser control, and home automation.

### 2. CORE Memory Pipeline (Z-Cortex / Red Planet Core)
**Location:** `~/docker/core-stack/` on the VM. Mirror at [core-stack/](../../../core-stack/).

The backend intelligence and long-term memory infrastructure that gives agents historical context and semantic recall.

- **PostgreSQL (pgvector):** Semantic memory using 1024-dimensional vector embeddings.
- **Neo4j:** Temporal knowledge graph, linking concepts, entities, and memories chronologically and relationally.
- **Redis + BullMQ:** Asynchronous job queues for background document ingestion and vectorization.
- **Node.js/Express:** High-performance API routing layer orchestrating memory tasks.

### 3. Z-Relay
**Location:** [relay/](../../../relay/) directory in the local workspace.

An MCP (Model Context Protocol) server wrapping Zella's local API. This allows IDE-based agents to communicate directly with Zella, share session context, query her session feed, and push real-time notifications to the user's Telegram.

### 4. OpenBrain MCP
A global semantic memory server that exposes the CORE OS's durable state to various agents. It allows macro-level decisions, status snapshots, and important context to be stored permanently and retrieved asynchronously by any agent in the ecosystem.

---

## Foundational Tech Stack

Per [docs/foundational_stack.md](../../foundational_stack.md), the explicit pinned dependencies are:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Protocol | **Model Context Protocol (MCP)** | Standard for connecting AI models to data sources and tools |
| Storage | **PostgreSQL + pgvector** | Relational + vector store driving Z-Cortex and OpenBrain |
| API | **Node.js + Express** | High-performance routing for Z-Cortex tools and HTTP endpoints |
| Agent | **Hermes Agent (NousResearch)** | Autonomous agent runtime, configured via `config.yaml` |

*(Payload CMS is deliberately excluded from the core OS manifest — Payload integration is handled downstream in the web presentation layer.)*

---

## Operational State at Orientation Time

Per [docs/superpowers/status.md](../../superpowers/status.md), the status snapshot at the time of this orientation was:

- ✅ **CORE Memory Pipeline** — fully operational (Ollama embeddings + OpenRouter chat)
- ✅ **Hermes Agent (Zella)** — online, responding via OpenRouter `anthropic/claude-sonnet-4`
- ✅ **Memory Ingest** — MCP tool working, knowledge graph extraction verified
- ✅ **Memory Search** — vector similarity search returning results
- ✅ **No direct Google API usage** anywhere in the stack

### Provider Configuration

| Component | Provider | Model | Endpoint |
|-----------|----------|-------|----------|
| CORE Embeddings | Ollama (local) | `mxbai-embed-large` (1024-dim) | `http://YOUR_OLLAMA_HOST:11434/v1` |
| CORE Chat | OpenRouter | `anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| Hermes Primary | OpenRouter | `anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| Hermes Fallback 1 | Ollama (local) | `gemma4:26b-mlx` | `http://YOUR_OLLAMA_HOST:11434/v1` |
| Hermes Fallback 2 | Abacus | `gemini-3.5-flash` | `https://routellm.abacus.ai/v1` |

> **Note:** The documented status above represents the *intended* state. The companion diagnostic report (`2026-05-27_zbrain-degradation-diagnostic/report.md`) shows the *actual* runtime state diverged significantly from this — OpenRouter weekly limits exhausted, fallback chain not loaded, and skill files broken by root-ownership.

---

## Recent Project History (as documented)

Z-Brain went through a major architectural migration in the 24-hour window leading up to 2026-05-27, documented as the **"Amnesia Incident"**:

1. **Original failure:** The CORE memory pipeline used the Google Generative AI API (`text-embedding-004`) for embeddings. Prepayment credits were depleted, returning `429 Too Many Requests` errors. All background ingestion jobs failed, piling up in the Redis `ingest-queue:failed` backlog and breaking Zella's `session_search` and memory retrieval tools.

2. **Migration response:**
   - **Embedding Engine:** Switched to local **Ollama** running `mxbai-embed-large` (1024 dimensions).
   - **Chat Engine:** Switched from direct provider APIs to **OpenRouter**, standardizing on `anthropic/claude-sonnet-4`.
   - **Fallback chain:** Local Ollama → Abacus → OpenRouter.
   - **Queue recovery:** `ingest-queue:failed` backlog manually flushed and retried.

3. **Hermes side:** Model router tiers were pointing at dead `openai-codex` models. Updated to OpenRouter Anthropic. Added config protection rules to `SOUL.md`.

The maintenance log lives at `docs/maintenance/2026-05-27_core-memory-pipeline-migration.md`.

---

## Repository Layout (Local Workspace)

```
/Volumes/nvme-2tb/ant-workspace/z-brain/
├── core-stack/         # Mirror of ~/docker/core-stack on VM (Dockerfile, compose, core/, openbrain.sql)
├── hermes-stack/       # Mirror of ~/docker/hermes-stack on VM (compose, data/, mcp/, cli-sandbox/, cli-secrets/)
├── relay/              # Local Z-Relay MCP server source (Node.js, src/, tests/)
├── docs/
│   ├── foundational_stack.md       # Pinned tech-stack reference
│   ├── code-review-2026-05-26.md
│   ├── superpowers/                # Operational state, specs, plans
│   ├── reports/                    # System overviews, this report directory
│   ├── maintenance/                # Incident write-ups
│   ├── guides/
│   └── shared/
├── scripts/            # Node-based admin/utility scripts (with node_modules)
└── scratch/            # Throwaway working files
```

---

## Key Operational Preferences (documented)

From `docs/superpowers/status.md`:

- **NO direct Google API key** — route Google models through `abacus` or `openrouter`
- **Hermes fallback order:** `ollama` → `abacus` → `openrouter`
- **All config edits on VM via `docker exec`,** then sync to local workspace
- **SOUL.md loaded fresh each message** — no restart needed for behavior changes

---

## What This Project Is *For*, in One Sentence

Z-Brain exists so that **a single user can have a persistent, autonomous AI persona (Zella) that remembers everything across channels, executes real tasks against real systems, and stays under the user's own infrastructural control** — rather than depending on any single hosted assistant.

The architecture's center of gravity is the **memory layer** (pgvector + Neo4j + BullMQ), not the model itself. Models can be swapped (and were, during the recent migration) without losing the agent's identity, history, or capabilities.

---

*End of orientation.*
