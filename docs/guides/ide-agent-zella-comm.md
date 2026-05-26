# IDE Agent → Zella Communication Guide

A portable guide for any AI-powered IDE agent to set up two-way communication with Zella (Hermes Agent).

> [!NOTE]
> This guide is IDE-agnostic. Whether you're running in Antigravity, Claude Code, Codex, OpenCode, Cursor, or any other agent-driven IDE — the same HTTP API works everywhere.

---

## Prerequisites

1. **Network access** to the Z-Brain VM at `YOUR_VM_IP` (local network)
2. **API key** — stored in `relay/.env` as `HERMES_API_KEY`
3. **Ability to make HTTP requests** — via `curl`, `fetch`, or any HTTP client

---

## Quick Start

### Check if Zella is online

```bash
curl -s http://YOUR_VM_IP:8642/health/detailed
```

Response includes `status`, `gateway_state`, and whether Telegram is connected.

### Send a message and get a response

```bash
curl -s http://YOUR_VM_IP:8642/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "hermes-agent",
    "messages": [{"role":"user","content":"Hello Zella, status check from IDE agent."}],
    "stream": false
  }'
```

Replace `YOUR_API_KEY` with the value from `relay/.env`. The response is standard OpenAI chat completion format:

```json
{
  "choices": [{"message": {"role": "assistant", "content": "Zella's response here"}}],
  "usage": {"prompt_tokens": 42, "completion_tokens": 128}
}
```

### Multi-turn conversation

Include the full message history in the `messages` array:

```json
{
  "model": "hermes-agent",
  "messages": [
    {"role": "user", "content": "First message"},
    {"role": "assistant", "content": "Zella's first reply"},
    {"role": "user", "content": "Follow-up question"}
  ],
  "stream": false
}
```

---

## Conversation History

Hermes stores every message in `state.db` (SQLite) regardless of channel. When you send messages via the API, they are logged in a session alongside Telegram conversations. History is preserved across sessions.

For diagnostic purposes, you can query Zella's recent sessions:

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "docker exec hermes-agent python3 -c 'import sqlite3; conn = sqlite3.connect(\"/opt/data/state.db\"); cur = conn.cursor(); cur.execute(\"SELECT id, started_at, message_count FROM sessions ORDER BY started_at DESC LIMIT 5;\"); print(cur.fetchall())'"
```

> [!NOTE]
> The `sqlite3` CLI is not installed in the container. Use `python3` as shown above. Also, the `messages` table has no `created_at` column — order by `id` instead.

---

## Building an IDE Skill / Workflow

### The Pattern

Most IDE agent frameworks support some form of "skill" or "instruction file" that teaches the agent how to perform tasks. The Zella communication skill should:

1. **On session startup:** Check Zella's health (`GET /health/detailed`)
2. **When the agent needs to talk to Zella:** Use `POST /v1/chat/completions`
3. **For durable cross-agent state:** Use the OpenBrain MCP `capture` tool
4. **For diagnostics:** SSH to the VM to query `state.db`

### Example: Claude Code (`.claude/commands/`)

Create a custom slash command at `.claude/commands/zella.md`:

```markdown
# Talk to Zella

Use the Hermes API to communicate with Zella.

## Health Check
Run: `curl -s http://YOUR_VM_IP:8642/health/detailed`

## Send Message
Run: `curl -s http://YOUR_VM_IP:8642/v1/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer $(grep HERMES_API_KEY relay/.env | cut -d= -f2)" -d '{"model":"hermes-agent","messages":[{"role":"user","content":"$PROMPT"}],"stream":false}'`
```

### Example: Antigravity / Gemini IDE (Skills)

The Antigravity-specific skill lives at `~/.gemini/config/skills/z-brain-zella-comms/SKILL.md`. It wraps the HTTP calls with tool-specific instructions. If your IDE is MCP-capable, z-relay (`relay/src/index.js`) provides native MCP tools as an enhancement — but it must be registered in the IDE's **global** MCP config (for Antigravity: `~/.gemini/config/mcp_config.json`, NOT `~/.gemini/antigravity-ide/mcp_config.json`).

### Example: Generic Agent (AGENTS.md / instruction file)

For IDEs that read a project-level instruction file, add to your `.agent/rules.md`, `AGENTS.md`, or equivalent:

```markdown
## Communicating with Zella

Zella is an AI agent running on the Z-Brain VM. Talk to her via the Hermes API:

- Endpoint: http://YOUR_VM_IP:8642/v1/chat/completions
- Auth: Bearer token from relay/.env (HERMES_API_KEY)
- Format: OpenAI chat completions (same as ChatGPT API)
- Health: GET http://YOUR_VM_IP:8642/health/detailed

When you need to coordinate with Zella:
1. Check her health first
2. Send a message describing what you need
3. Parse her response from choices[0].message.content
```

---

## Optional: MCP Enhancement (z-relay)

If your IDE supports MCP stdio servers, z-relay provides cleaner tool calls:

| Tool | What it does |
|---|---|
| `zella_chat` | Send message, get response (wraps `/v1/chat/completions`) |
| `zella_status` | Health check (wraps `/health/detailed`) |
| `zella_feed` | Query recent sessions/messages from `state.db` |
| `zella_briefing` | Combined health + session overview |
| `zella_share` | Share large documents with Zella |

To register z-relay, add to your IDE's MCP config:

```json
{
  "z-relay": {
    "command": "node",
    "args": ["/path/to/z-brain/relay/src/index.js"],
    "cwd": "/path/to/z-brain/relay",
    "env": {
      "PATH": "/usr/local/bin:/usr/bin:/bin"
    }
  }
}
```

> [!IMPORTANT]
> Z-relay requires `relay/.env` to exist with valid `HERMES_API_KEY`. The HTTP API works without z-relay — z-relay is a convenience wrapper, not a requirement.
>
> **For Antigravity IDE:** The correct config file is `~/.gemini/config/mcp_config.json`. Do NOT add entries to `~/.gemini/antigravity-ide/mcp_config.json` — that file is not read by the IDE.

---

## Reference

- **Full system documentation:** `docs/superpowers/Z-Brain-System-Manual.md`
- **Agent coordination protocol:** `docs/shared/agent-coordination-protocol.md`
- **API key location:** `relay/.env` (`HERMES_API_KEY`)
- **Hermes API endpoint:** `http://YOUR_VM_IP:8642`
- **OpenBrain MCP:** `http://YOUR_VM_IP:3040/sse` (for durable memory sharing)
