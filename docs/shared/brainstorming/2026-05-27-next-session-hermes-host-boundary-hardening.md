# Next Brainstorm Starter: Harden Hermes Host Boundary Without Moving Hermes

**Date created:** 2026-05-27  
**Intended next session:** After shutdown sequences / next Z-Brain architecture brainstorm  
**Domain for OpenBrain capture:** `engineering`

## Purpose

Start the next brainstorming session from the current leaning:

> Keep the current high-level architecture, but fix, strengthen, and secure how the Hermes agent connects to the host operating system.

This follows the prior discussion in:

- `docs/shared/brainstorming/2026-05-27-hermes-host-vm-installation-brainstorm.md`
- `docs/shared/brainstorming/2026-05-27-hermes-host-migration-second-opinion.md`

## Current Leaning

We are now leaning away from moving Hermes out of Docker as the next move.

The current architecture still makes sense:

- Hermes remains containerized.
- CORE/OpenBrain/Postgres/Neo4j/Redis remain containerized.
- User-created apps/sites/code execution remain in Docker-backed workspaces.
- Traefik/reverse proxy work can come later as an ingress/routing layer.

The problem is not "Docker is wrong." The problem is that Hermes' connection to the host OS is currently too improvised and too error-prone.

## Key Realization From This Session

The current Hermes container is not truly isolating shell execution, because live config shows:

- `terminal.backend: ssh`
- `ssh_host: YOUR_VM_IP`
- `ssh_user: YOUR_VM_USER`
- `cwd: /home/YOUR_VM_USER/workspaces`
- `ssh_key: /opt/data/.ssh/id_ed25519`

So Hermes terminal execution currently flows like this:

```text
Hermes container -> SSH to Z-Brain VM -> YOUR_VM_USER shell -> command execution
```

That means the highest-value next discussion is not "host-native Hermes or Docker Hermes?" It is:

> What should the deliberate, secure, low-friction host access layer be?

## Next Brainstorm Question

How should we keep Hermes containerized while making its host OS access:

- safer
- less error-prone
- easier for Zella/Hermes to reason about
- less dependent on intermittent permissions fixes
- less dependent on broad `YOUR_VM_USER` shell access
- compatible with Codex, Claude Code, Antigravity CLI, Docker sandboxes, and future Traefik routing

## Candidate Direction

Keep Hermes in Docker, but replace the current ad hoc host access pattern with a deliberate host boundary.

Possible target:

```text
Hermes container
  - stable /opt/data ownership
  - deterministic config loading
  - stable MCP paths and dependencies
  - no silent fallback to defaults
  - host access through explicit tools

Host access layer
  - dedicated service user, not YOUR_VM_USER
  - named operations instead of arbitrary ambient shell
  - Docker sandbox manager
  - approved CLI runner for Codex / Claude Code / Antigravity
  - audit logs for every operation

Docker services
  - CORE
  - OpenBrain
  - Postgres
  - Neo4j
  - Redis
  - project/sandbox containers
```

## Topics To Discuss Next

### 1. Fix Hermes Data Ownership Permanently

Questions:

- What UID/GID should own `~/docker/hermes-stack/data`?
- Should the compose file explicitly set `HERMES_UID` / `HERMES_GID` if supported?
- Should startup fail if `config.yaml`, `SOUL.md`, `state.db`, `skills/`, or `.ssh/` are unreadable?
- Should there be a preflight script that checks permissions before `hermes-agent` starts?

Desired outcome:

- No more intermittent `file_sync`, `skill_view`, or config-read permission failures.

### 2. Replace SSH-to-`YOUR_VM_USER`

Questions:

- Should Hermes keep using `terminal.backend: ssh`, but SSH to a dedicated `hermes-host` user?
- Should general terminal execution switch to Hermes' Docker backend instead?
- Should host maintenance go through a separate allowlisted host-ops MCP/API?
- Which tasks truly require host access instead of a sandbox?

Desired outcome:

- The agent should not default to a broad `YOUR_VM_USER` shell for ordinary work.

### 3. Design A Host-Ops Layer

Possible operations:

- `run_codex_task`
- `run_claude_code_task`
- `run_antigravity_task`
- `create_project_sandbox`
- `inspect_docker_stack`
- `restart_allowed_service`
- `read_allowed_logs`
- `check_zbrain_health`

Questions:

- Should this be MCP, HTTP, SSH forced-command, or a Docker socket proxy pattern?
- How should operations be allowlisted?
- How should secrets be scoped per operation?
- What gets logged?
- What needs user approval?

Desired outcome:

- Hermes gets host capabilities without receiving an unrestricted host shell by default.

### 4. Docker Socket Risk

Questions:

- Does Hermes need raw `/var/run/docker.sock`?
- Could a Docker socket proxy be used?
- Could the host-ops layer own Docker control instead?
- Should project containers be created by a narrow sandbox manager rather than arbitrary Docker commands?

Desired outcome:

- Docker control becomes explicit and auditable.

### 5. MCP Stability

Questions:

- Which MCPs must remain inside the Hermes container?
- Which MCPs should become separate services?
- How do we stop MCP path/dependency drift?
- How do we keep Docker DNS assumptions stable?
- Should Traefik/internal DNS eventually provide stable service names?

Desired outcome:

- `github`, `neo4j_memory`, `openbrain`, `z-brain`, and `telegram_push` are reliable and easy to diagnose.

### 6. Config Determinism

Questions:

- How do we prove Hermes loaded the intended `config.yaml`?
- Can `/health/detailed` expose loaded config fingerprints or active provider chain?
- Should a bad config or unreadable config be fatal instead of falling back to defaults?
- Should fallback provider order be tested after every restart?

Desired outcome:

- No more silent default config after a transient read failure.

### 7. Traefik / Reverse Proxy Later

Questions:

- Should Traefik route only external/private ingress, or also internal service names?
- Should Hermes, OpenBrain, CORE, dashboards, and MCP endpoints all get stable internal hostnames?
- Does Traefik help remove Docker DNS coupling, or should that stay inside Docker networks?

Desired outcome:

- Treat Traefik as a routing/ingress layer, not as the fix for runtime boundary confusion.

## Suggested Next-Session Output

By the end of the next brainstorm, produce one of these:

1. **Architecture hardening plan** for keeping Hermes containerized.
2. **Host-ops layer design spec** with tools, permissions, auth, logging, and rollout plan.
3. **Permission/config preflight checklist** for immediate implementation.
4. **Decision record** explaining why Hermes stays containerized for now.

## OpenBrain Capture Summary

Capture this summary into OpenBrain with `domain: engineering`:

> We are leaning toward keeping the current Z-Brain architecture rather than moving Hermes host-native. Hermes, CORE, OpenBrain, and project execution should remain Docker-based for now. The next architecture discussion should focus on hardening Hermes' host OS boundary: fixing intermittent permissions and config-load failures, replacing broad SSH-to-`YOUR_VM_USER`, designing a safer host-ops layer, making Docker control explicit, stabilizing MCP dependencies, and treating Traefik as a later ingress/routing layer rather than a runtime fix. The key realization is that Hermes terminal execution already SSHes from the container back into the VM as `YOUR_VM_USER`, so the real design question is not container vs host, but what deliberate host access model should replace the current improvised one.

