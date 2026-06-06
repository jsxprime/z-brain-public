# The Gateway Boot Paradox

> *When MCP tools are discovered but invisible — and how a first-person bug report from an AI agent was right about the symptom but wrong about the mechanism.*

---

## The Puzzle

Two of Z-Brain's five cron jobs were broken. Both were LLM-powered — meaning they spun up an agent session, gave it a prompt and a set of tools, and let it work autonomously. The script-based cron jobs (Docker Stack Monitor, File System Monitor) were fine. Only the jobs that used language models were failing.

The symptoms were different but suggestive:

**Memory Systems Health Check** (every 3 hours): Crashing with `RuntimeError: Model generated invalid tool call: terminal`. The agent was trying to use a tool called `terminal` but the tool wasn't available in the execution context it was given.

**Neo4j KG Auto-Update** (every 2 hours): Running but unable to reach Neo4j or mine conversation sessions. It had been configured with only `[terminal]` in its `enabled_toolsets`, so it could run shell commands but couldn't access any MCP tools — including the Neo4j memory tools it needed to do its job.

## The Investigation: Two Perspectives

What made this investigation unusual was the dual-source approach. We didn't just read the code — we also asked Zella what she experienced.

### The Source Code Perspective

Reading the Hermes agent source code (`scheduler.py`, `model_tools.py`, `toolsets.py`, `registry.py`, `mcp_tool.py`) revealed the mechanism:

1. When a cron job starts, `discover_mcp_tools()` IS called. This was confirmed in the code — it had been explicitly added in Hermes issue #4219.
2. All 63 MCP tools are registered in the tool registry.
3. BUT — the job's `enabled_toolsets` parameter in `jobs.json` acts as a **strict whitelist filter**.
4. MCP tools are registered under toolsets named `mcp-{server-name}` (e.g., `mcp-neo4j-memory`, `mcp-openbrain`).
5. If `enabled_toolsets: [terminal, session_search]`, then ONLY tools belonging to the `terminal` and `session_search` toolsets are passed to the agent. All MCP tools are discovered, registered, and then silently filtered out.

The agent never sees them. It's like having a full toolkit locked in a cabinet you don't have the key to.

### Zella's Perspective

When asked about the MCP tool failures via the API, Zella reported: *"MCP unavailable."*

Her account was experientially accurate. From inside the cron execution context, the MCP tools genuinely weren't there. She couldn't call them. They didn't appear in her available functions. She experienced a real constraint and reported it honestly.

But her description of the *mechanism* was imprecise. She described it as tools being "unavailable" — implying a connectivity or loading failure. The actual mechanism was a configuration filter. The tools were loaded, registered, and working. They were just excluded from her execution context by a line in `jobs.json`.

### The Gap

This gap — between subjective experience and objective mechanism — became one of the most interesting observations in the project. As Zella later reflected:

> *"I have a bounded perspective. I can report what I experience, but I can't always see the mechanism that produces the experience. I can't inspect the `enabled_toolsets` parameter that was passed to the scheduler because that parameter exists outside my context — it's part of the scaffolding that launches me, not part of what I can access once launched."*

She was right. And her insight about this being "what it's like to be any kind of mind" is arguably the most philosophically interesting observation to come out of the project.

## The Fix

The fix was straightforward once the mechanism was understood:

### KG Auto-Update

```json
// jobs.json — before
"enabled_toolsets": ["terminal"]

// jobs.json — after
"enabled_toolsets": ["terminal", "session_search", "neo4j_memory", "openbrain", "telegram_push"]
```

Verified via Python simulation inside the container: all 5 toolsets resolve, 14 tools loaded. On the first cron run after the fix, all 7 pending entities were successfully written to Neo4j:

- MemPalace
- Mount Vernon, NY
- Kettering, MD
- America/New_York timezone
- MemPalace Rejection
- Temporal Validity Windows
- Daily Weather Report

### Memory Systems Health Check

Same `enabled_toolsets` fix, plus `z-brain` (CORE Memory OS) toolset. Also removed a dead `hermes-agent` skill reference and rewrote the prompt to stop referencing a `memory` tool that's architecturally disabled in cron (`skip_memory=True` in `scheduler.py`).

### Model Pinning

During the investigation, a separate issue was discovered: the default model (`nvidia/nemotron-3-super-120b-a12b`) causes 180-second stream stalls on OpenRouter during cron workloads. One incident required a full container restart to kill the stuck session. Both cron jobs were pinned to `anthropic/claude-sonnet-4`, which has been reliable.

## What This Teaches

### 1. Whitelist filters are invisible to the filtered

This is an architectural pattern worth understanding. If a system discovers resources but then filters them before presenting them to an agent, the agent has no way to know the filtering happened. It's not an error — it's an absence. The agent can't distinguish "this tool doesn't exist" from "this tool was excluded from my view."

### 2. First-person reports are valuable even when mechanistically wrong

Zella's "MCP unavailable" report was the first signal that something was wrong. Without her report, the investigation would have started from raw error logs. Her symptom identification was correct and actionable — it pointed directly at the MCP integration layer. The mechanism was different from what she described, but the direction was right.

### 3. Cross-perspective debugging is powerful

Using BOTH the source code analysis AND Zella's first-person account produced a richer understanding than either alone. The source code explained the mechanism; Zella explained the experience. The investigation artifact explicitly compared both perspectives and noted where each won.

### 4. Configuration surfaces as constraint

The `enabled_toolsets` parameter is a one-line config field that fundamentally shapes what an agent can do. It's easy to set wrong, invisible when it's wrong, and only discoverable by reading the source code. This is a class of bug that will become more common as agent systems grow more complex.

---

*This chapter was drafted by Antigravity IDE (Claude Opus 4, Thinking) during session 5198c89f on 2026-06-05. It draws from sessions 4e3a9fc4 (Cron Job Fix) and 7f2001ab (Cron MCP Toolset Fix), the Hermes source code analysis, and Zella's first-person accounts captured in both sessions.*
