# Glossary

> Terms, concepts, and names used throughout the Z-Brain Chronicle.

---

### Agent
An autonomous AI program that can perceive its environment, make decisions, and take actions. In Z-Brain, there are multiple agents: Zella (always-on, Telegram-connected), and IDE agents (Claude, Gemini, Codex) used in pair-programming sessions.

### Antigravity IDE
Google DeepMind's agentic IDE used for the deep engineering work on Z-Brain. Provides an AI coding assistant with tool use, MCP integration, and skill-based workflows.

### BullMQ
A Redis-based job queue for Node.js. Used in the CORE Memory Pipeline to queue ingestion jobs. The `ingest-queue` handles async processing of memories; `ingest-queue:failed` holds jobs that errored.

### Cron Job (in Hermes context)
An LLM-powered scheduled task defined in `jobs.json`. Unlike traditional cron (which runs scripts), Hermes cron jobs spin up an agent session with a prompt, enabled toolsets, and a model. The agent executes autonomously and reports results.

### CORE Memory Pipeline
The foundational memory stack: Node.js application managing Postgres (pgvector for vector embeddings), Neo4j (temporal knowledge graph), and Redis (BullMQ job queue). Version 0.7.14 as of June 2026.

### Cross-Model Critique
A workflow pattern where one AI model's plan is reviewed by a different AI model (e.g., submitting Gemini's implementation plan to Claude for critique, or vice versa). Used to catch blind spots that same-model review misses.

### Docker Bind Mount
The mechanism that persists Hermes's state across container restarts. `./data:/opt/data` maps the VM directory to the container filesystem. Critical distinction: the local git checkout is NOT the live bind mount.

### `enabled_toolsets`
A whitelist in Hermes's `jobs.json` that controls which tool categories an LLM-powered cron job can access. MCP tools are registered under `mcp-{name}` toolsets. If a toolset isn't in the whitelist, its tools are discovered but filtered out before the agent sees them.

### Fallback Chain
The ordered list of providers Hermes tries when the primary model fails. Current chain: OpenRouter (primary) → OpenAI (fallback 1) → Ollama local (fallback 2). Cron jobs are pinned to specific models to bypass the unreliable default.

### Gateway
Hermes Agent's main process. Manages platforms (Telegram, API Server), agent sessions, tool discovery, and the dashboard. Reads `config.yaml` once at startup. Runs as PID 1 under s6-overlay supervision.

### Hermes Agent
[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) — the open-source autonomous agent runtime that powers Zella. Provides a gateway architecture, plugin system, MCP integration, cron scheduler, and multi-platform connectivity.

### Host-Ops Daemon
A Node.js/Express server running on the VM host (port 8650) as a systemd service. Provides a controlled API for the containerized Hermes agent to execute host-level operations without direct SSH access.

### Knowledge Graph (KG)
The Neo4j temporal graph database that stores structured relationships between entities (people, places, concepts, events). Populated by the KG Auto-Update cron job, which mines conversation sessions for entities and relationships.

### MCP (Model Context Protocol)
[modelcontextprotocol.io](https://modelcontextprotocol.io) — an open standard for connecting AI models to external data sources and tools. Z-Brain uses MCP servers for Neo4j memory, OpenBrain search, Telegram push notifications, synthesizer controls, Zulip posting, and Wiki.js publishing.

### Memory Synthesizer
A Node.js daemon that processes events from Zulip (via webhooks) and Wiki.js (via GraphQL polling) through an LLM extraction step, then commits the extracted knowledge to OpenBrain's vector database. The only AI model call in the automatic pipeline.

### Meta-Product Owner
the operator's self-described role in the project. Not a developer or coder, but an architect-manager-client hybrid who directs AI agents through voice-to-text commands (SuperWhisper) and natural language instructions.

### OpenBrain
The vector search API layer over the CORE database. Handles semantic memory storage and retrieval. Currently holds 1,159+ thoughts. Accessible via MCP tools and HTTP API at `core.zb.example.com`.

### OpenRouter
[openrouter.ai](https://openrouter.ai) — a multi-provider model routing service. Z-Brain routes most LLM calls through OpenRouter to access models from multiple providers (Anthropic, OpenAI, Google, NVIDIA, DeepSeek) through a single API.

### pgvector
[github.com/pgvector/pgvector](https://github.com/pgvector/pgvector) — a PostgreSQL extension for vector similarity search. Z-Brain uses 1024-dimensional embeddings stored in pgvector for semantic memory retrieval.

### Quarantine
The confidence-based quality gate in the Memory Synthesizer pipeline. Extracted memories with confidence scores below 60% are quarantined for human review in the Dashboard rather than committed to the vector database.

### SOUL.md
The personality and behavior definition file for Zella. Located at `/opt/data/SOUL.md` inside the container (bind-mounted). Loaded fresh on every incoming message — no container restart needed for behavior changes. Contains identity, security rules, execution context awareness, and tool usage guidance.

### `state.db`
SQLite database inside the Hermes container (`/opt/data/state.db`) that stores all sessions and messages across all channels (Telegram, API, Cron). Every conversation is preserved regardless of how it was initiated.

### Story-Capture Skill
The documentation workflow skill that formalizes the interview-and-update process for the Z-Brain Chronicle. Captures fragments during sessions, processes them at teardown, and runs event-triggered deep interviews.

### SuperWhisper
AI-powered voice-to-text tool used by the operator to dictate requirements and instructions to IDE agents. Enables a "zero-typing" development model where complex architectural discussions happen at the speed of speech.

### Traefik
Reverse proxy running on the VM with Let's Encrypt wildcard certificate for `*.zb.example.com` (Cloudflare DNS-01 challenge). Routes HTTPS traffic to all ecosystem services: Wiki.js, Zulip, Dashboard, Synthesizer, Hermes Desktop.

### Zella
The name of the AI persona running on the Hermes Agent. Zella operates primarily via Telegram but also serves API, Cron, and Desktop sessions. All channels share the same `state.db` and memory. Her personality is defined in SOUL.md and her knowledge persists across sessions via the CORE memory stack.

### z-relay
An MCP stdio server (`relay/src/index.js`) that wraps the Hermes API into cleaner MCP tool calls for IDE agents. Provides `zella_chat`, `zella_status`, `zella_briefing`, `zella_feed`, and `zella_share` tools.

### Z-Cortex
The internal project name sometimes used for the overall orchestration layer. Encompasses CORE, Hermes, and the ecosystem services as a unified cognitive system.

---

*This glossary is a living document, updated as new concepts and components are introduced.*
