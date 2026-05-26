# Agent Coordination Protocol
## Antigravity IDE ↔ Zella (Hermes Agent)

**Version:** 1.1.0
**Drafted:** 2026-05-26
**Authors:** Antigravity IDE + Zella (Hermes Agent), commissioned by the operator
**Canonical Location:** `docs/shared/agent-coordination-protocol.md` (in `jsxprime/z-brain-public` repo)
**Protocol Custody:** the operator — edits are his call

> [!IMPORTANT]
> This protocol uses RFC 2119 keywords: **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY**.
> These are normative requirements, not suggestions.

> This protocol exists because of a real incident: Antigravity reported tools as "deployed and verified" when the Docker container was still running old code. Zella correctly identified the gap. This protocol ensures that never happens again.

---

## 1. Agent Roles & Boundaries

| | Antigravity (IDE) | Zella (Hermes/Telegram) |
|---|---|---|
| **Primary context** | Local repo, worktrees, live code edits | VM runtime, Docker stacks, user conversations |
| **Strengths** | Freshest code state, file diffs, build tools | Broader system context, persistent memory, user-facing |
| **Blind spots** | What's actually running on the VM | What changed in the repo since last session |
| **Communication** | Hermes API (curl), z-relay MCP (if loaded), OpenBrain capture | Telegram, OpenBrain, cron jobs |

---

## 2. The Provenance Chain (Mandatory)

Before either agent marks a tooling or service change as **"verified"**, the following chain MUST be completed and documented. Partial completion MUST use the corresponding status label from §2.1.

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│ SOURCE VERIFIED  │ ──▶ │ DEPLOYMENT VERIFIED   │ ──▶ │ RUNTIME VERIFIED     │
│                  │     │                       │     │                      │
│ • repo root      │     │ • compose/deploy path │     │ • live health check  │
│ • branch         │     │ • container name      │     │ • tool surface probe │
│ • commit SHA     │     │ • rebuild vs restart   │     │ • functional test    │
│ • dirty state    │     │ • image digest/tag     │     │ • verified_at stamp  │
│ • changed files  │     │ • bind mounts verified │     │ • verified_by agent  │
└─────────────────┘     └──────────────────────┘     └─────────────────────┘
```

### 2.1 Status Labels (Closed Enum)

Agents MUST use exactly one of these labels. No freeform status prose.

| Label | Entry Criteria |
|---|---|
| `verified-live` | Live runtime probe confirms expected behavior. MUST include `verified_at` timestamp and `verification_method`. |
| `verified-by-both` | Both agents independently completed `verified-live`. |
| `verified-deployed` | Container rebuilt/restarted, but no live functional probe yet. |
| `code-updated-not-deployed` | Source changed in repo. Container NOT rebuilt and NOT using bind mount to changed file. |
| `repo-only` | Code exists in repo but no deployment action taken. |
| `inferred-only` | Status based on memory, logs, or prior sessions — NOT direct verification. |
| `blocked` | Cannot proceed — blocker documented in `blockers` field. |
| `unknown` | No information available. |

### 2.2 Verification Metadata

Every `verified-live` or `verified-by-both` claim MUST include:

```yaml
verified_at: "2026-05-26T03:20:00-04:00"    # REQUIRED — when the probe ran
verification_method: "curl health endpoint"   # REQUIRED — what was done
verified_by: "antigravity"                    # REQUIRED — who performed it
```

### 2.3 Evidence Precedence

When two sources of truth conflict, the following precedence MUST apply:

```
runtime probe  >  deployed artifact check  >  repo state  >  prior handoff  >  memory/claims
```

An agent MUST NOT override a higher-precedence source with a lower one.

### 2.4 The Rule

> **No agent MAY claim "deployed" without confirming that the running process serves the expected code.** Editing a file on the host filesystem is `code-updated-not-deployed` until the container is verified to be using that file (via bind mount or image rebuild).

---

## 3. Canonical Names

To prevent naming drift, the following canonical names MUST be used:

| Entity | Canonical Name | NOT |
|---|---|---|
| The VM | `z-brain-vm` or `YOUR_VM_IP` | "the server", "prod", "the host" |
| The Mac workstation | `workstation` | "local", "my machine" |
| CORE Memory stack | `core-stack` | "the database", "core" |
| OpenBrain server | `openbrain` | "OB", "the vector store" |
| Hermes Agent container | `hermes-agent` | "Zella's container", "the agent" |
| The git repo | `z-brain` (`jsxprime/z-brain-public`) | "the repo", "the codebase" |
| The shared workspace | `docs/shared/` | "the handoff folder" |

---

## 4. Communication Channels

### 4.0 Primary: Hermes API (Universal)

The Hermes Agent API is the **primary communication channel** for all IDE agents. It is an OpenAI-compatible endpoint — the same API that Telegram uses to talk to Zella.

- **Endpoint:** `http://YOUR_VM_IP:8642/v1/chat/completions`
- **Auth:** Bearer token from `relay/.env` (`HERMES_API_KEY`)
- **Health:** `GET http://YOUR_VM_IP:8642/health/detailed`
- **Full docs:** `docs/superpowers/Z-Brain-System-Manual.md` (§5) and `docs/guides/ide-agent-zella-comm.md`

Any agent in any IDE can send a message to Zella with:
```bash
curl -s http://YOUR_VM_IP:8642/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(grep HERMES_API_KEY relay/.env | cut -d= -f2)" \
  -d '{"model":"hermes-agent","messages":[{"role":"user","content":"MESSAGE"}],"stream":false}'
```

### 4.1 Channel Matrix

| Channel | Direction | Use For | MUST NOT Use For |
|---|---|---|---|
| **Hermes API** (`/v1/chat/completions`) | Antigravity → Zella | **All two-way communication**: notifications, questions, collaborative drafting, deployment alerts | — |
| **z-relay MCP** (optional — verify loaded before use) | Antigravity → Zella | Same as Hermes API, but via named MCP tools (`zella_chat`, `zella_status`, etc.). Requires registration in the IDE's global MCP config (`~/.gemini/config/mcp_config.json` for Antigravity). | Agents MUST NOT depend on z-relay being available — always verify it's loaded, then fall back to Hermes API if not |
| **OpenBrain `capture`** | Both → shared | Durable state records, architectural decisions | Ephemeral messages |
| **`docs/shared/`** (git repo) | Both → shared | Protocol docs, handoff state, shared references | Scratch files, temporary data |
| **`handoff.yaml`** | Both → shared | Machine-parseable state snapshots | Prose or explanations |
| **`.agent-lock.json`** | Both → shared | Workspace mutex for destructive operations | Status updates |

### 4.2 Shared Workspace

The `docs/shared/` directory in the `jsxprime/z-brain-public` GitHub repository is the canonical shared workspace. Both agents MUST be able to read and write to it:

- **Antigravity:** Direct filesystem access at `/Volumes/nvme-2tb/ant-workspace/z-brain/docs/shared/`
- **Zella:** Via the `github` MCP server (`jsxprime/z-brain-public`, path `docs/shared/`)

---

## 5. Coordination Rules

### 5.1 Session Startup

**Antigravity** MUST:
1. Read `docs/shared/handoff.yaml`
2. Query OpenBrain for recent out-of-band changes
3. Check Zella's recent Telegram sessions for unresolved items
4. Verify infrastructure health (Hermes, OpenBrain, MCP bridges)

**Zella** SHOULD (on cron or session start):
1. Read `docs/shared/handoff.yaml` via GitHub MCP
2. Query OpenBrain for recent captures from Antigravity
3. Note any discrepancies between memory and live tool surface

### 5.2 During Work

- Agents MUST lock before destructive operations using `.agent-lock.json` with scope, owner, and expiry.
- Agents MUST capture architectural decisions in OpenBrain with `domain: "engineering"`.
- Agents MUST NOT assume the other agent's context. Always specify repo, branch, container, and path explicitly.

### 5.3 Deployment Handoffs

When either agent deploys a change that affects the other's environment:

1. Complete the Provenance Chain (§2) — all three layers
2. Update `docs/shared/handoff.yaml` with deployment details and verification metadata
3. Notify the other agent via the appropriate channel
4. **MUST request explicit verification from the receiving agent**
5. Status MUST NOT be set to `verified-by-both` until the receiving agent confirms

### 5.4 Session Teardown

**Antigravity** MUST:
1. Update `docs/shared/handoff.yaml` with final state
2. Capture session summary in OpenBrain (`domain: "engineering"`)
3. Update `docs/superpowers/status.md` with completed tasks and next priorities

**Zella** SHOULD:
1. Write session summary to OpenBrain if significant decisions were made
2. Note any unresolved items or blocked tasks

### 5.5 Conflict Resolution

1. Evidence precedence (§2.3) MUST be followed
2. The agent with direct access to the resource is responsible for verification
3. If conflict cannot be resolved by probing, escalate to the operator

---

## 6. Assumptions vs. Known Unknowns

Every handoff MUST separate these two categories:

| Category | Definition | Example |
|---|---|---|
| **Assumptions** | Things we believe to be true but have NOT directly verified this session | "neo4j-memory MCP is running" |
| **Known Unknowns** | Explicitly unresolved questions where we lack information | "Should existing thoughts be backfilled with domains?" |

Agents MUST NOT present assumptions as verified facts. If an assumption is critical to the next action, it MUST be verified first.

---

## 7. Glossary

| Term | Meaning |
|---|---|
| **Provenance Chain** | The source → deployment → runtime verification sequence |
| **State Object** | A structured record of repo/deployment/runtime state (see handoff.yaml) |
| **Out-of-Band** | Changes made outside the currently active agent's session |
| **Bind Mount** | A Docker mapping linking a host file into a container (preferred over baked-in copies) |
| **mcp-remote bridge** | The `npx mcp-remote` process inside `hermes-agent` that proxies MCP tool calls to external servers |
