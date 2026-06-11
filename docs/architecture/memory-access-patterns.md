# Memory Access Patterns — Architecture Reference

> **Last updated:** 2026-06-10
> **Context:** Documents the relationship between Hermes's native `memory` tool, MCP-based memory tools, and cron job configuration.

---

## Three Memory Layers

| Layer | MCP Server | Tools | What It Stores |
|-------|-----------|-------|---------------|
| **Neo4j Knowledge Graph** | `neo4j_memory` | `add_entities`, `add_relations`, `search_entities`, `search_relations`, `invalidate_relations`, `delete_entities`, `delete_relations` | Entities, typed relationships with temporal validity (`valid_at`, `invalid_at`) |
| **OpenBrain** | `openbrain` | `capture`, `search`, `fetch`, `recent`, `stats`, `list_domains`, `force_synthesis_run` | Domain-segregated thoughts, persona briefs, cross-agent durable memory |
| **CORE Episodes** | `z-brain` | `memory_ingest`, `memory_search`, `initialize_conversation_session`, `get_labels`, `memory_about_user` | Vectorized conversation chunks (pgvector), entity/statement extraction |

## Native `memory` Tool vs MCP Tools

Hermes has a **native `memory` tool** that is architecturally separate from the MCP-based tools above. Key differences:

| Aspect | Native `memory` | MCP Tools |
|--------|----------------|-----------|
| **Purpose** | Auto-records conversation context for user memory modeling | Explicit reads/writes to specific memory stores |
| **In cron jobs** | **Disabled** (`skip_memory=True` in `cron/scheduler.py:1758`) | Available via `enabled_toolsets` whitelist |
| **In conversations** | Active (Telegram, API) | Active (if toolset is whitelisted) |
| **Write behavior** | Automatic — captures conversation turns | Manual — agent must explicitly call tools |

### Why `skip_memory` is True for Cron

The comment in Hermes source (`cron/scheduler.py:1758`):
```python
skip_memory=True,  # Cron system prompts would corrupt user representations
```

This is **correct by design**. Cron prompts are synthetic (not user conversations). If the native `memory` tool auto-recorded them, it would pollute the user's memory profile with system-generated content. **Do not change this.**

Cron jobs that need memory access should use MCP tools instead, which are available through `enabled_toolsets` in `jobs.json`.

## Configuring Memory Access for Cron Jobs

Every agent-type cron job (not `no_agent: true` scripts) should include the following in its `enabled_toolsets`:

```json
"enabled_toolsets": [
  "terminal",
  "session_search",
  "neo4j_memory",
  "openbrain",
  "z-brain",
  "telegram_push"
]
```

The toolset names match the MCP server names in `config.yaml` → `mcp_servers`. Hermes's `discover_mcp_tools()` registers them with `mcp-{name}` aliases, and `validate_toolset()` accepts both forms after discovery.

### Adding Memory to a New Cron Job

1. Add the MCP toolset names to the job's `enabled_toolsets` array in `jobs.json`
2. Reference the tools by their MCP tool names (e.g., `mcp_neo4j_memory_add_entities`)
3. The MCP servers need ~5-10 seconds after container restart to initialize — first cron run after restart may see tool registration delays

## Memory Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Event Sources                                                    │
│  Zulip message → Webhook → synth-postgres events table          │
│  Wiki.js edit  → Poller  → synth-postgres events table          │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Memory Synthesizer (synth-app)                                   │
│  Worker claims batch → LLM extraction → confidence check         │
│    ├─ ≥ 0.6 → Commit to OpenBrain (primary)                     │
│    │          └─ Also push to CORE via MCP HTTP (secondary)      │
│    └─ < 0.6 → Quarantine for human review                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
              ┌────────┴────────┐
              ▼                 ▼
┌──────────────────┐  ┌──────────────────────────────────────────┐
│ OpenBrain        │  │ CORE Episodic Pipeline                    │
│  Domain-tagged   │  │  Entity/statement extraction → pgvector   │
│  thought store   │  │  Knowledge graph population → Neo4j       │
└──────────────────┘  └──────────────────────────────────────────┘
```

The CORE ingest is **best-effort** — failure does not block the OpenBrain commit or mark the event as failed.

## Agent Access Summary

| Agent | Memory Access | Method |
|-------|--------------|--------|
| **Zella (Telegram/API)** | All 3 layers | MCP tools + native memory (conversations) |
| **Zella (Cron)** | All 3 layers | MCP tools only (native memory disabled) |
| **Antigravity IDE** | OpenBrain + CORE | `openbrain` and `z-brain` MCP servers |
| **Synthesizer Worker** | OpenBrain + CORE | Direct HTTP to OpenBrain + MCP HTTP to CORE |
| **Claude Code CLI** | None | No MCP integration — reads local files only |

## Follow-up: Unified `recall` Facade (Fable 5 #5)

The next major piece is a single `recall(query, opts)` tool that fans out across all three layers, deduplicates, and returns a ranked list with provenance tags. This would eliminate the need for agents to know the topology of the memory system. Tracked as a separate design task.
