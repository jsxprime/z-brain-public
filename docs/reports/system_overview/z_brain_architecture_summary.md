# Z-Brain Project Overview & Architecture Summary
**Date:** May 27, 2026

## Executive Summary
Z-Brain is a self-hosted, autonomous AI integration ecosystem deployed on a local homelab VM (`YOUR_VM_IP`). It functions as a personalized "AI Operating System," bridging the gap between real-time conversational AI (via interfaces like Telegram) and robust, durable, graph-based memory systems. The project is designed to provide seamless cross-channel communication, autonomous task execution, and long-term recall for its resident AI agents.

## Core Components

### 1. Hermes Agent (Zella)
**Location:** `~/docker/hermes-stack/` on the VM.
Zella is the primary autonomous persona (`nousresearch/hermes-agent`). She serves as the user-facing interface, accessible via Telegram long-polling and a local OpenAI-compatible API.
- **State & Memory:** Maintains conversational state in an SQLite database (`state.db`), making her cross-channel aware (she remembers Telegram conversations even when accessed via API).
- **Persona Management:** Her behavior is governed by a dynamic `SOUL.md` file, which is loaded fresh on every message without requiring a container restart.
- **Capabilities:** Zella is equipped with a massive array of native tools spanning web search, terminal execution (via SSH injection back to the host), browser control, and home automation.

### 2. CORE Memory Pipeline (Z-Cortex / Red Planet Core)
**Location:** `~/docker/core-stack/` on the VM.
This represents the backend intelligence and long-term memory infrastructure that gives agents historical context and semantic recall.
- **PostgreSQL (pgvector):** Handles semantic memory using 1024-dimensional vector embeddings.
- **Neo4j:** Manages the temporal knowledge graph, linking concepts, entities, and memories chronologically and relationally.
- **Redis & BullMQ:** Powers the asynchronous job queues, primarily handling the heavy lifting of background document ingestion and vectorization.
- **Node.js/Express:** Serves as the high-performance API routing layer orchestrating memory tasks.

### 3. Z-Relay
**Location:** `relay/` directory in the local workspace.
An MCP (Model Context Protocol) server wrapping Zella's local API. This allows IDE-based agents to communicate directly with Zella, share session context, query her session feed, and push real-time notifications to the user's Telegram.

### 4. OpenBrain MCP
A global semantic memory server that exposes the CORE OS's durable state to various agents. It allows macro-level decisions, status snapshots, and important context to be stored permanently and retrieved asynchronously by any agent in the ecosystem.

## Recent System Outage & Resolution

### The "Amnesia" Incident
Over the last 24 hours (leading up to May 27, 2026), the Z-Brain ecosystem experienced significant memory degradation—manifesting as Zella suffering from "amnesia" (e.g., forgetting the Google Workspace configuration for `user@example.com`). 

**Root Cause:**
The CORE memory pipeline originally utilized the Google Generative AI API (`text-embedding-004`) for generating vector embeddings. The project's Google API prepayment credits were completely depleted, returning `429 Too Many Requests` errors. This caused all background ingestion jobs to fail, piling up in the Redis `ingest-queue:failed` backlog, and fundamentally breaking Zella's `session_search` and memory retrieval tools.

### Architectural Migration
To restore functionality and prevent future billing lockouts, the system was fully migrated away from direct Google API dependencies:
1. **Embedding Engine:** Switched to a local **Ollama** instance running the `mxbai-embed-large` model (1024 dimensions).
2. **Chat Engine:** Switched from direct provider APIs to **OpenRouter**, specifically standardizing on `anthropic/claude-sonnet-4` for high-reliability tool use.
3. **Fallback Routing:** Configured a robust fallback chain: Local Ollama (`gemma4:26b-mlx`) → Abacus (`gemini-3.5-flash`) → OpenRouter.
4. **Queue Recovery:** The `ingest-queue:failed` backlog was manually flushed and retried, allowing Zella to successfully re-index the missing memory fragments.

The system is currently marked as **fully operational**.
