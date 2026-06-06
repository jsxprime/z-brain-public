# External References

> Articles, repositories, tools, and people that influenced the Z-Brain project.

---

## Foundational Influences

### Nate B. Jones — "Open Brain"
- **Website:** [natebjones.com](https://natebjones.com)
- **Influence:** Direct philosophical inspiration for the memory-first architecture. Jones's concept of an "Open Brain" — an AI memory system you own and control — is the intellectual origin of Z-Brain's name and architecture. His four disciplines (Prompt Craft, Context Engineering, Intent Engineering, Specification Engineering) map directly to Z-Brain components.

### Chris Lema — "Your AI Has Three Brains"
- **Website:** [chrislema.com](https://chrislema.com)
- **Article:** "Your AI Has Three Brains" (February 2026)
- **Influence:** Provided the composable architecture framework. Lema describes three layers: (1) the deep reader/worker, (2) the always-on nervous system, (3) the persistent memory layer. Z-Brain implements all three: IDE agents (Brain #1), Hermes/Zella (Brain #2), CORE memory pipeline (Brain #3). Lema's observation that "nobody has built the spine connecting them" is exactly what MCP + status.md + cron jobs provide in Z-Brain.

---

## Core Technologies

### NousResearch/hermes-agent
- **Repository:** [github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
- **Role:** The autonomous agent runtime. Provides the gateway architecture, plugin system, MCP integration, cron scheduler, multi-platform connectivity (Telegram, API, Desktop), and session management that makes Zella possible.
- **Version used:** v0.16.0 (as of June 2026)
- **Why chosen:** Open source, self-hostable, MCP-native, active development, supports multi-platform operation from a single agent instance.

### Model Context Protocol (MCP)
- **Specification:** [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Schema:** [github.com/modelcontextprotocol/specification](https://github.com/modelcontextprotocol/specification)
- **Role:** The standard protocol connecting Zella to all her tools — Neo4j memory, OpenBrain search, Telegram push, Zulip posting, Wiki.js publishing, synthesizer controls. MCP is the nervous system of the integration.

### pgvector
- **Repository:** [github.com/pgvector/pgvector](https://github.com/pgvector/pgvector)
- **Role:** PostgreSQL extension enabling vector similarity search. Stores 1024-dimensional embeddings for semantic memory retrieval. The foundation of the "remember everything" capability.

### OpenRouter
- **Website:** [openrouter.ai](https://openrouter.ai)
- **Role:** Multi-provider model routing. Z-Brain routes most LLM calls through OpenRouter to access models from Anthropic, OpenAI, Google, NVIDIA, and DeepSeek through a single API key. Critical for the fallback chain pattern — if one provider fails, OpenRouter enables quick model switching.

### Neo4j
- **Website:** [neo4j.com](https://neo4j.com)
- **Role:** Temporal knowledge graph database. Stores structured relationships between entities (people, places, concepts) with `valid_from`/`valid_until` temporal metadata (planned). Populated by the KG Auto-Update cron job.

---

## Ecosystem Services

### Zulip
- **Website:** [zulip.com](https://zulip.com)
- **Role:** Topic-threaded team chat. Deployed as the structured communication channel for the Z-Brain ecosystem. Outgoing webhooks trigger the Memory Synthesizer pipeline.
- **Why chosen:** Topic threading keeps conversations organized (vs. Slack's flat channels). Open source and self-hostable.

### Wiki.js
- **Website:** [js.wiki](https://js.wiki)
- **Role:** Knowledge base and wiki. Zella publishes articles here via MCP tools. Changes are detected by a custom GraphQL poller (5-min interval) and fed into the Memory Synthesizer.
- **Why chosen:** GraphQL API, clean UI, self-hostable, Node.js ecosystem compatibility.

### Traefik
- **Website:** [traefik.io](https://traefik.io)
- **Role:** Reverse proxy with automatic TLS. Provides HTTPS termination for all ecosystem services via wildcard Let's Encrypt certificate (Cloudflare DNS-01 challenge).

---

## Development Tools

### Google Antigravity IDE
- **Role:** The primary deep-work environment. Agentic IDE with tool use, MCP integration, skill-based workflows, subagent dispatching, and cross-model critique capability.

### Claude Code
- **Role:** Used for cross-model critique sessions and code review. Claude Opus 4.7/4.8 has reviewed Z-Brain architecture, implementation plans, and upgrade procedures.

### Codex CLI
- **Role:** OpenAI's agent-based CLI. Used for independent plan review alongside Claude. Authenticated via ChatGPT consumer account.

### SuperWhisper
- **Website:** [superwhisper.com](https://superwhisper.com)
- **Role:** AI-powered voice-to-text. Enables the operator's "zero-typing" development workflow — complex architectural discussions and specifications delivered at the speed of speech.

---

## The Slopthing Connection

### Slopthing.com
- **Website:** [slopthing.com](https://slopthing.com)
- **Role:** the operator's prior project — an agentic creative studio built with Payload CMS and Antigravity IDE. The Slopthing experience established the "Meta-Product Owner" collaboration model, the "Meta-Content Cascade" content strategy, and the institutional memory frameworks that Z-Brain builds upon.
- **Key patterns carried forward:**
  - Voice-to-agent workflow (SuperWhisper → Antigravity)
  - Cross-model critique as a quality gate
  - Session-based institutional memory (status.md, KIs)
  - The insight that the development process itself is content

---

*This reference list is a living document, updated as new influences and dependencies are added.*
