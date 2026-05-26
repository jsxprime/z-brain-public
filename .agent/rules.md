# Z-Brain Project Rules & Startup Sync Protocol

Mandatory rules and startup workflows for any agent working in the **z-brain** workspace.

## 1. Z-Brain Architecture Definition
- **z-brain** refers to the VM host (`YOUR_VM_IP`) and the integration stack running on it:
  - **CORE Memory Stack** (`~/docker/core-stack/`): contains `core-app` (Remix), `core-postgres` (with `pgvector` for embeddings), `core-neo4j` (graph), and `core-redis` (queue).
  - **Hermes Agent Stack** (`~/docker/hermes-stack/`): contains `hermes-agent` gateway that communicates via Telegram and runs terminal tools locally/remotely.

## 2. Mandatory Session Startup Workflow
At the beginning of EVERY session, the agent MUST run the following verification steps:

### Step A: VM Connectivity & Key Check
Ensure you can connect to the VM host cleanly:
```bash
ssh -o ConnectTimeout=5 YOUR_VM_USER@YOUR_VM_IP "echo OK"
```
Verify that the `hermes-agent` container's SSH key `/opt/data/.ssh/id_rsa` can execute commands on the host without interactive prompts:
```bash
ssh YOUR_VM_USER@YOUR_VM_IP "docker exec -u hermes -t hermes-agent ssh -o ConnectTimeout=5 -i /opt/data/.ssh/id_rsa YOUR_VM_USER@YOUR_VM_IP 'echo SSH_OK'"
```

### Step B: Out-of-Band State Audit
The user may interact with the Hermes Agent via Telegram or the web interface outside of the current Antigravity/IDE session. To sync on any out-of-band updates, query the SQLite state database inside the container:
1. List the most recent sessions:
   ```bash
   ssh YOUR_VM_USER@YOUR_VM_IP "docker exec hermes-agent python3 -c 'import sqlite3; conn = sqlite3.connect(\"/opt/data/state.db\"); cur = conn.cursor(); cur.execute(\"SELECT id, started_at, message_count FROM sessions ORDER BY started_at DESC LIMIT 3;\"); print(cur.fetchall())'"
   ```
2. Query the last 5 messages in the active session to see what commands or skills the user/Hermes exchanged:
   ```bash
   ssh YOUR_VM_USER@YOUR_VM_IP "docker exec hermes-agent python3 -c 'import sqlite3; conn = sqlite3.connect(\"/opt/data/state.db\"); cur = conn.cursor(); cur.execute(\"SELECT id, role, content FROM messages WHERE session_id = (SELECT id FROM sessions ORDER BY started_at DESC LIMIT 1) ORDER BY id DESC LIMIT 5;\"); [print(f\"[{r}] {c[:150]}...\") for id, r, c in cur.fetchall()]'"
   ```

### Step D: Verify Zella Communication
Check that the Hermes API is reachable and Zella is online:
```bash
curl -s http://YOUR_VM_IP:8642/health/detailed
```
Expected: `{"status": "ok", "gateway_state": "running", "platforms": {"telegram": {"state": "connected"}, ...}}`

If you need to communicate with Zella during the session, see the **Inter-Agent Communication** section in `docs/superpowers/Z-Brain-System-Manual.md` for curl recipes and the full channel matrix.

## 3. Operations Constraints
- Always use user context `-u hermes` when executing test commands inside the `hermes-agent` container to mimic the agent's runtime environment.
- Any new features, packages, or skills added to Hermes must be documented in [status.md](file:///Volumes/nvme-2tb/ant-workspace/z-brain/docs/superpowers/status.md).

## 4. No Hardcoded Secrets
- **Never** hardcode API keys, tokens, passwords, or connection strings in source files.
- All secrets must live in `.env` files (which are gitignored) or be injected via Docker Compose `${VAR}` syntax.
- Source files should reference secrets via `process.env.*` (JS) or `os.environ.get()` (Python).
- Every directory that requires secrets must include a `.env.example` template with placeholder values.

## 5. Communicating with Zella
The Hermes Agent exposes an OpenAI-compatible API at `http://YOUR_VM_IP:8642/v1/chat/completions`. This is the same endpoint Telegram uses. Any IDE agent can talk to Zella with a simple HTTP request — no custom code needed on Zella's side.

- **API Key:** Stored in `relay/.env` as `HERMES_API_KEY`
- **Full documentation:** `docs/superpowers/Z-Brain-System-Manual.md` (§5)
- **IDE-specific setup guide:** `docs/guides/ide-agent-zella-comm.md`
- **MCP enhancement (optional):** If your IDE supports MCP stdio servers, z-relay at `relay/src/index.js` wraps these API calls into MCP tools (`zella_chat`, `zella_status`, `zella_feed`, `zella_briefing`, `zella_share`). For Antigravity, z-relay must be registered in `~/.gemini/config/mcp_config.json` (the global config — NOT `~/.gemini/antigravity-ide/mcp_config.json`).
