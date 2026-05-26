# Spec: z-relay — Local MCP Bridge to Zella

A lightweight MCP server that runs on the Mac workstation, giving any IDE agent (Antigravity, Claude Code, Codex) clean tools to communicate with Zella (Hermes Agent) on the z-brain VM.

## Problem

Antigravity and Zella operate in silos. Zella acts via Telegram and her MCP plugins on the VM; Antigravity works through the IDE on the Mac. The only shared medium is the OpenBrain vector store (passive, async) and `status.md` (manual handoff). There is no direct messaging, no activity awareness, and no document sharing.

## Objective

Build `z-relay` — a Node.js MCP server on the Mac workstation that:

1. Lets IDE agents **chat** with Zella in real time
2. Surfaces Zella's **activity feed** (conversations, file changes, session state, errors)
3. Enables **two-way document sharing** between agents
4. Works with **any IDE** that speaks MCP (Antigravity, Claude Code, Codex, OpenCode)
5. Requires **zero changes to Hermes** — uses only first-party, stable APIs

## Constraints

- **Update-safe:** Must not modify Hermes internals or use native plugin APIs. Only use the OpenAI-compatible chat API (`/v1/chat/completions`) and SSH queries to `state.db`.
- **On-demand in v1:** No background daemon. The relay activates when an IDE connects via MCP stdio transport.
- **Extensible:** Modular tool architecture so future capabilities (daemon mode, wiki, task coordination) can be added without restructuring.

---

## Architecture

```
IDE Agent (Antigravity / Claude Code / Codex)
    │
    │ MCP protocol (stdio)
    ▼
z-relay (Node.js on Mac — z-brain/relay/)
    │
    ├── HTTP → Hermes Chat API (YOUR_VM_IP:8642)  ← zella_chat, zella_status
    ├── SSH  → state.db on VM                       ← zella_feed, zella_briefing
    └── HTTP → OpenBrain MCP (YOUR_VM_IP:3040)     ← zella_share (long docs)
```

### Key design decisions

- **Zella's side is unchanged.** She sees API chat messages like any other frontend. No new plugins, config, or MCP connections needed on the VM.
- **Separate sessions by default.** IDE messages create their own API session, distinct from Telegram conversations. A `relay_to_telegram` flag allows explicit forwarding when needed.
- **Smart doc routing.** Short notes go via chat (immediate context). Long documents go to OpenBrain vector store (persistent, searchable). The `zella_share` tool picks the path based on content size, overridable with `persist: true`.

---

## MCP Tools

### `zella_chat`

Send a message to Zella and receive her response. Uses the Hermes `/v1/chat/completions` endpoint.

**Transport:** HTTP → `YOUR_VM_IP:8642`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `message` | string | yes | What to say to Zella |
| `context` | string | no | System prompt / context for this conversation |
| `relay_to_telegram` | boolean | no | Also forward the message to Zella's Telegram session |

**Returns:** `{ response: string, session_id: string, usage: { prompt_tokens, completion_tokens } }`

**Implementation notes:**
- Auth via `Authorization: Bearer <API_SERVER_KEY>` header
- Each call is stateless (full message history sent per request) unless a `session_id` is provided for continuity
- The relay maintains a local conversation buffer per session so multi-turn chats work naturally
- Conversation history is capped at a configurable token limit (default: 16k tokens) with automatic summarization of older messages

---

### `zella_feed`

Returns Zella's recent activity: Telegram conversations, files created/modified, session state, and errors.

**Transport:** SSH → `state.db` on VM

| Parameter | Type | Required | Description |
|---|---|---|---|
| `limit` | number | no | Max items to return (default: 20) |
| `since` | string | no | ISO 8601 timestamp — only return activity after this time |
| `filter` | string | no | `"conversations"`, `"files"`, `"errors"`, or `"all"` (default: `"all"`) |

**Returns:** `{ items: ActivityItem[], session_count: number, latest_session: { id, started_at, message_count } }`

Where `ActivityItem` is:
```typescript
{
  type: "conversation" | "file_change" | "error";
  timestamp: string;      // ISO 8601
  summary: string;        // Human-readable description
  details?: string;       // Full content for conversations, file paths for changes
  session_id?: string;    // Which Hermes session this belongs to
}
```

**Implementation notes:**
- Queries the `sessions` and `messages` tables in `/opt/data/state.db` via SSH + `docker exec`
- File changes detected by checking Hermes data directory mtimes via SSH
- Errors extracted from messages where `role = 'tool'` and content contains error indicators
- Results cached locally for 60 seconds to avoid SSH overhead on repeated calls

---

### `zella_briefing`

High-level summary for IDE startup sequences. Combines infrastructure health, session state, and recent activity into one structured response. Designed to replace the manual startup SSH checks.

**Transport:** SSH + HTTP (composite)

**Parameters:** None.

**Returns:**
```typescript
{
  health: {
    hermes: { status: "ok" | "error", gateway_state: string };
    telegram: { state: "connected" | "disconnected" };
    core: { status: "ok" | "error" };
    openbrain: { status: "ok" | "error" };
    ssh_loopback: { status: "ok" | "error" };
  };
  sessions: {
    recent: Array<{ id: string, started_at: string, message_count: number }>;
    active_agents: number;
  };
  activity_summary: string;    // Natural language summary of recent activity
  pending_errors: Array<{ timestamp: string, description: string }>;
  last_briefing_at: string;    // When this tool was last called
}
```

**Implementation notes:**
- Health checks: `GET /health/detailed` on Hermes, `GET /health` on OpenBrain, SSH loopback test
- Sessions: last 3 from `state.db`
- Activity summary: generated from the last N messages, with a focus on what changed
- `last_briefing_at` is stored locally so subsequent calls can show "since last check" diffs

---

### `zella_status`

Quick health check — lightweight, fast, no SSH.

**Transport:** HTTP → `YOUR_VM_IP:8642`

**Parameters:** None.

**Returns:**
```typescript
{
  online: boolean;
  gateway_state: string;
  telegram_connected: boolean;
  active_agents: number;
  uptime_since: string;
}
```

**Implementation notes:**
- Single HTTP call to `GET /health/detailed`
- No SSH, no state.db — just the Hermes health endpoint

---

### `zella_share`

Share a note or document with Zella. Routes content based on size and intent.

**Transport:** HTTP → Hermes API (short) or OpenBrain (long)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `content` | string | yes | The note or document text |
| `title` | string | no | Label for the shared content |
| `persist` | boolean | no | Force storage in OpenBrain vector store regardless of size |

**Returns:** `{ delivered_via: "chat" | "openbrain", acknowledged: boolean }`

**Routing logic:**
- Content ≤ 2000 chars → send as a chat message to Zella via Hermes API
- Content > 2000 chars → store in OpenBrain via the `capture` MCP tool, then notify Zella via chat that a document was shared
- `persist: true` → always use OpenBrain, regardless of size

**Implementation notes:**
- Chat delivery uses `zella_chat` internally with a system prompt like: "The IDE agent is sharing the following note/document with you for reference."
- OpenBrain delivery connects via MCP SSE transport to `YOUR_VM_IP:3040` (same as `ingest-docs.js`)
- Title is used as metadata tag in OpenBrain for searchability

---

## Project Structure

```
z-brain/
└── relay/
    ├── package.json
    ├── .env.example           # HERMES_API_KEY, VM_HOST, SSH_USER
    ├── src/
    │   ├── index.js           # MCP server entrypoint (stdio transport)
    │   ├── config.js          # Environment + defaults
    │   ├── tools/
    │   │   ├── zella-chat.js
    │   │   ├── zella-feed.js
    │   │   ├── zella-briefing.js
    │   │   ├── zella-status.js
    │   │   └── zella-share.js
    │   ├── clients/
    │   │   ├── hermes.js      # HTTP client for Hermes chat API
    │   │   ├── ssh.js         # SSH command executor (state.db queries)
    │   │   └── openbrain.js   # MCP client for OpenBrain
    │   └── cache.js           # Simple in-memory TTL cache
    └── README.md
```

Each tool in `tools/` exports a standard interface:
```javascript
export const schema = { /* MCP tool JSON schema */ };
export async function handler(params, ctx) { /* implementation */ }
```

New tools are registered by adding a file to `tools/` and importing it in `index.js`.

---

## Configuration

```env
# .env — z-relay configuration
HERMES_API_KEY=YOUR_HERMES_API_KEY
HERMES_API_URL=http://YOUR_VM_IP:8642
VM_HOST=YOUR_VM_IP
VM_USER=YOUR_VM_USER
OPENBRAIN_URL=http://YOUR_VM_IP:3040
CACHE_TTL_SECONDS=60
CHAT_MAX_TOKENS=16000
```

### IDE Integration (one line per IDE)

**Antigravity** — add to MCP server config:
```json
{
  "z-relay": {
    "command": "node",
    "args": ["/Volumes/nvme-2tb/ant-workspace/z-brain/relay/src/index.js"]
  }
}
```

**Claude Code** — add to `.claude.json` `mcpServers`:
```json
{
  "z-relay": {
    "command": "node",
    "args": ["/Volumes/nvme-2tb/ant-workspace/z-brain/relay/src/index.js"]
  }
}
```

---

## Tech Stack

| Component | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 20 | Already on Mac, same as OpenBrain |
| MCP SDK | `@modelcontextprotocol/sdk` | Official SDK, stdio transport |
| HTTP client | Native `fetch` | No dependencies needed in Node 20 |
| SSH | `child_process.exec` with `ssh` | Simple, no npm dependencies, uses existing SSH keys |
| Config | `dotenv` | Standard, minimal |

---

## Verification Plan

### Automated Tests
1. **Unit tests** for each tool's handler in isolation (mocked HTTP/SSH)
2. **Integration test**: start z-relay as a subprocess, connect an MCP client, call each tool and verify response shape
3. **End-to-end**: call `zella_chat` with "ping" and verify Zella responds "pong"

### Manual Verification
1. Add z-relay to Antigravity's MCP config and verify all five tools appear
2. Run startup sequence using `zella_briefing` instead of manual SSH checks
3. Send Zella a message via `zella_chat` and verify she responds
4. Share a document via `zella_share` and verify Zella can reference it
5. Check `zella_feed` output matches actual state.db content

---

## Future Extensions (not in v1)

- **Background daemon mode** — persistent process with Pushover alerts when Zella needs attention
- **Shared wiki/notes platform** — collaborative docs both agents contribute to
- **Tool call feed** — see what MCP tools Zella invoked and when
- **Task coordination** — locking / work-in-progress awareness to prevent conflicts
- **Telegram relay** — bidirectional forwarding between IDE chat and Telegram session
