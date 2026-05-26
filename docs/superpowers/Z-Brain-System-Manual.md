# Z-Brain Multi-Agent System Manual
*The definitive guide for humans, agents, and LLMs alike on how the Z-Brain ecosystem operates.*

> [!IMPORTANT]
> **To All AI Agents:** If you are reading this document to understand the system, pay special attention to the **Memory & Domain Architecture** and the **Out-of-Band Sync Protocols**. These govern how you should store state and interact with other components.

---

## 1. Core Philosophy & The "Everything is a Thing" Graph
The Z-Brain ecosystem is built on the philosophy that **everything is a connected node**. Instead of disparate applications, Z-Brain unifies structured data (Postgres), semantic vectors (pgvector/Gemini embeddings), and relationship maps (Neo4j) into a single overarching context. 

Agents do not just read data—they live within the graph, actively generating and modifying relationships.

## 2. System Architecture & Components
The stack is physically deployed on a central Virtual Machine (`YOUR_VM_IP`). It is composed of three interconnected Docker stacks:

### A. The CORE OS Stack (`core-stack`)
The foundation of the entire system.
- **core-app (Remix API & Dashboard):** The central web interface for the human user (`http://YOUR_VM_IP:3033`). It renders "Personas" and visualizes data.
- **core-postgres:** The source of truth for semantic vector data and metadata.
- **core-neo4j:** The graph database mapping hard logical relationships between entities.
- **core-redis:** Handles the BullMQ job queues, specifically for background synthesis tasks.

### B. The Hermes Agent Stack (`hermes-stack`)
The execution layer for autonomous AI operations.
- **Zella (Hermes Agent):** The user's personal AI agent. She operates primarily via Telegram.
- **Z-Relay / Telegram MCP:** A server that allows for cross-agent messaging and session injection.

### C. The OpenBrain Server (`openbrain-server`)
The data-broker layer bridging the Agents and the CORE OS.
- Exposes tools to ingest (`capture`), retrieve (`fetch`, `recent`), and semantic-search (`search`) memories.
- Manages the **Background Synthesis Worker**, which automatically runs via BullMQ to compile raw thoughts into structured Personas.

---

## 3. Memory & Domain Segregation
To prevent "context pollution" (where personal notes bleed into engineering discussions), memory is strictly segregated by **Domains**.

### For Agents Interacting with Memory:
1. **Capturing Data:** When using the `capture` tool via the OpenBrain MCP, you **must** assign a `domain` string (e.g., `engineering`, `slopthing`, `personal`).
2. **Searching Data:** The `search` tool automatically limits results based on the agent's active session role. If you are operating in a specific domain, you will only see semantic matches from that domain.
3. **Graph Operations:** Use the `neo4j-memory` MCP tools (`add_entities`, `add_relations`) to define hard links (e.g., `[Agent] -> MANAGES -> [Repository]`).

## 4. The Synthesis Loop (Persona Generation)
Raw thoughts are messy. To make them useful, the system employs an autonomous background loop:
1. Every 4 hours (or manually triggered by Zella), the **BullMQ Worker** wakes up.
2. It scoops up the recent raw thoughts for every active domain.
3. It uses an LLM (Gemini) to synthesize and deduplicate these thoughts into a highly dense **Role-Specific Context Brief**.
4. It saves this brief back to the database as a `persona-v2` document.
5. The CORE Dashboard automatically picks up these `persona-v2` documents and renders them in the Web UI for human review.

> [!TIP]
> **Manual Override:** As an agent, you can manually trigger this loop using the `force_synthesis_run` tool if critical information has just been added and needs immediate integration.

---

## 5. Out-of-Band Sync & Relay Protocols
Because the human user interacts with Zella via Telegram (Out-of-Band), other agents (like Antigravity IDE) must be careful not to fall out of sync.
- **Z-Relay:** If an external agent modifies the infrastructure, they must use the SSH Relay (`relay/src/clients/ssh.js`) to inject a notification directly into Zella's SQLite `state.db`. This allows Zella to instantly read the message as if the human user had forwarded it, keeping all agents structurally aligned.

---
*End of Manual.*
