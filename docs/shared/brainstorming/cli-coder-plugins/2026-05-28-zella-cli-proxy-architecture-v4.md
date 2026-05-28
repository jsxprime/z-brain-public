# Zella CLI Proxy — Architecture Plan (v3)

## Goal
Build a Telegram-mediated "chat pipe" so that Zella can converse with subscription-based coding CLIs (Claude Code, Codex, and Antigravity). This leverages flat-rate subscriptions to eliminate per-task API costs. All conversation turns are captured into OpenBrain for durable cross-agent memory.

> [!NOTE]
> **Cost model clarity:** The *task execution* (the heavy reasoning from Claude/Codex/Antigravity) runs on subscription — zero API cost. The *routing turn* through Hermes (parsing "ask Claude to…" and calling the tool) still consumes a small number of OpenRouter tokens. The win is on the expensive part.

---

## Spike Results — Headless Mode Compatibility

| CLI | Installed? | Headless Flag | Session Resume | Status |
|---|---|---|---|---|
| **Claude Code** | ✅ | `claude --print "msg"` | `--resume <uuid>` / `--continue` | ✅ Fully supported |
| **Codex** | ✅ | `codex exec "msg"` | `codex exec resume <session-id>` / `codex resume <id> "msg"` | ✅ Fully supported |
| **Antigravity (`agy`)** | ❌ Not installed | `agy -p "msg"` (per docs) | Unknown — needs install to test | ⏳ Deferred — install & verify later |

**Conclusion:** All three CLIs support headless one-shot execution. No PTY management needed. The architecture is symmetric across CLIs.

---

## Resolved Decisions

| Decision | Answer |
|---|---|
| **Artifact Retrieval UX** | All three methods: **(a)** daemon footer + `fetch_artifact` tool, **(b)** inline in OpenBrain capture, **(c)** workspace synced to Mac-browsable path |
| **Thread Namespacing** | Per CLI. A Claude thread and a Codex thread with the same name are independent entries. |
| **Tool Scope** | No code editing in production repos; document/report writing OK |
| **OpenBrain Capture** | Yes, every turn |

---

## Proposed Architecture

```
Telegram → Zella → Hermes plugin (chat_with_cli)
  ↓ HTTP w/ shared-secret auth
Host-Ops Daemon (Node.js, runs as `hermes` user on VM)
  ├─ Thread Registry: thread_name → {cli, session_uuid}
  ├─ Spawns: claude --print --resume <uuid> --add-dir <workspace> --allowed-tools <list> "msg"
  ├─ Captures (thread, prompt, response) → async POST → OpenBrain
  └─ Returns response to Hermes plugin
```

### 1. Host VM Layer: `hermes` User & Workspace

- **User account:** Create a dedicated, unprivileged `hermes` user on the VM. No `sudo`. This is where the CLI subscription auth tokens live (they are sticky to a user account — this is the explicit justification for running this piece on the host rather than inside a container).
- **Workspace:** `/home/hermes/zella-workspace/` — a sandbox directory for drafts, reports, and notes. The CLIs are restricted to this directory via `--add-dir`. They cannot touch `z-brain/` source or `YOUR_VM_USER`'s files.
- **CLI installation:** Claude Code and Codex are already installed system-wide. Antigravity (`agy`) needs to be installed and authenticated under the `hermes` user when ready.

### 2. Host-Ops Daemon (the extensible API layer)

A lightweight Node.js HTTP server running as the `hermes` user, managed by a **systemd unit** (with restart policy, logging to journald, and log rotation).

**Thread Registry:**
- Maps friendly names (e.g., `"zbrain-design"`) to CLI session UUIDs.
- Persisted in a small SQLite file at `/home/hermes/.zella/threads.db`.
- **Namespaced per CLI** (confirmed): a Claude thread and a Codex thread with the same name are completely separate entries.
- Plugin tool surface: `chat_with_cli(cli, thread, message)`, `list_threads(cli)`, `archive_thread(name)`, `fetch_artifact(thread, filename)`.

**Headless Execution:**
- Each CLI invocation is a one-shot subprocess. No persistent process, no "wait for typing to finish" heuristic, no PTY.
- Claude: `claude --print --resume <uuid> --add-dir /home/hermes/zella-workspace/ --permission-mode acceptEdits --allowed-tools "Read,Write,Edit,Glob,Grep" "message"`
- Codex: `codex exec resume <session-id> "message"`
- Antigravity: `agy -p "message"` (flags TBD after install/testing)

**Permission Posture:**
- Working dir: `/home/hermes/zella-workspace/` only.
- Tool allowlist: `Read, Write, Edit, Glob, Grep` — omit `Bash` so the CLI cannot shell out.
- `--permission-mode acceptEdits` so it doesn't hang waiting for interactive approval.

**Artifact Retrieval (all three methods):**
- **(a) Footer + Fetch Tool:** Daemon detects new/changed files in the workspace after each turn and appends a "📄 Files written this turn: ..." footer to the response. A `fetch_artifact(thread, filename)` plugin tool lets you retrieve full file contents on demand.
- **(b) OpenBrain Inline:** Captured turn records include file contents inline so they're searchable in memory.
- **(c) Mac Sync:** `/home/hermes/zella-workspace/` is synced to a Mac-browsable path (e.g., via rsync cron or NFS mount) so you can browse files directly.

**OpenBrain Capture:**
- Owner: the daemon (it sees the full turn cleanly).
- Async, fire-and-forget with a retry queue — does not block the chat reply.
- Each record: `{thread, cli, session_uuid, prompt, response, timestamp, domain, files_written[]}`.

**Security:**
- Binds to `127.0.0.1` or the private network (`10.20.20.0/24`), never `0.0.0.0`.
- Shared-secret header (mirrors the existing `API_SERVER_KEY` pattern from Hermes).

### 3. Hermes Layer: Native Chat Routing Plugin

A Python plugin inside the Hermes container (`/opt/data/plugins/cli_chat/`), following Nous Research plugin conventions.

**Registered tools:**
- `chat_with_cli(cli: str, thread: str, message: str)` — sends a message, auto-creates thread if new.
- `list_threads(cli: str)` — shows active named threads for a CLI.
- `archive_thread(name: str)` — marks a thread as archived.

**The flow:**
1. You send Zella a Telegram message: *"Ask Claude to write a project summary"*
2. Zella calls `chat_with_cli(cli="claude", thread="project-summary", message="Write a project summary for Z-Brain")`
3. The plugin makes an HTTP POST to the Host-Ops Daemon with the shared secret.
4. The daemon spawns `claude --print --resume <uuid> ...`, captures the response.
5. The daemon posts the turn to OpenBrain asynchronously.
6. The daemon returns the response to the plugin.
7. Zella relays the response to you in Telegram.

---

## What Gets Disabled

- **`terminal` toolset in Hermes config:** Added to `disabled_toolsets`. Zella can no longer SSH to the host as `YOUR_VM_USER` and run arbitrary bash commands. The CLI plugins are her only path to the host.
- **The old `cli_router` plugin:** Retired. Replaced by the new `cli_chat` plugin.
- **The `cli-sandbox` Docker container:** Can be removed (it's still running from prior experiments).

---

## Build Order

### Phase 0: Prerequisites (do first)
1. **Create the `hermes` user** on the VM (no sudo, dedicated home dir).
2. **Install & authenticate Antigravity (`agy`)** under the `hermes` user. Confirm headless flags and session-resume support.
3. **Set up CLI auth for Claude Code and Codex** under the `hermes` user. Copy/migrate subscription tokens.
4. **Create `/home/hermes/zella-workspace/`** sandbox directory.

### Phase 1: PoC (validate the core premise)
- Run `claude --print "Hello, what model are you?" --permission-mode acceptEdits` as the `hermes` user to confirm subscription auth works.
- Run `codex exec "Hello"` as the `hermes` user similarly.
- Run `agy -p "Hello"` as the `hermes` user to confirm Antigravity headless works.
- If any CLI fails auth under the `hermes` user, stop and troubleshoot before proceeding.

### Phase 2: Build the Host-Ops Daemon
- Scaffold the Node.js HTTP server.
- Implement thread registry (SQLite), headless execution, and OpenBrain capture.
- Set up the systemd unit.
- Smoke test: hit `POST /cli/claude/message` with a test prompt, verify response + OpenBrain capture.

### Phase 3: Build the Hermes Plugin
- Scaffold `cli_chat` plugin in `/opt/data/plugins/cli_chat/`.
- Register tools: `chat_with_cli`, `list_threads`, `archive_thread`, `fetch_artifact`.
- Wire HTTP calls to the Host-Ops Daemon.
- Restart Hermes container to load the plugin.

### Phase 4: End-to-End Verification
- Ask Zella via Telegram to start a Claude thread and send a message.
- Verify the response appears in Telegram.
- Verify `list_threads` shows the new thread.
- Verify OpenBrain contains the captured turn with file contents.
- Verify `fetch_artifact` retrieves a written file.

### Phase 5: Lockdown
- Add `terminal` to `disabled_toolsets` in `config.yaml`.
- Retire the old `cli_router` plugin.
- Remove the `cli-sandbox` Docker container.

### Edge Cases to Test
- Hung CLI subprocess (timeout + kill after configurable seconds).
- Daemon restart mid-conversation (systemd auto-restart; thread registry survives in SQLite).
- OOM (monitor via systemd memory limits).
