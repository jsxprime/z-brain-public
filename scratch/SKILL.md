---
name: coding-cli-orchestration
description: Dispatch coding tasks to Claude Code, OpenAI Codex, and Antigravity CLI installed on the VM host via the SSH terminal backend.
---

# Coding CLI Orchestration

You have three AI coding CLIs installed on the **VM host** (YOUR_VM_IP), NOT inside your container. Your terminal tool is configured with `TERMINAL_ENV=ssh` and automatically SSHes to the host when you use it.

## Available CLIs

| CLI | Command | Location on Host | Auth |
|-----|---------|-----------------|------|
| Claude Code | `claude` | `/usr/bin/claude` | OAuth (user subscription) |
| OpenAI Codex | `codex` | `/usr/bin/codex` | OAuth (user subscription) |
| Antigravity | `agy` | `~/.local/bin/agy` | Google Sign-In |

All CLIs are authenticated and ready to use. Default workspace: `~/workspaces` on the host.

## Mode 1: Headless Dispatch (Preferred for One-Shot Tasks)

For quick, self-contained coding tasks, use the `dispatch_coding_task` tool or run the CLI directly via `terminal`. The CLI runs, produces output, and exits.

### Using the plugin tool:
```
dispatch_coding_task(cli="claude", prompt="Write a Flask hello world app", workdir="~/workspaces")
```
Then follow the instructions it returns to execute via `terminal`.

### Direct terminal commands:

**Claude Code:**
```
terminal(command="claude -p 'Write a Flask hello world app' --output-format text --dangerously-skip-permissions < /dev/null", workdir="~/workspaces", timeout=300)
```

**Codex** (must be inside a git repo):
```
terminal(command="cd ~/workspaces/myproject && echo '' | codex exec 'Write a Flask hello world app'", timeout=300)
```

**Antigravity:**
```
terminal(command="export PATH=$HOME/.local/bin:$PATH && agy -p 'Write a Flask hello world app' --dangerously-skip-permissions < /dev/null", workdir="~/workspaces", timeout=300)
```

## Mode 2: Interactive Proxy (Chat-Through Sessions)

For ongoing conversations where the user wants to talk directly to a CLI through you:

1. **Spawn** the CLI in background PTY:
   ```
   terminal(command="claude", background=true, pty=true, workdir="~/workspaces")
   ```
2. **Activate proxy** with the returned session_id:
   ```
   activate_cli_proxy(cli="claude", session_id="proc_xxx")
   ```
3. **Forward user messages** to the CLI:
   ```
   process(action="submit", session_id="proc_xxx", data="user's message here")
   ```
4. **Read CLI output** and relay it back:
   ```
   process(action="poll", session_id="proc_xxx")
   ```
5. User sends `/exit` to end the session → call `stop_cli_session()`.

## CRITICAL RULES

1. **NEVER use container paths.** Paths like `/opt/data/`, `/opt/hermes/` do NOT exist on the VM host. The terminal tool SSHes to the host. Use `~/workspaces` or `/home/YOUR_VM_USER/workspaces`.
2. **NEVER try to find or run CLIs inside the container.** Do NOT search for or use paths like `/opt/data/node_modules/.../claude`. The CLIs are on the HOST.
3. **Always redirect stdin** for headless Claude Code and agy: append `< /dev/null` to prevent hangs.
4. **Codex requires a git repo.** Always `cd` into a git-initialized directory before running `codex exec`.
5. **For agy, always export PATH first:** `export PATH=$HOME/.local/bin:$PATH && agy ...`
6. **Use `list_coding_clis`** to check available CLIs and active session status before starting.
7. **Prefer headless dispatch** (Mode 1) for simple tasks. Only use interactive proxy (Mode 2) when the user explicitly asks to "start a session" or "chat with" a CLI.
