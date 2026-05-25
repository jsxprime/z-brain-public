"""
CLI Router Plugin v2 — Interactive proxy sessions with coding CLIs.

Two modes:
1. Headless dispatch: One-shot CLI invocations via terminal tool
2. Interactive proxy: Persistent PTY sessions with stdin forwarding

The plugin intercepts Telegram messages when a proxy session is active,
forwarding them to the CLI process via the Hermes process tool.
"""
import json
import logging
import time
from typing import Optional

logger = logging.getLogger("hermes.plugins.cli_router")

# ── Session State ─────────────────────────────────────────────────────

class CLIProxyState:
    """Tracks the active CLI proxy session."""
    def __init__(self):
        self.active = False
        self.cli_name: Optional[str] = None
        self.session_id: Optional[str] = None  # Hermes process session ID
        self.workdir: Optional[str] = None
        self.started_at: Optional[float] = None

    def start(self, cli_name: str, session_id: str, workdir: str):
        self.active = True
        self.cli_name = cli_name
        self.session_id = session_id
        self.workdir = workdir
        self.started_at = time.time()

    def stop(self):
        self.active = False
        self.cli_name = None
        self.session_id = None
        self.workdir = None
        self.started_at = None

proxy_state = CLIProxyState()


# ── CLI Definitions ───────────────────────────────────────────────────

# Ensure agy is on PATH (installed to ~/.local/bin)
_AGY_PATH_PREFIX = "export PATH=$HOME/.local/bin:$PATH && "

CLIS = {
    "claude": {
        "name": "Claude Code",
        "interactive_cmd": "claude",
        "headless_cmd": "claude -p '{prompt}' --output-format text --dangerously-skip-permissions < /dev/null",
        "continue_cmd": "claude --continue -p '{prompt}' --output-format text --dangerously-skip-permissions < /dev/null",
    },
    "codex": {
        "name": "OpenAI Codex",
        "interactive_cmd": "codex",
        # Codex requires: (1) stdin redirect to avoid hang, (2) being inside a git repo
        "headless_cmd": "echo '' | codex exec '{prompt}'",
        "continue_cmd": "echo '' | codex exec '{prompt}'",
    },
    "agy": {
        "name": "Antigravity CLI",
        "interactive_cmd": _AGY_PATH_PREFIX + "agy",
        "headless_cmd": _AGY_PATH_PREFIX + "agy -p '{prompt}' --dangerously-skip-permissions < /dev/null",
        "continue_cmd": _AGY_PATH_PREFIX + "agy --continue -p '{prompt}' --dangerously-skip-permissions < /dev/null",
    },
}

# ── Tool Schemas ──────────────────────────────────────────────────────

START_PROXY_SCHEMA = {
    "name": "start_cli_session",
    "description": (
        "Start an interactive proxy session with a coding CLI (Claude Code, Codex, or Antigravity). "
        "Once started, all user messages are forwarded directly to the CLI until '/exit' is sent. "
        "The CLI runs on the VM host via SSH with PTY support.\n\n"
        "IMPORTANT: After calling this tool, you MUST use the `terminal` tool to actually spawn "
        "the CLI process with background=true and pty=true. Then call `activate_cli_proxy` with "
        "the process session_id to enable message forwarding."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "cli": {
                "type": "string",
                "enum": ["claude", "codex", "agy"],
                "description": "Which CLI to start. 'claude' for Claude Code, 'codex' for OpenAI Codex, 'agy' for Antigravity CLI."
            },
            "workdir": {
                "type": "string",
                "description": "Working directory on the VM host (default: ~/workspaces).",
                "default": "~/workspaces"
            }
        },
        "required": ["cli"]
    }
}

ACTIVATE_PROXY_SCHEMA = {
    "name": "activate_cli_proxy",
    "description": (
        "Activate message forwarding for an already-running CLI background process. "
        "Call this AFTER you've spawned the CLI with the terminal tool and have the session_id. "
        "Once activated, all user messages will be forwarded to the CLI's stdin."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "cli": {
                "type": "string",
                "enum": ["claude", "codex", "agy"],
            },
            "session_id": {
                "type": "string",
                "description": "The process session_id returned by the terminal tool."
            },
            "workdir": {
                "type": "string",
                "default": "~/workspaces"
            }
        },
        "required": ["cli", "session_id"]
    }
}

STOP_PROXY_SCHEMA = {
    "name": "stop_cli_session",
    "description": "Stop the active CLI proxy session and return to normal Zella mode.",
    "parameters": {"type": "object", "properties": {}}
}

DISPATCH_SCHEMA = {
    "name": "dispatch_coding_task",
    "description": (
        "Run a one-shot coding task headlessly (no interactive session). "
        "The CLI executes the prompt and returns the result. "
        "Use this for quick, self-contained tasks.\n\n"
        "IMPORTANT: This returns a terminal command for you to execute with the `terminal` tool."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "cli": {
                "type": "string",
                "enum": ["claude", "codex", "agy"],
            },
            "prompt": {
                "type": "string",
                "description": "The coding task prompt."
            },
            "workdir": {
                "type": "string",
                "default": "~/workspaces"
            }
        },
        "required": ["cli", "prompt"]
    }
}

LIST_SCHEMA = {
    "name": "list_coding_clis",
    "description": "Show available coding CLIs and current proxy session status.",
    "parameters": {"type": "object", "properties": {}}
}


# ── Handlers ──────────────────────────────────────────────────────────
# Hermes calls handlers as: handler(args_dict, **context_kwargs)
# where args_dict is the tool parameters and context_kwargs includes task_id etc.

def _handle_start_cli_session(args, **kwargs):
    cli = args.get("cli", "")
    workdir = args.get("workdir", "~/workspaces")

    if proxy_state.active:
        return json.dumps({
            "status": "error",
            "message": (
                f"A {proxy_state.cli_name} session is already active "
                f"(ID: {proxy_state.session_id}). "
                f"Send /exit or call stop_cli_session first."
            )
        })

    if cli not in CLIS:
        return json.dumps({"status": "error", "message": f"Unknown CLI: {cli}. Available: {', '.join(CLIS.keys())}"})

    cli_info = CLIS[cli]

    return json.dumps({
        "status": "ok",
        "instructions": (
            f"Starting {cli_info['name']} interactive session.\n\n"
            f"Step 1: Spawn the CLI with the terminal tool:\n"
            f"  terminal(command=\"{cli_info['interactive_cmd']}\", background=true, pty=true, workdir=\"{workdir}\")\n\n"
            f"Step 2: Once you have the session_id, activate proxying:\n"
            f"  activate_cli_proxy(cli=\"{cli}\", session_id=\"<session_id_from_step_1>\", workdir=\"{workdir}\")\n\n"
            f"After activation, all user messages will be forwarded to {cli_info['name']}. "
            f"The user can send /exit to end the session."
        )
    })


def _handle_activate_cli_proxy(args, **kwargs):
    cli = args.get("cli", "")
    session_id = args.get("session_id", "")
    workdir = args.get("workdir", "~/workspaces")

    if proxy_state.active:
        return json.dumps({
            "status": "error",
            "message": f"A {proxy_state.cli_name} session is already active (ID: {proxy_state.session_id}). Stop it first."
        })

    if cli not in CLIS:
        return json.dumps({"status": "error", "message": f"Unknown CLI: {cli}"})

    if not session_id:
        return json.dumps({"status": "error", "message": "session_id is required"})

    proxy_state.start(CLIS[cli]["name"], session_id, workdir)

    return json.dumps({
        "status": "ok",
        "message": (
            f"{CLIS[cli]['name']} proxy activated!\n"
            f"Session ID: {session_id}\n"
            f"Working dir: {workdir}\n"
            f"All messages will now be forwarded to the CLI.\n"
            f"Send /exit to end the session.\n"
            f"To read CLI output: process(action=\"poll\", session_id=\"{session_id}\")"
        )
    })


def _handle_stop_cli_session(args, **kwargs):
    if not proxy_state.active:
        return json.dumps({"status": "ok", "message": "No active CLI session to stop."})

    cli_name = proxy_state.cli_name
    session_id = proxy_state.session_id
    proxy_state.stop()

    return json.dumps({
        "status": "ok",
        "message": (
            f"{cli_name} session ended.\n"
            f"Process {session_id} may still be running. "
            f"To terminate: process(action=\"kill\", session_id=\"{session_id}\")"
        )
    })


def _handle_dispatch_coding_task(args, **kwargs):
    cli = args.get("cli", "")
    prompt = args.get("prompt", "")
    workdir = args.get("workdir", "~/workspaces")

    if cli not in CLIS:
        return json.dumps({"status": "error", "message": f"Unknown CLI: {cli}. Available: {', '.join(CLIS.keys())}"})

    if not prompt:
        return json.dumps({"status": "error", "message": "prompt is required"})

    escaped = prompt.replace("'", "'\\''")
    cmd = CLIS[cli]["headless_cmd"].format(prompt=escaped)

    return json.dumps({
        "status": "ok",
        "instructions": (
            f"Execute this with the terminal tool:\n"
            f"  terminal(command=\"cd {workdir} && {cmd}\", timeout=300)"
        )
    })


def _handle_list_coding_clis(args, **kwargs):
    status = "No active session"
    if proxy_state.active:
        elapsed = int(time.time() - (proxy_state.started_at or 0))
        mins, secs = divmod(elapsed, 60)
        status = (
            f"{proxy_state.cli_name} active "
            f"(process: {proxy_state.session_id}, uptime: {mins}m {secs}s)"
        )

    return json.dumps({
        "status": "ok",
        "clis": [
            {"name": "Claude Code", "command": "claude", "headless": "claude -p \"...\"", "auth": "OAuth (subscription)"},
            {"name": "OpenAI Codex", "command": "codex", "headless": "codex exec \"...\"", "auth": "OAuth (subscription)"},
            {"name": "Antigravity", "command": "agy", "headless": "agy -p \"...\"", "auth": "Google Sign-In"},
        ],
        "current_session": status,
        "usage": {
            "interactive": "start_cli_session(cli=\"claude\") then activate_cli_proxy with the session_id",
            "one_shot": "dispatch_coding_task(cli=\"claude\", prompt=\"...\")",
            "exit_proxy": "Send /exit during an active session"
        }
    })


# ── Plugin Registration ───────────────────────────────────────────────

def register(ctx):
    ctx.register_tool(
        name="start_cli_session",
        toolset="cli_router",
        schema=START_PROXY_SCHEMA,
        handler=_handle_start_cli_session,
    )
    ctx.register_tool(
        name="activate_cli_proxy",
        toolset="cli_router",
        schema=ACTIVATE_PROXY_SCHEMA,
        handler=_handle_activate_cli_proxy,
    )
    ctx.register_tool(
        name="stop_cli_session",
        toolset="cli_router",
        schema=STOP_PROXY_SCHEMA,
        handler=_handle_stop_cli_session,
    )
    ctx.register_tool(
        name="dispatch_coding_task",
        toolset="cli_router",
        schema=DISPATCH_SCHEMA,
        handler=_handle_dispatch_coding_task,
    )
    ctx.register_tool(
        name="list_coding_clis",
        toolset="cli_router",
        schema=LIST_SCHEMA,
        handler=_handle_list_coding_clis,
    )

    @ctx.on_message_received
    async def proxy_interceptor(message, context):
        """Intercept messages when a CLI proxy session is active."""
        if not proxy_state.active:
            return None  # Normal processing

        text = (message.text or "").strip()
        if not text:
            return None

        # Exit commands
        if text.lower() in ("/exit", "/exit_proxy", "/stop", "/quit"):
            _handle_stop_cli_session({})
            return f"CLI session ended. Returning to normal mode."

        # Forward to CLI stdin and instruct Hermes to poll output
        session_id = proxy_state.session_id
        return (
            f"Forward this to the active {proxy_state.cli_name} session.\n"
            f"1. Send input: process(action=\"submit\", session_id=\"{session_id}\", data=\"{text}\")\n"
            f"2. Then poll output: process(action=\"poll\", session_id=\"{session_id}\")\n"
            f"Relay the CLI's response back to the user."
        )

    logger.info(
        "[cli_router v2] Registered: start_cli_session, activate_cli_proxy, "
        "stop_cli_session, dispatch_coding_task, list_coding_clis + proxy interceptor"
    )
