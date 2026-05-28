# Brainstorm (Second Opinion): Moving Hermes Out of Docker onto the Host VM

**Date:** 2026-05-27
**Question:** Should the Hermes agent be moved from its Docker container to the host VM? CORE and OpenBrain stay containerized. User project code execution would happen in a Docker container.
**Companion doc:** `2026-05-27-hermes-host-vm-installation-brainstorm.md` (the prior agent's pass). This memo is an independent read with a critique + extension at the end.

---

## TL;DR

Yes, moving Hermes to the host is reasonable and the upstream supports it. But the case for doing it is **weaker than the prior memo suggests on security grounds, and stronger than it suggests on the one ergonomic axis you actually mentioned — Antigravity CLI access.**

Two findings from reading the repo shape my answer:

1. **The current container does not isolate shell execution.** `terminal.backend` in `hermes-stack/data/config.yaml` is set to `ssh`, with `ssh_host: YOUR_VM_IP` and `ssh_user: YOUR_VM_USER`. Every shell command Hermes issues today SSHes out of the container and runs on the VM as your admin user. Moving Hermes to the host does not give the model more host access than it already has.
2. **The hidden migration cost is the MCP fleet, not Hermes itself.** Five MCPs spawn from the Hermes process. Two of them resolve Docker DNS names (`core-neo4j`, `openbrain-server`, `core-app`) that won't be reachable from a host process by default. Two more are bind-mounted node scripts. This is the unsexy work that will dominate any migration.

My recommendation: **migrate if Antigravity CLI integration is the real motivation; stay containerized otherwise.** The other reasons people will list (cleaner mental model, fewer permissions errors, easier CLI access) are real but mostly addressable in place. Antigravity is the one that genuinely benefits from a host install.

If you do migrate, run as a dedicated `hermes` user — not `YOUR_VM_USER`. That's the version of the move that meaningfully shrinks blast radius. The convenience version (just install everything under `YOUR_VM_USER`) collapses the agent/owner-account boundary and throws away most of the long-term win.

---

## What I See in the Repo

A few facts that ground the discussion:

### Hermes today

- `hermes-stack/docker-compose.yml` runs the upstream `nousresearch/hermes-agent:latest` image as a single container.
- Bind mounts: `./data → /opt/data`, `./cli-secrets → /opt/data/cli-secrets`, `/var/run/docker.sock → /var/run/docker.sock`.
- Env: `API_SERVER_ENABLED=true`, `HERMES_DASHBOARD=1`, `CLAUDE_CODE_OAUTH_TOKEN` passed in.
- Ports 8642 (API) and 9119 (dashboard) published on host.

### Terminal backend (the key finding)

- `terminal.backend: ssh`
- `ssh_host: YOUR_VM_IP` (the VM itself)
- `ssh_user: YOUR_VM_USER`
- `ssh_key: /opt/data/.ssh/id_ed25519` (a key bind-mounted from the host)
- `cwd: /home/YOUR_VM_USER/workspaces`

When Hermes calls its `terminal` tool today, the path is:
container process → SSH client → port 22 of host → `YOUR_VM_USER` shell → arbitrary command.

The container does not constrain shell execution at all. It just adds a hop. This is relevant to the decision because the most common argument *against* moving Hermes to the host — "you give the model more direct host access" — turns out to be largely a wash. Hermes already has effective host shell access; moving to the host just makes the topology honest.

### MCP servers (the hidden migration cost)

`mcp_servers:` in `config.yaml` defines five MCPs that spawn from the Hermes container:

| MCP | Transport | Notes |
| --- | --- | --- |
| `github` | stdio (`npx`) | Process inside Hermes container — moves trivially. |
| `neo4j_memory` | stdio (node at `/opt/mcp/neo4j-memory/index.js`) | Bind-mounted; talks to `bolt://core-neo4j:7687` (Docker DNS). |
| `openbrain` | mcp-remote → `http://openbrain-server:3040/sse` | Docker DNS. |
| `z-brain` | mcp-remote → `http://core-app:3033/api/v1/mcp` | Docker DNS. |
| `telegram_push` | stdio (node at `/opt/mcp/telegram/server.js`) | Bind-mounted. |

Two of these reach service names that only exist on the `agent-net` Docker network. Two more are bind-mounted node scripts. A host-native Hermes loses the network namespace and the bind mounts. Workable — publish host ports for the affected services, or attach the host Hermes back to `agent-net` via a sidecar — but it's real work that the prior memo doesn't price in.

### Sandbox patterns already present

- `hermes-stack/cli-sandbox/` builds an Ubuntu 24.04 image with Claude Code installed and a node-pty WebSocket bridge on port 8080. So a "CLI agent in a side container" pattern already exists.
- The Hermes container has the Docker socket mounted, which is the substrate for spinning up per-task containers from Hermes.

So today there are already two ways to run Claude Code from this system, and SSH-to-host as a third path. Whatever you do with Hermes' location, knowing those exist matters: it means "Hermes can't reach Claude Code easily" is not actually a problem today — Claude Code already works in containers here.

---

## What Actually Gets Better by Moving Hermes to the Host

- **Antigravity CLI access.** This is the strongest reason. Antigravity is host-tied and containerizing it sounds worse than just installing it on the VM. If this is the main driver, the migration earns its weight.
- **Honest topology.** The current `ssh → YOUR_VM_IP` shape is a footgun: a shell on the host that pretends the container is the boundary. Host-native makes it look like what it is.
- **Bind-mount UID friction goes away.** No more "edited `config.yaml` as root, Hermes can't read it" episodes. No more UID `10000` ownership headaches on `data/skills/`.
- **Service ergonomics.** systemd, journalctl, restart ordering after Docker comes up — nicer for an operator-class process than `docker compose restart`.
- **Easier path to "Hermes runs as `hermes`, not `YOUR_VM_USER`."** Inside the container, the user identity is fixed by the image. On the host you can deliberately create a service user with scoped Docker group membership and the credentials you want it to have. That *is* a real reduction in blast radius — but only if you take it.
- **Codex / Claude Code CLI installation.** Marginal improvement. Both already work in containers in this repo. Host install removes a layer of "is the binary in the image, is the token mounted, is the UID right" but doesn't unlock new capability.

## What Actually Gets Worse

- **MCP rehoming.** As above. Two MCPs reach Docker DNS names. This is the dominant migration task.
- **Dependency drift.** Image-based deployments give you a reproducible Python/Node toolchain. Host installs drift unless you treat the install as a productized service (pinned versions, install script, documented update path). The upstream installer + `hermes update` softens this but doesn't eliminate it.
- **No more `docker compose pull && up -d` upgrade path.** Host upgrades are real work each time.
- **Operator discipline becomes load-bearing.** A containerized service can survive operator laziness because the boundary protects against some forms of drift. A host service only stays clean if conventions are followed.
- **Two simultaneous deployments during the spike.** Until you commit, both are maintained. Short-term, but real.

## What Won't Change

The other memo lists this honestly; worth repeating because it's the easiest thing to lose sight of mid-migration:

- Model quality, provider costs, OpenRouter rate limits — untouched.
- MCP protocol noise, hallucinated tool names from weak fallback models — untouched.
- Prompt injection risk — essentially unchanged.
- The skill loading / `file_sync` issues *will* improve as a side effect, but they can also be fixed without migrating.

---

## Alternative: Stay Containerized

The honest counter-recommendation is: keep Hermes in the container, fix the boundary problems in place, and add a small host-side service for the things Hermes genuinely needs to do on the host (Antigravity CLI being the main one).

What "fix in place" looks like:

- Resolve the bind-mount UID mismatch on `data/`.
- Add a startup check that fails loudly if `config.yaml` isn't readable, so you never silently fall back to defaults again.
- Treat the Docker socket mount deliberately rather than as ambient power.

What "host bridge" looks like:

- A small service on the VM that exposes named operations Hermes can call: `run_antigravity_task`, `run_codex_task`, `manage_project_sandbox`, etc.
- Allowlisted, named, auditable. The model can't ssh anywhere — it can only call the operations you defined.

**When this is the better choice:** if Antigravity CLI integration is *not* the main driver, this path is cheaper, lower-risk, and gets most of the same wins. You keep image-based deploys, you don't touch the MCP fleet, and you make host authority an explicit allowlist rather than an ambient property of "the user Hermes runs as."

**When this is the worse choice:** if you keep growing the host-bridge surface area, eventually you've built a parallel agent runtime on the host and the container has become an empty shell. At some point migration is cheaper than continuing to bridge.

---

## On the Dedicated `hermes` User Question

You flagged this as undecided. My read: this is the easier of the decisions. If Hermes runs on the host, run it as `hermes`, not `YOUR_VM_USER`.

- Convenience case for `YOUR_VM_USER`: inherits all your existing CLI auth, matches the current `ssh_user`, no per-tool credential provisioning needed.
- Cost: you collapse the boundary between "agent" and "owner account." Every credential `YOUR_VM_USER` has, the model has. Every file `YOUR_VM_USER` can write, the model can write.
- The convenience is one-time-setup money. The blast radius is permanent.

The only case I'd consider `YOUR_VM_USER` is a short-lived experiment you plan to revert. For anything intended to last, dedicated user.

This decision is also what determines whether the migration is actually a blast-radius improvement. Migrating to `YOUR_VM_USER` is basically a wash. Migrating to `hermes` is a real reduction. Same destination architecture; very different security story.

---

## My Recommendation

- **Migrate if Antigravity CLI integration is the dominant motivation.** That's the one capability the host install genuinely unlocks. The other wins (cleaner topology, fewer permissions errors, easier CLI access) are nice but not migration-justifying on their own.
- **If you migrate, run as a dedicated `hermes` user.** This is where the real safety improvement lives.
- **If Antigravity isn't the driver, stay containerized and consider a small host-bridge service.** Cheaper, lower-risk, gets most of the operational wins.
- **Either way, treat the MCP rehoming as the real migration cost.** Hermes itself moves easily; the MCPs are where the time goes.
- **Treat the migration as ergonomic, not safety.** The blast radius story is mostly determined by the user account decision and what the model can do via shell tools — not by whether the Hermes process lives inside a container.

---

## Critique + Extension of the Other Agent's Memo

The prior brainstorm is solid. Where I'd push back or extend:

### Where I agree

- Host-native is upstream-supported and a coherent destination.
- The bind-mount UID problems are real and not solved by ignoring them.
- A phased rollout with parallel deployment is the right migration shape.
- The critical design rule — "Hermes can supervise, but user project code execution stays in containers" — is exactly right and matches your stated intent.
- The honest list of things the migration *won't* fix is well-curated and worth preserving.

### Where I think it's off

1. **It misses `terminal.backend: ssh`.** This is the single biggest factual gap. The memo frames moving to host as increasing blast radius. But Hermes already runs every shell command on the host as `YOUR_VM_USER` via SSH. The container's shell isolation is not real today, so moving Hermes off Docker doesn't open new doors — it makes the existing reality visible.

2. **It overstates the CLI access wins.** Claude Code already runs in this repo's containers — `CLAUDE_CODE_OAUTH_TOKEN` is passed into the Hermes container, and `cli-sandbox/` runs Claude Code inside Ubuntu 24.04 with no fuss. The "is the binary in the container? is the auth token mounted? is the UID right?" list reads as bigger than it is. Antigravity is the one CLI where host install genuinely helps. Listing it alongside Codex and Claude Code dilutes the strongest argument.

3. **It doesn't price the MCP rehoming work.** Five MCPs spawn from the Hermes process today. Two reach Docker DNS names that won't resolve from the host (`core-neo4j`, `openbrain-server`, `core-app`). Two more are bind-mounted node scripts at `/opt/mcp/...`. This is real work and the prior memo glosses over it. It should be a section, not a footnote.

4. **The "cleaner mental model for Zella" claim is right for a slightly different reason.** The memo says host-native means "terminal = VM terminal" by default. True. But the bigger clarity win is that today the terminal *is* the VM terminal via SSH from inside a container, which is genuinely confusing. Moving to host fixes that confusion. The framing in the prior memo makes it sound like a downstream nice-to-have rather than a cleanup of an existing mismatch.

5. **The security section is too abstract on "Docker access mediated by a wrapper."** Useful direction, but in a brainstorm it's worth naming the actual choices: (a) `docker` group membership on the `hermes` user, (b) sudo allowlist for specific docker subcommands, (c) a custom HTTP/MCP wrapper, (d) a socket-proxy container (`tecnativa/docker-socket-proxy`-style). The tradeoffs differ a lot and the decision is load-bearing for the security story.

6. **No mention of the `relay/` service.** Probably doesn't need to move, but worth a sentence — if relay talks to Hermes by container name, that's another DNS dependency to consider.

### Where I'd extend

- **Add an MCP-rehoming subsection** to the target architecture. Either publish host ports for `agent-net` services or run host Hermes back on `agent-net` via a sidecar (`network_mode: host` bridge is one option). Make this a deliberate decision, not a discovery during the spike.
- **Add a top-level acceptance criterion** for the spike: "Hermes either reads the intended config or refuses to start." The silent-default-loading bug is the kind of thing that will burn a migration if it recurs in the host install.
- **Sharpen the user-account discussion.** The decision of `YOUR_VM_USER` vs `hermes` largely determines whether the migration actually shrinks blast radius. The prior memo treats it as one of several mitigations; it should be the central security decision.

### Net

The other memo's destination — host-native Hermes with code execution in containers — is plausibly right, and matches your stated intent. But it argues for it on partly the wrong grounds. With the `terminal.backend: ssh` finding included, the CLI-access argument right-sized to "Antigravity is the real win," and the MCP rehoming cost surfaced, the recommendation gets easier to defend honestly — and easier to *not* migrate if Antigravity isn't the actual driver.

---

## My Bottom Line

- Moving Hermes to the host is feasible, upstream-supported, and a coherent direction.
- The strongest single reason to do it is **Antigravity CLI integration**. Codex and Claude Code already work in containers here; Antigravity is the one that meaningfully benefits.
- The current container provides essentially no shell-execution isolation because of `terminal.backend: ssh`. So the move is mostly an ergonomic and clarity improvement, not a safety upgrade.
- The real safety win comes from running as a **dedicated `hermes` user**, not `YOUR_VM_USER`. If you migrate, do that version.
- Code execution stays in containers regardless. Hermes supervises; the host filesystem is not the scratchpad.
- The MCP rehoming work is the hidden cost. Plan for it explicitly.
- If Antigravity is the driver: migrate, as `hermes` user, with a parallel rollout. If it isn't: stay containerized, fix the in-place issues, and add a narrow host-bridge service for the few host operations you actually need.
