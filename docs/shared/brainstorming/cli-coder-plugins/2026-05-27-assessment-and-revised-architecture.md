# CLI Coder Plugins — Assessment & Revised Architecture

**Date:** 2026-05-27
**Context:** Review of the Zella CLI Proxy Architecture plan ([source](/Users/YOUR_USER/.gemini/antigravity-ide/brain/8dcc1fc9-5f5b-4943-8f07-c9d0b6adc9c7/implementation_plan.md))
**Refocus:** Goal is conversational chat with the Claude Code / Antigravity *agents* through Zella/Telegram. The Docker CLI sandbox ([hermes-stack/cli-sandbox/](../../../hermes-stack/cli-sandbox/)) is being dropped for coding CLIs. No code-editing required at this stage; document/report writing is in scope.

---

## Initial Assessment (pre-refocus)

### Overall direction: right problem, right shape

The plan directly attacks the documented pain point from [2026-05-27-next-session-hermes-host-boundary-hardening.md](2026-05-27-next-session-hermes-host-boundary-hardening.md) — "Replace SSH-to-`YOUR_VM_USER`" and "Design a Host-Ops Layer" with named operations like `run_claude_code_task`. Subscription leverage is real and aligns with the cost-conscious provider work in [docs/superpowers/status.md](../../superpowers/status.md). The "named operations behind a daemon" pattern is the right architecture.

### Concrete gaps / questions before building

**1. There was already a `cli-sandbox` in the tree — the plan didn't mention it.**
[hermes-stack/cli-sandbox/server.js](../../../hermes-stack/cli-sandbox/server.js) is a Docker-based **WebSocket** PTY bridge with Claude Code installed via Dockerfile. The plan proposes a **host-native HTTP** daemon. Replacement, evolution, or parallel? Resolved by user decision to drop the Docker sandbox.

**2. The host-native-daemon decision contradicts the recent brainstorm conclusion.**
The brainstorm concluded "keep Hermes containerized to avoid host dependency rot." Standing up a Node service directly on the VM reopens that door. The likely valid answer is "CLI subscription auth is sticky to a user account, so it has to be on the host" — but the plan should *say* that. Otherwise the next brainstorm will re-litigate it.

**3. Why node-pty instead of `claude --print`?**
Claude Code has a documented headless mode (`claude --print "prompt"`, with `--resume <session-id>` or `--continue` for continuity). That eliminates pty management, the "wait for typing to finish" heuristic, session-keepalive, and most failure modes. The plan jumps to node-pty without justifying why. **Strong recommendation:** start with `--print` + `--resume`; only reach for pty if you discover a real blocker.

**4. The hardest problem gets one sentence.**
"Sends a prompt and waits for the CLI to finish typing its response" — how do you detect "done" with a streaming PTY? Idle timer? Prompt-marker regex? This is the part that goes wrong in production. With `--print` the problem disappears.

**5. Permissions in headless mode.**
Claude Code prompts interactively for bash/edit approvals. Headless needs `--permission-mode acceptEdits` (or `bypassPermissions`) or it'll just hang on first tool use. Antigravity has similar concerns. Plan should pick a stance.

**6. No auth on the HTTP endpoint.**
`POST /cli/claude/message` is remote code execution by design. Needs a shared-secret header (mirror the existing `API_SERVER_KEY` pattern) and bind to the private network (10.20.20.0/24), not 0.0.0.0.

**7. Process management is unspecified.**
Who keeps the daemon alive? systemd unit, restart policy, log destination, log rotation. "Lightweight Node.js server" understates how load-bearing this becomes once Zella depends on it.

**8. The "memory saved in OpenBrain" claim isn't wired anywhere.**
Nothing in the proposed flow writes to OpenBrain. Claude Code's session memory, Hermes' Telegram session memory, and OpenBrain are three different stores. Per [memory/project_hermes_api_session_isolation.md](/Users/YOUR_USER/.claude/projects/-Volumes-nvme-2tb-ant-workspace-z-brain/memory/project_hermes_api_session_isolation.md), session fragmentation has already bitten us. Either (a) the daemon captures turns and POSTs to OpenBrain, or (b) the Hermes plugin does, or (c) drop the claim. Pick one explicitly.

**9. "Native plugin instead of MCP" — fine, but consider:**
An MCP server has a standard schema and could be consumed by Claude Code itself, Antigravity, future clients. A Python Hermes plugin is z-brain-only. If reuse matters, MCP is the better envelope. If not, plugin is fine — just be deliberate.

**10. Verification plan is thin.**
- "Local build" doesn't prove the subscription path — that only works on the VM under the `hermes` user with real OAuth tokens. Add a VM-side smoke test.
- "Did not consume OpenRouter tokens" is partially false: Hermes' routing turn (parsing "ask Claude to…") still consumes tokens. The win is on *task execution*. State this precisely.
- Add: concurrent sessions, hung session, OOM, daemon restart mid-conversation.

---

## Refocus: Telegram-mediated chat (not task execution)

### What the refocus changes

**Simpler than originally framed.** If the goal is "Telegram-mediated chat with the Claude Code / Antigravity agents," then:

- The existing `cli-sandbox` decision is resolved — it's gone, so no architectural conflict.
- `claude --print --resume <session-id>` becomes the obvious primitive. Claude Code stores its own session state on disk; each turn is a one-shot subprocess that just passes the session ID. **No node-pty, no persistent CLI process, no "wait for typing to finish" heuristic.** That collapses ~60% of what made me nervous in the original plan.
- Concurrency is ~1 (the operator is the only user), so session management is trivial.
- Whether you even need a Node *daemon* becomes a genuine question. A locked-down SSH from Hermes container → `hermes@host` running a forced-command (`claude --print --resume "$ID" "$MSG"`) would do the job with less moving parts. The daemon's real value is auth + logging + multi-CLI shaping, not session keepalive.

**What still stands from the first take:**
- Auth on whatever endpoint exists (HTTP shared-secret, or SSH forced-command).
- The "OpenBrain memory" claim still needs an explicit owner — Claude Code's session file isn't OpenBrain.
- Subscription auth being sticky to a host user account is the actual justification for "host-native daemon vs containerized" — worth stating.
- Antigravity headless mode: unknown whether it has a `--print` equivalent. If it doesn't, you may end up needing pty *just for Antigravity*, in which case the simple-Claude / complex-Antigravity asymmetry should be a deliberate design call.

### User decisions captured

| Question | Answer |
|---|---|
| Chat continuity model | **Multiple named threads** |
| Tool scope | **No code editing; document/report writing OK** |
| OpenBrain capture | **Yes, every turn** |

---

## Revised Architecture

```
Telegram → Zella → Hermes plugin (chat_with_cli)
  ↓ HTTP w/ shared-secret auth
Host-Ops daemon (Node, runs as hermes user on VM)
  ├─ thread registry: thread_name → {cli, session_uuid}
  ├─ spawns: claude --print --resume <uuid> --add-dir <workspace> --allowed-tools <list> "<msg>"
  ├─ captures (thread, prompt, response) → async POST → OpenBrain
  └─ returns response
```

The daemon is justified (not just "could be a forced-command SSH") because three things converge on it: per-thread session registry, OpenBrain capture, and (eventually) routing across multiple CLIs.

### Concrete design decisions the plan now needs

**Thread model.** Map each named thread to a Claude Code `--session-id` UUID. Persist `thread_name → session_uuid` in a small JSON or sqlite file under `/home/hermes/.zella/`. Plugin tool surface:
- `chat_with_cli(cli, thread, message)` — auto-creates thread if new
- `list_threads(cli)`
- `archive_thread(name)`

**Permission posture for "docs but no code."** `--permission-mode plan` blocks writes entirely; `acceptEdits` is too loose. The right combo:
- Working dir: `/home/hermes/zella-workspace/` (drafts, reports, notes) via `--add-dir`. **Do not** add the actual repo.
- Tool allowlist: `Read,Write,Edit,Glob,Grep` — omit `Bash` (or whitelist only safe forms).
- `--permission-mode acceptEdits` so it doesn't hang on the allowlisted writes.

Result: Claude can draft docs in its sandbox dir, but can't touch `z-brain/` source or shell out.

**OpenBrain capture.** Owner = the daemon (it sees the full turn cleanly). Async, fire-and-forget with a retry queue — don't block the chat reply on OpenBrain latency. Each record: `{thread, cli, session_uuid, prompt, response, ts, domain?}`. This closes the gap flagged in [memory/project_hermes_api_session_isolation.md](/Users/YOUR_USER/.claude/projects/-Volumes-nvme-2tb-ant-workspace-z-brain/memory/project_hermes_api_session_isolation.md).

### Still-open questions worth resolving before building

1. **Artifact retrieval UX.** Claude writes `report.md` into the workspace dir on the VM. How do you read it from Telegram? Three viable answers:
   - Daemon detects new files in the workspace and includes a "files written this turn: …" footer in the response. Plus a `fetch_artifact(thread, filename)` plugin tool that returns the content.
   - Captured response to OpenBrain *includes* file contents inline.
   - Workspace dir is synced to a the operator-readable path.

   Pick one — otherwise reports go into a black box.

2. **Antigravity headless mode.** Does the Antigravity CLI have a `--print`-equivalent for one-shot prompts with session resume? Unknown, and the plan symmetry assumes it does. If it doesn't, pty will be needed *for Antigravity only*, which is a meaningful asymmetry to call out. Worth a 10-min spike before committing.

3. **Thread-name collisions across CLIs.** Is `"zbrain-v2-design"` one thread shared across Claude + Antigravity, or namespaced per CLI? Cleaner to namespace per CLI (a Claude thread and an Antigravity thread are different agents and the conversation states aren't interchangeable).

### What's still load-bearing from the first review

- **Auth on the HTTP endpoint** (shared-secret header, bind to private net).
- **systemd unit + logs** for the daemon — once Telegram chat depends on it, "lightweight" doesn't mean "informal."
- **State the host-native justification explicitly:** the CLIs' subscription OAuth is sticky to a user account on the host, which is why this one piece lives outside the container. Closes the loop with the prior brainstorm.
- **Cost claim wording:** the *task* runs on subscription; the routing turn through Hermes still spends OpenRouter tokens. Say this precisely.

---

## Recommendation

Approve the direction, with the plan re-written around these specifics:

- `claude --print --resume` as the primitive (not node-pty)
- Named threads with a JSON/sqlite registry
- Sandbox workspace dir + tool allowlist for the "docs not code" posture
- Async OpenBrain capture
- HTTP auth + systemd
- Open-question section listing artifact UX and Antigravity headless mode

### Next steps (pick one)

1. Draft the revised implementation plan document.
2. Spike the Antigravity headless mode question first to lock in symmetric vs asymmetric architecture.
3. Build a minimal `claude --print` PoC under the `hermes` user to validate the subscription-auth + session-resume path before designing the daemon.
