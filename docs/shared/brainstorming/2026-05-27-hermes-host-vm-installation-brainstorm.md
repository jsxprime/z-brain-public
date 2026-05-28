# Brainstorm: Moving Hermes from Docker to the Host VM

**Date:** 2026-05-27  
**Question:** Should Hermes/Zella move out of the Docker container and run directly on the Z-Brain host VM, while CORE and OpenBrain remain containerized?

## Upstream Docs Reviewed

After the first draft, this memo was revised against the upstream Hermes Agent repo and docs:

- [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
- [Hermes Agent documentation](https://hermes-agent.nousresearch.com/docs/)
- [Installation](https://hermes-agent.nousresearch.com/docs/getting-started/installation)
- [Configuration / terminal backends](https://hermes-agent.nousresearch.com/docs/user-guide/configuration)
- [Docker](https://hermes-agent.nousresearch.com/docs/user-guide/docker/)
- [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/)
- [Security](https://hermes-agent.nousresearch.com/docs/user-guide/security)

## Short Answer

Yes. After checking the upstream docs, the idea makes **more** practical sense than my first-pass answer suggested. Hermes is explicitly designed to run host-native on Linux/macOS/WSL2, including as a dedicated non-sudo service user, and it has a built-in `terminal.backend: docker` mode for exactly the split you described: Hermes runs on the host, while the agent's terminal/code execution happens inside a Docker sandbox.

After reading Claude's second-opinion memo and checking the local config, I would qualify the recommendation:

- If **Antigravity CLI / host-native CLI orchestration** is the main reason, migrate Hermes to the host.
- If the main reasons are only permissions, Codex/Claude Code access, or general cleanliness, the case is weaker; those can mostly be fixed while keeping Hermes containerized.
- Either way, the current container is not providing meaningful shell isolation, because Hermes' terminal backend is already configured to SSH back into the VM as `YOUR_VM_USER`.

The strongest version is a **host-native Hermes + Docker execution backend** architecture:

- Keep CORE, Postgres, Neo4j, Redis, and OpenBrain containerized.
- Move Hermes' **operator-facing runtime** to the VM host, where it can see host CLIs, credentials, local config, SSH, Docker, Codex, Claude Code, and Antigravity-related tooling more naturally.
- Configure Hermes terminal execution to use Docker for untrusted code/app/site work.
- Avoid giving the main Hermes process unrestricted host write/execute authority unless there is a clear policy layer in between.

My revised recommendation is: **make host-native Hermes the preferred target only if Antigravity/host CLI integration is the real driver, and migrate in parallel with rollback rather than cutting over in place.** The upstream docs remove one of the biggest unknowns: this is not a weird unsupported deployment shape. Claude's memo adds the important caution that the migration cost is not Hermes itself; it is rehoming the surrounding MCP fleet.

## Why This Is Coming Up

The current system has a useful separation:

- CORE is backend infrastructure and belongs in Docker.
- OpenBrain is a service/broker and also belongs in Docker.
- Hermes is different. Hermes is not just a web service; it is the active agent runtime. It touches tools, skills, credentials, shell environments, `state.db`, memory integrations, Telegram, MCP child processes, and code execution flows.

Recent diagnostics show the pain points are not mostly "Docker is broken." They are boundary problems:

- Bind-mounted files in `hermes-stack/data/skills/` ended up owned by `root:root`, while the container runs as UID `10000`.
- `config.yaml` was unreadable at startup, so Hermes latched into default config until restart.
- Hermes needs access to host-ish things: skill files, Docker socket, CLI credentials, MCP processes, local toolchains.
- Some tools blur environments: internal tools like `session_search`, terminal tools, SSH host commands, and sandbox commands can be confused by the model.
- The Docker socket mount gives the container enormous effective power anyway, while still preserving annoying permission friction.

That combination is the worst of both worlds: the container is not a clean isolation boundary, but it still creates enough filesystem and runtime translation problems to degrade operations.

Claude's second-opinion memo found one sharper fact that should sit near the top: the live/scratch Hermes config has:

- `terminal.backend: ssh`
- `ssh_host: YOUR_VM_IP`
- `ssh_user: YOUR_VM_USER`
- `cwd: /home/YOUR_VM_USER/workspaces`
- `ssh_key: /opt/data/.ssh/id_ed25519`

So today's path for terminal execution is effectively:

```text
Hermes container -> SSH to VM host -> YOUR_VM_USER shell -> command execution
```

That means moving Hermes to the host does **not** newly grant the model host shell access. It already has that through SSH. The migration mainly makes the topology honest and gives you a chance to replace `YOUR_VM_USER` shell execution with a dedicated `hermes` service user plus Docker-backed execution.

## Feasibility

Running Hermes directly on the VM is feasible and upstream-supported.

The upstream installer supports Linux/macOS/WSL2 and handles `uv`, Python 3.11, Node.js, ripgrep, ffmpeg, repo clone, virtualenv, and launcher setup. The docs also explicitly describe non-sudo/system-service-user installs, including a dedicated unprivileged `hermes` systemd-style account. That directly matches the VM-host idea.

The important install facts:

- Per-user data normally lives under `~/.hermes/`.
- Config lives in `~/.hermes/config.yaml`.
- Secrets live in `~/.hermes/.env`.
- `SOUL.md`, skills, memory, cron, sessions, and logs are all first-class files/directories under `~/.hermes/`.
- The gateway can be started with `hermes gateway`.
- The API server listens on port `8642` when enabled.
- The Docker image maps host `~/.hermes` to `/opt/data`, so migration can be treated as a data-layout conversion rather than a conceptual rewrite.

The remaining feasibility questions are local:

1. Can the VM install and run host Hermes cleanly as a dedicated `hermes` user?
2. Can we migrate or copy current `/opt/data` contents from `~/docker/hermes-stack/data` into that user's `~/.hermes/` without breaking paths?
3. Can API, dashboard, Telegram, OpenBrain, CORE MCP, and cron all work on alternate ports first?
4. Can Codex, Claude Code, and Antigravity CLI access be provided without running Hermes as `YOUR_VM_USER`?
5. Can the terminal backend be set to Docker so generated code does not run directly on the host?

That is a straightforward prototype, not an upstream-package archaeology project.

The hidden feasibility cost is MCP rehoming. The current config launches MCP processes from inside the Hermes container. A host-native Hermes loses both Docker DNS names and container-local bind-mount paths unless they are rewritten.

Current examples from the local config:

| MCP | Current dependency | Host-native migration issue |
| --- | --- | --- |
| `github` | `npx` stdio process | Should move easily if Node/npm/auth are available to the `hermes` user. |
| `neo4j_memory` | `/opt/mcp/neo4j-memory/index.js`, `bolt://core-neo4j:7687` | Needs host path replacement and host-reachable Neo4j address. |
| `openbrain` | `mcp-remote http://openbrain-server:3040/sse` | `openbrain-server` Docker DNS will not resolve from host by default. |
| `z-brain` | `mcp-remote http://core-app:3033/api/v1/mcp` | `core-app` Docker DNS will not resolve from host by default. |
| `telegram_push` | `/opt/mcp/telegram/server.js` | Needs host path replacement and Node deps available. |

This is probably the largest concrete migration task.

## What Gets Better

### 1. Host CLI Access Becomes Natural

Codex, Claude Code, Antigravity helpers, `gh`, `ssh`, local config files, Docker CLI, and other operator tools are all easier to use from the host than from inside a container. You avoid questions like:

- Is the binary installed in the container?
- Is the right auth token mounted?
- Is the mounted home directory readable by UID `10000`?
- Is this path a container path or host path?
- Does this subprocess expect a TTY?

For an agent whose job includes supervising and coordinating other CLI agents, host-native execution is often more ergonomic.

### 2. Fewer UID and Bind-Mount Permission Failures

The recent `file_sync` and `skill_view` failures are classic Docker bind-mount ownership problems. A host-native Hermes service running as a real `hermes` user can own its own files consistently:

- `/opt/hermes`
- `/var/lib/hermes`
- `/etc/hermes/config.yaml`
- `/var/log/hermes`

This does not eliminate permissions, but it makes them ordinary Linux permissions instead of host/container UID translation.

### 3. Cleaner Mental Model for Zella

If Hermes runs on the VM, then "terminal" means "VM terminal" unless a tool explicitly says "sandbox container." That is simpler than:

- Hermes container shell
- Host VM shell through Docker socket or SSH
- Short-lived app sandbox shell
- IDE workstation shell

You can make the model's environment map sharper:

- Hermes host runtime: orchestration, CLIs, memory, Telegram, coordination.
- User project containers: app creation, experiments, package installation, tests.
- CORE/OpenBrain containers: durable services only.

### 4. Better Integration With Systemd, Logs, and Host Monitoring

Systemd gives you:

- `systemctl status hermes`
- `journalctl -u hermes`
- restart ordering after Docker/network availability
- environment files with predictable ownership
- service hardening options

Docker already gives some of this, but systemd is a good fit for a host-level operator process.

### 5. The Docker Socket Problem Gets More Honest

Right now, mounting `/var/run/docker.sock` into `hermes-agent` means the container can effectively control the host's Docker daemon. That is a large privilege. If Hermes already needs that authority, running it as a controlled host service with explicit group membership and policy may be clearer than pretending the container is a strong sandbox.

## What Gets Worse

### 1. You Lose Some Reproducibility

The container gives you a known runtime image. Host installation means the VM's Python, Node, npm packages, shell profile, and global tools can drift.

Mitigation:

- Use a dedicated `hermes` user.
- Use a pinned virtualenv or `uv`.
- Use an `.env` file and systemd unit checked into docs/config.
- Keep a reinstall script.
- Avoid global npm installs where possible.

### 2. Host Blast Radius Increases

Hermes is an LLM-driven agent runtime. If it can run host commands, access credentials, and control Docker, a prompt-injection or bad tool call can do damage.

Important correction from Claude's memo: in the current deployment, terminal execution already SSHes into the host as `YOUR_VM_USER`. So the migration does not necessarily increase blast radius relative to today's real behavior. The security outcome is determined by the account and execution policy you choose next.

This matters more than convenience. Host-native Hermes should not mean "let Zella keep doing everything as `YOUR_VM_USER`."

Mitigation:

- Run as `hermes`, not `root` and not `YOUR_VM_USER`.
- Give Docker access deliberately, ideally through a constrained wrapper rather than raw socket access.
- Put app/code work into disposable containers.
- Require allowlisted command tools for dangerous operations.
- Keep secrets scoped by capability, not dumped into one global environment.

### 3. Upgrades May Become More Annoying

With Docker, upgrading can be as simple as pulling a new image and restarting. Host-native upgrades may require dependency migrations, virtualenv rebuilds, and service file changes.

Mitigation:

- Keep the Docker deployment as rollback for a while.
- Build a `hermes-host` install/update script.
- Pin versions and document the exact install path.

### 4. You Can Create a Messy Host Over Time

If Hermes installs random tools globally, writes into `/home/YOUR_VM_USER`, and accumulates credentials everywhere, the VM will become hard to reason about.

Mitigation:

- Treat host-native Hermes as a productized service, not an ad hoc shell user.
- Use strict path conventions.
- Keep generated/user project code out of the Hermes home.
- Use containers for build/test/run work.

### 5. Some Problems Are Not Caused by Docker

Moving Hermes to the host would not automatically fix:

- OpenRouter weekly limits.
- Abacus credit exhaustion.
- model fallback quality.
- MCP protocol `ping` validation noise, unless you patch/upgrade Hermes.
- hallucinated tool names from weaker fallback models.
- prompt-injection risk.

It addresses environment friction, not provider economics or model behavior.

## Security View

The key question is not "Docker or host?" It is: **what can the model cause to happen?**

Current containerized Hermes already has high privilege because it mounts the Docker socket. A container with Docker socket access can usually create privileged sibling containers, mount host paths, and read/write a lot of host state. So the current deployment is not a strong containment story.

A host-native Hermes can be acceptable if it is designed as a controlled operator:

- Service user: `hermes`
- No password login
- No unrestricted sudo
- Read/write only to Hermes data paths
- Docker access mediated by a wrapper or a narrow set of sandbox-launch commands
- Separate secrets for Hermes, OpenBrain, Telegram, Claude/Codex/Antigravity integrations
- Audit logs for shell and Docker operations

The riskier version would be Hermes running as `YOUR_VM_USER` with all your normal shell credentials and full Docker access. That would be very convenient, but it collapses the boundary between "agent" and "owner account."

Claude is right that this user-account choice is the center of the security story. Migrating from container -> host as `YOUR_VM_USER` is mostly an ergonomic cleanup. Migrating from container-with-SSH-to-`YOUR_VM_USER` -> host service as `hermes` is a real blast-radius improvement.

## Suggested Target Architecture

```text
VM: YOUR_VM_IP

Host systemd services:
  hermes.service
    - runs as hermes user
    - exposes :8642 and :9119
    - HERMES_HOME=/home/hermes/.hermes
    - starts `hermes gateway`
    - API server enabled in /home/hermes/.hermes/.env
    - terminal.backend=docker in /home/hermes/.hermes/config.yaml
    - can call selected host CLIs and Docker sandbox workflows

Docker stacks:
  core-stack
    - core-app
    - core-postgres
    - core-neo4j
    - core-redis

  openbrain-server
    - OpenBrain MCP
    - talks to CORE over agent-net or host-published ports

  hermes-workspace sandboxes
    - Hermes Docker terminal backend container for code/app/site generation
    - optional per-project/per-task containers when stronger isolation is needed
    - project-specific mounts
    - scoped credentials only when required
```

In this model, Hermes becomes the host-level conductor, while the actual code execution still happens in Docker-managed environments.

This target is also close to Hermes' own documented model: host-running Hermes can choose among terminal backends, including `local`, `docker`, `ssh`, Modal, Daytona, and Singularity. The Docker backend is a single persistent sandbox container shared across tool calls for the lifetime of the Hermes process, with security hardening such as dropped Linux capabilities, `no-new-privileges`, PID limits, and tmpfs limits.

## MCP Rehoming Plan

Before any cutover, decide how host Hermes will reach services that are currently addressed by Docker DNS:

1. Publish or confirm host ports for `core-app`, `openbrain-server`, and Neo4j, then rewrite MCP URLs from Docker names to host-reachable addresses such as `127.0.0.1:<port>` or `YOUR_VM_IP:<port>`.
2. Move `/opt/mcp/neo4j-memory/index.js` and `/opt/mcp/telegram/server.js` to stable host paths owned/readable by the `hermes` user, for example `/opt/hermes-mcp/...` or `/home/hermes/.hermes/mcp/...`.
3. Install Node dependencies for those MCP servers under their host paths.
4. Test each MCP independently as the `hermes` user before starting the gateway.
5. Add one acceptance criterion: Hermes must either load the intended MCP/config set or refuse to start. Silent fallback to defaults should be treated as a failed boot.

The host migration should be considered incomplete until `github`, `neo4j_memory`, `openbrain`, `z-brain`, and `telegram_push` all work from the host service context.

## Alternative 1: Keep Hermes Containerized, But Harden It

This is the conservative option. It may be enough if the biggest issue is file ownership.

Recommended changes:

- Stop editing bind-mounted Hermes files as root.
- Ensure `./data` is owned by UID/GID expected by the container.
- Consider setting `HERMES_UID`/`HERMES_GID` to match the host data owner, which upstream documents as the fix path for Docker permission errors.
- Add a pre-start permission check for `config.yaml`, `SOUL.md`, `state.db`, and `skills/`.
- Add a health check that confirms Hermes actually loaded `config.yaml` rather than silently defaulting.
- Move CLI credentials into predictable read-only mounts.
- Build a custom Hermes image that includes required CLIs and MCP dependencies.
- Replace raw Docker socket exposure with a narrower sandbox-launch sidecar if possible.

Pros:

- Least migration risk.
- Keeps image-based upgrades.
- Preserves current operating model.

Cons:

- You still fight host/container path and UID boundaries.
- Every new CLI integration requires image rebuilds or mounts.
- Docker socket exposure remains awkward.
- Hermes remains harder to use as a host operator.

Best if: you want stability this week and the current problems can be fixed with ownership, config, and image hygiene.

Upstream note: this remains a legitimate deployment. Hermes' Docker docs explicitly support running the gateway in a persistent container, exposing `8642`, enabling the dashboard with `HERMES_DASHBOARD=1`, and building derived images or sidecars for additional tools. So keeping Hermes in Docker is not "wrong." It is just less aligned with your desire for host-level CLI orchestration.

## Alternative 2: Add a Host-Side CLI Bridge, Keep Hermes Containerized

This is the most interesting middle path.

Keep Hermes in Docker, but give it an explicit host-side service for operations:

- `host-ops.service` runs on the VM as a controlled user.
- Hermes calls it over HTTP/MCP/stdio.
- It exposes tools like:
  - `run_codex_task`
  - `run_claude_code_task`
  - `run_antigravity_task`
  - `create_project_sandbox`
  - `inspect_docker_stack`
  - `read_hermes_logs`
  - `restart_service`

Pros:

- Keeps Hermes image-based.
- Avoids installing all host tooling into the Hermes container.
- Makes host authority explicit and auditable.
- Lets you enforce allowlists and approvals in one place.
- Can be built incrementally.

Cons:

- More moving parts.
- Still has two runtimes.
- Requires careful API design so it does not become "remote shell as a service."

Best if: you want flexibility without a full Hermes migration.

## Alternative 3: Full Host-Native Hermes

Move the Hermes gateway/runtime to the VM host, but set `terminal.backend: docker` for agent shell/code execution.

Pros:

- Maximum CLI flexibility.
- Simplest environment map for host operations.
- No bind-mount UID friction for Hermes data.
- Easier use of systemd, local auth, local CLIs, and TTY-capable tools.
- Matches upstream's supported non-sudo service-user install path.
- Uses Hermes' own Docker terminal backend instead of a custom sandbox plugin as the primary code-execution path.

Cons:

- Higher migration and security risk than leaving the container untouched.
- More host dependency drift.
- More manual upgrade burden than `docker compose pull && up -d`, though `hermes update` and `hermes doctor` help.
- Requires a clean rollback plan.

Best if: Hermes is increasingly becoming the VM's operator brain, not just a chat/API container.

## Practical Recommendation

I would not "just keep it the way it is" unchanged. The current shape is already showing stress, and the Docker socket mount means you are paying the complexity cost of containerization without getting a full security boundary.

After reading upstream, I would change the target from "maybe host-native" to:

> **Host-native Hermes as a dedicated service user, with Hermes' built-in Docker terminal backend for app/code work.**

After reading Claude's second opinion, I would add:

> **Do this migration if Antigravity or broader host-native CLI orchestration is the real goal. Otherwise, fix the container and consider a narrow host bridge first.**

I would do this in phases:

### Phase 1: Stabilize Current Container

Do this immediately even if you later migrate:

- Fix ownership under `~/docker/hermes-stack/data`.
- Restart Hermes after config ownership is confirmed.
- Add a boot check that fails loudly if `config.yaml` cannot be read.
- Verify `memory`, `skill_view`, `file_sync`, Telegram, and API chat.
- Document exact UID/GID expectations.

### Phase 2: Build a Host-Native Hermes Spike

Create it in parallel, not as a replacement:

- Create a dedicated `hermes` user.
- Install Hermes using the upstream Linux installer as that user.
- Set `HERMES_HOME=/home/hermes/.hermes` unless there is a strong reason to use a different path.
- Use a copy of `config.yaml`, `SOUL.md`, and a copied `state.db` at first.
- Bind to alternate ports, for example `18642` and `19119`.
- Configure `terminal.backend: docker` and an explicit sandbox image/volume policy.
- Rewrite MCP server paths and Docker-DNS URLs for host execution.
- Test:
  - API chat
  - Telegram connection
  - OpenBrain memory
  - CORE MCP
  - Codex CLI
  - Claude Code CLI
  - Docker sandbox launch
  - skill loading
  - all five configured MCP servers
  - `hermes doctor`
  - restart behavior

Success criteria:

- Fewer permission errors.
- Clearer CLI access.
- No loss of memory/session behavior.
- No need to run as `YOUR_VM_USER` or root.
- Terminal/code execution lands in the Docker backend, not the host filesystem.
- MCP tools work without relying on container-only DNS names or `/opt/mcp` bind mounts.
- Hermes refuses to start, or at least fails loudly, if it cannot read the intended config.
- Rollback is just stopping host Hermes and restarting the container.

### Phase 3: Decide Between Host-Native and Host-Bridge

After the spike, choose:

- If host-native is clean: promote it and keep the Docker stack as rollback for a while.
- If host-native is messy: keep Hermes containerized and formalize a host-side CLI bridge.

## Capabilities You Likely Gain

You probably gain:

- Easier Codex/Claude Code/Antigravity CLI orchestration.
- Better access to host SSH, Git, Docker, and local credentials.
- Less path confusion.
- Fewer bind-mount ownership problems.
- Cleaner system-level supervision.
- More flexible creation of per-project app containers.

You do not automatically gain:

- Better model quality.
- Better provider availability.
- Safer code execution.
- More durable memory.
- Better MCP protocol compatibility.

Those still need separate design work.

## The Critical Design Rule

If Hermes moves to the host, **do not let user project execution move to the host with it.**

Hermes can supervise. Hermes can coordinate. Hermes can launch containers. But app creation, package installation, generated code execution, browser automation, and risky experiments should happen in Docker-backed workspaces with bounded mounts and scoped secrets. Hermes' built-in Docker backend uses one persistent sandbox per Hermes process; for higher-risk tasks, add explicit per-project or per-task containers instead of relying on one shared workspace.

The upstream Hermes docs support this rule directly: `terminal.backend: local` gives the agent the same filesystem access as the running user, while `terminal.backend: docker` is meant for safe sandboxing/CI-style work. For this system, local backend should be reserved for deliberately trusted host maintenance tasks, if enabled at all.

That gives you the flexibility you want without turning the VM itself into the scratchpad.

## My Bottom Line

Moving Hermes closer to the host is a coherent direction, and upstream Hermes is designed to support it. It matches what Hermes is becoming in Z-Brain: not merely a backend service, but an operator agent that coordinates memory, IDE agents, Telegram, host tools, and disposable workspaces.

The move is worth doing as a controlled migration path because it may reduce real operational drag and unlock better CLI orchestration. But I would still make the first run a parallel deployment with measurable success criteria, not a one-way replacement.

The best near-term architecture is probably:

1. CORE and OpenBrain stay in Docker.
2. Hermes runs host-native as a locked-down `hermes` service user.
3. Hermes terminal/code execution uses `terminal.backend: docker`.
4. MCP configs are rewritten for host paths and host-reachable service URLs.
5. Dangerous host operations go through explicit wrappers, not arbitrary shell access.

That gives you more flexibility and capability without giving up the parts of Docker that are actually helping.
