# Z-Brain Workspace Checkpoint

**Last Active:** 2026-05-24 (Ollama Integration Session)

This handoff checkpoint ensures we pick up exactly where we left off.

---

## 1. What Was Done This Session

### ✅ Phase 1A: Connected Z-Brain CORE to Ollama (Mac)

**Goal:** Make Ollama available as a selectable LLM provider in the CORE web app.

**Changes made on Mac (YOUR_OLLAMA_HOST):**
- Ollama was already installed (v0.24.0) with `gemma4:latest` (8B) and `gemma4:31b` (31B)
- Ollama was bound to `127.0.0.1` — user set `OLLAMA_HOST=0.0.0.0` via `launchctl setenv` and restarted Ollama
- Now listens on `*:11434` (all interfaces)

**Changes made to CORE stack on VM (YOUR_VM_IP):**

1. **[core-stack/.env](file:///Volumes/nvme-2tb/ant-workspace/z-brain/core-stack/.env):**
   - Added `OLLAMA_URL=http://YOUR_OLLAMA_HOST:11434/api` (the `/api` suffix is required by `ollama-ai-provider-v2`)
   - `CHAT_PROVIDER` remains `google` (Ollama is additive, not primary)

2. **[core-stack/docker-compose.yml](file:///Volumes/nvme-2tb/ant-workspace/z-brain/core-stack/docker-compose.yml):**
   - Added `OLLAMA_URL=${OLLAMA_URL}` to core-app environment
   - Added `NEO4J_dbms_security_auth__enabled: "false"` to neo4j container (to fix auth lockout caused by container recreation)
   - Added `ports: "5435:5432"` to postgres (this appeared during the session — **NEEDS AUDIT in Phase 2**)

3. **llm-models.json (inside container + VM source):**
   - Added `gemma4:latest` and `gemma4:31b` to the Ollama provider's `models` array
   - Without this, the seeder deprecates manually-created models on every restart
   - Patched both the running container (`/app/apps/webapp/app/config/llm-models.json`) and the source on VM (`~/docker/core-stack/core/apps/webapp/app/config/llm-models.json`)

4. **Database (Prisma/Postgres):**
   - Ollama provider created with `config: {"baseUrl": "http://YOUR_OLLAMA_HOST:11434/api"}`
   - Two models registered: `gemma4:latest` (medium) and `gemma4:31b` (high)
   - Models un-deprecated after seeder kept marking them

**Verified:** End-to-end inference from inside core-app container → Ollama on Mac works.

### ✅ Phase 1B: Connected Zella (Hermes Agent) to Ollama

**Goal:** Make Zella use Ollama/Gemma 4 as her default LLM instead of Gemini (which was hitting 2M TPM rate limits).

**Key discovery:** Zella was NOT using OpenRouter (that was just the Hermes default config). She was using **Google Gemini (gemini-3.5-flash)** via `GOOGLE_API_KEY` and was hitting rate limits.

**Changes made to Hermes config on VM:**

1. **`/opt/data/config.yaml` (inside hermes-agent container, owned by `hermes` user):**
   ```yaml
   model:
     base_url: http://YOUR_OLLAMA_HOST:11434/v1   # OpenAI-compatible endpoint
     default: gemma4:latest
     provider: ollama
   providers:
     ollama:
       base_url: http://YOUR_OLLAMA_HOST:11434/v1
       key_env: OLLAMA_BASE_URL
       models: {}
     google:
       key_env: GOOGLE_API_KEY
       models: {}
     abacus:
       base_url: https://routellm.abacus.ai/v1
       key_env: ABACUS_AI_API_KEY
       models: {}
   fallback_providers:
     - google
   ```

2. **`/opt/data/.env` (inside hermes-agent container):**
   - Fixed `OLLAMA_BASE_URL=http://YOUR_OLLAMA_HOST:11434/v1` (was `http://YOUR_OLLAMA_HOST` — missing port AND path)

**CRITICAL URL DIFFERENCE:**
- CORE app uses `ollama-ai-provider-v2` which expects `/api` suffix → `http://YOUR_OLLAMA_HOST:11434/api`
- Hermes uses OpenAI-compatible API which expects `/v1` suffix → `http://YOUR_OLLAMA_HOST:11434/v1`

**Verified:** Zella responded via Hermes API: "Hello! I can confirm that I am currently running on Ollama."

---

## 2. What Was NOT Done / Needs Phase 2

### ⚠️ Z-Brain/CORE Audit (Priority)
The CORE stack was modified and containers were recreated multiple times. Need to verify:

- [ ] **Neo4j auth**: We added `NEO4J_dbms_security_auth__enabled: "false"` to fix auth lockout. Was auth working before? Is disabling it the right fix or should we reset the password in the data volume?
- [ ] **Postgres port exposure**: `ports: "5435:5432"` appeared in the compose diff. Check if this was already on the VM before we pushed our compose file, or if we accidentally added it. This exposes Postgres to the host network.
- [ ] **35 failed BullMQ jobs**: Pre-existing `ingest-episode` queue has 34 failed jobs. Not caused by us but should be investigated.
- [ ] **PgVector infrastructure init failure**: `TypeError: Cannot read properties of undefined (reading '$queryRaw')` on startup. Pre-existing but should be investigated.
- [ ] **Prisma record-not-found errors**: Seen in logs after restart. May be caused by the model deprecation/un-deprecation cycle.
- [ ] **OpenBrain server unreachable**: The `openbrain` MCP on port 3040 timed out. Pre-existing issue from last session.

### Pending Roadmap (from previous sessions)
- [ ] **Task 1: Expose stack via Pangolin Tunnel** — `core.example.com` HTTPS
- [ ] **Task 4: Integrate Zero Claw**
- [ ] **Task 5: Reconcile design spec with actual deployment**
- [ ] **Docker health checks** — Neither compose file uses `healthcheck` directives
- [ ] **Telegram not working for Zella** — API works, but user reported Telegram wasn't working. May need investigation after Hermes restart.

---

## 3. Architecture Understanding (Documented This Session)

```
┌─────────────────────────────────────────────────────────────────────┐
│  YOU (the operator)                                                         │
│  ├── Telegram ──→ Zella (Hermes Agent) ──→ Ollama (gemma4)         │
│  ├── Browser  ──→ Z-Brain CORE Web UI  ──→ Google (gemini-2.5-flash)│
│  └── IDE      ──→ Antigravity (me)     ──→ Claude Opus             │
│                                                                     │
│  MEMORY LAYER:                                                      │
│  ├── Z-Brain CORE (Postgres+pgvector, Neo4j, Redis)                │
│  ├── OpenBrain (Express SSE bridge, port 3040) ← CURRENTLY DOWN    │
│  └── Hermes MCP plugins: memory, z-brain, openbrain, github        │
│                                                                     │
│  INFRASTRUCTURE:                                                    │
│  ├── VM: YOUR_VM_IP (all Docker containers)                       │
│  ├── Mac: YOUR_OLLAMA_HOST (Ollama + IDE)                               │
│  └── Network: agent-net Docker overlay                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Startup Verification (For Next Session)

When you reopen this project, perform these steps:

- [ ] **Step A**: Read this checkpoint and [status.md](file:///Volumes/nvme-2tb/ant-workspace/z-brain/docs/superpowers/status.md)
- [ ] **Step B**: Verify Ollama is running on Mac: `curl http://localhost:11434/api/tags`
- [ ] **Step C**: Verify VM containers: `ssh YOUR_VM_USER@YOUR_VM_IP "docker ps --format '{{.Names}}: {{.Status}}'"` 
- [ ] **Step D**: Verify Zella responds: `ssh YOUR_VM_USER@YOUR_VM_IP 'curl -sf -X POST http://127.0.0.1:8642/v1/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer YOUR_HERMES_API_KEY" -d "{\"model\": \"gemma4:latest\", \"messages\": [{\"role\": \"user\", \"content\": \"ping\"}]}"'`
- [ ] **Step E**: Begin Phase 2 — Z-Brain/CORE audit

---

*Once you have read this checkpoint, proceed to Phase 2 audit.*
