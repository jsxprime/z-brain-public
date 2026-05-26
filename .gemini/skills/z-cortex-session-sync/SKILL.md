---
name: z-cortex-session-sync
description: Use this skill at the absolute BEGINNING or END of any development session within the Z-Brain or Red Planet Core workspaces to synchronize state, memory, and documentation across agents.
---

# Z-Cortex Session Synchronization

When working within the Z-Cortex, Red Planet Core, or Hermes Agent ecosystem, you MUST execute the following workflows at the start and end of your session to prevent context fragmentation and ensure all agents share the same overarching reality.

## 🌅 Startup Workflow (Beginning of Session)

If you are just starting a session or opening a new context thread, you must:

1. **Read Local Handoff State:** Use the `view_file` tool to read the contents of `/Volumes/nvme-2tb/ant-workspace/z-brain/docs/superpowers/status.md`. This file contains the snapshot of the previous session and the pending tasks.
2. **Read Tech Stack Manifest:** Use the `view_file` tool to read `/Volumes/nvme-2tb/ant-workspace/z-brain/docs/foundational_stack.md` to ensure you are strictly aware of the allowed tech stack and reference URLs.
3. **Query Global Memory:** If you have access to the `openbrain` MCP server, use the `search` or `memory_search` tool with a query like "Latest architectural changes and context for Z-Cortex" to pull any macro-level decisions that occurred outside your local workspace.

## 🌙 Teardown Workflow (End of Session)

If the user declares the session is ending, or if you are doing a "checkpoint / save state" before creating a new chat context, you must:

1. **Vectorize Documentation:** If you are running locally (Antigravity), use the `run_command` tool to execute `node ingest-docs.js` inside the `/Volumes/nvme-2tb/ant-workspace/z-brain/scripts/` directory. This ensures all documentation you just wrote is immediately available in the OpenBrain vector database.
2. **Update Status Snapshot:** Update `/Volumes/nvme-2tb/ant-workspace/z-brain/docs/superpowers/status.md` with exactly what was accomplished during this session, and what tasks should be prioritized next.
3. **Capture Final Thought:** If you have access to the `openbrain` MCP server, use the `capture` tool to store a permanent, concise memory of the session's major decisions and outcomes so other agents (like Zella via Telegram) can read it asynchronously.
