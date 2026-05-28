"""
Zella CLI Chat Plugin — Hermes Agent native plugin

Routes chat messages from Zella to subscription-based coding CLIs
via the Host-Ops daemon running on the Z-Brain VM.

Per-CLI tools (simpler for Zella):
  - ask_claude:       Chat with Claude Code (Anthropic)
  - ask_codex:        Chat with Codex (OpenAI)
  - ask_antigravity:  Chat with Antigravity (Google)

Shared utilities:
  - list_threads:     List active threads for a CLI
  - archive_thread:   Archive a thread
  - fetch_artifact:   Retrieve a file from the CLI workspace
"""

import os
import json
import urllib.request
import urllib.error

# Host-Ops daemon connection settings
HOST_OPS_URL = os.environ.get("HOST_OPS_URL", "http://YOUR_VM_IP:8650")
HOST_OPS_SECRET = os.environ.get("HOST_OPS_SECRET", "YOUR_HOST_OPS_SECRET")


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

def _make_request(method, path, data=None):
    """Make an authenticated HTTP request to the Host-Ops daemon."""
    url = f"{HOST_OPS_URL}{path}"
    headers = {
        "Content-Type": "application/json",
        "X-Host-Ops-Secret": HOST_OPS_SECRET,
    }

    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        try:
            error_data = json.loads(error_body)
            return {"error": error_data.get("error", f"HTTP {e.code}: {error_body}")}
        except json.JSONDecodeError:
            return {"error": f"HTTP {e.code}: {error_body}"}
    except urllib.error.URLError as e:
        return {"error": f"Connection failed: {str(e.reason)}"}
    except Exception as e:
        return {"error": f"Request failed: {str(e)}"}


# ---------------------------------------------------------------------------
# Core chat handler (shared logic)
# ---------------------------------------------------------------------------

def _chat_with_cli(cli, args, **kwargs):
    """Shared implementation for all per-CLI chat tools."""
    thread = args.get("thread", "default")
    message = args.get("message", "")

    if not message:
        return "❌ Missing required parameter: message"

    result = _make_request("POST", "/cli/chat", {
        "cli": cli,
        "thread": thread,
        "message": message,
    })

    if "error" in result:
        return f"❌ Error from {cli}: {result['error']}"

    response = result.get("response", "")
    files = result.get("files_written", [])

    output = response
    if files:
        output += f"\n\n📄 Files written: {', '.join(files)}"
        output += "\nUse `fetch_artifact` to read their contents."

    return output


# ---------------------------------------------------------------------------
# Per-CLI chat tools
# ---------------------------------------------------------------------------

def ask_claude(args, **kwargs):
    """Send a message to Claude Code (Anthropic) via your subscription."""
    return _chat_with_cli("claude", args, **kwargs)


def ask_codex(args, **kwargs):
    """Send a message to Codex (OpenAI) via your subscription."""
    return _chat_with_cli("codex", args, **kwargs)


def ask_antigravity(args, **kwargs):
    """Send a message to Antigravity (Google) via your subscription."""
    return _chat_with_cli("antigravity", args, **kwargs)


# ---------------------------------------------------------------------------
# Shared utility tools
# ---------------------------------------------------------------------------

def list_threads(args, **kwargs):
    """List active conversation threads for a CLI."""
    cli = args.get("cli", "claude")

    result = _make_request("GET", f"/cli/threads?cli={cli}")

    if "error" in result:
        return f"❌ Error: {result['error']}"

    threads = result.get("threads", [])
    if not threads:
        return f"No active threads for {cli}."

    lines = [f"Active threads for **{cli}**:"]
    for t in threads:
        lines.append(
            f"  • **{t['name']}** — {t['turn_count']} turns, "
            f"last active {t['updated_at']}"
        )
    return "\n".join(lines)


def archive_thread(args, **kwargs):
    """Archive a conversation thread."""
    cli = args.get("cli", "claude")
    thread = args.get("thread", "")

    if not thread:
        return "❌ Missing required parameter: thread"

    result = _make_request("POST", "/cli/threads/archive", {
        "cli": cli,
        "thread": thread,
    })

    if "error" in result:
        return f"❌ Error: {result['error']}"

    return f"✅ Thread **{thread}** ({cli}) has been archived."


def fetch_artifact(args, **kwargs):
    """Retrieve the contents of a file written by a CLI."""
    filename = args.get("filename", "")

    if not filename:
        return "❌ Missing required parameter: filename"

    result = _make_request("GET", f"/cli/artifact?filename={filename}")

    if "error" in result:
        return f"❌ Error: {result['error']}"

    content = result.get("content", "")
    return f"📄 **{filename}**\n\n{content}"


# ---------------------------------------------------------------------------
# Shared schema fragments
# ---------------------------------------------------------------------------

_CHAT_PARAMS = {
    "type": "object",
    "properties": {
        "thread": {
            "type": "string",
            "description": (
                "A friendly name for the conversation thread "
                "(e.g., 'zbrain-design', 'code-review'). "
                "Auto-created if new."
            )
        },
        "message": {
            "type": "string",
            "description": "The message to send."
        }
    },
    "required": ["thread", "message"]
}


# ---------------------------------------------------------------------------
# Per-CLI tool schemas
# ---------------------------------------------------------------------------

ASK_CLAUDE_SCHEMA = {
    "name": "ask_claude",
    "description": (
        "Send a message to Claude Code (Anthropic, Claude Sonnet 4.6). "
        "Uses your flat-rate subscription — no API token costs. "
        "Best for: code generation, analysis, refactoring, and debugging."
    ),
    "parameters": _CHAT_PARAMS,
}

ASK_CODEX_SCHEMA = {
    "name": "ask_codex",
    "description": (
        "Send a message to Codex (OpenAI, GPT-5). "
        "Uses your flat-rate subscription — no API token costs. "
        "Best for: code execution, shell commands, and rapid prototyping."
    ),
    "parameters": _CHAT_PARAMS,
}

ASK_ANTIGRAVITY_SCHEMA = {
    "name": "ask_antigravity",
    "description": (
        "Send a message to Antigravity (Google, Gemini). "
        "Uses your flat-rate subscription — no API token costs. "
        "Best for: research, documentation, and multi-modal tasks."
    ),
    "parameters": _CHAT_PARAMS,
}


# ---------------------------------------------------------------------------
# Shared utility schemas
# ---------------------------------------------------------------------------

LIST_THREADS_SCHEMA = {
    "name": "list_threads",
    "description": "List active conversation threads for a coding CLI.",
    "parameters": {
        "type": "object",
        "properties": {
            "cli": {
                "type": "string",
                "enum": ["claude", "codex", "antigravity"],
                "description": "Which CLI to list threads for."
            }
        },
        "required": ["cli"]
    }
}

ARCHIVE_THREAD_SCHEMA = {
    "name": "archive_thread",
    "description": "Archive a conversation thread so it no longer appears in listings.",
    "parameters": {
        "type": "object",
        "properties": {
            "cli": {
                "type": "string",
                "enum": ["claude", "codex", "antigravity"],
                "description": "Which CLI the thread belongs to."
            },
            "thread": {
                "type": "string",
                "description": "The thread name to archive."
            }
        },
        "required": ["cli", "thread"]
    }
}

FETCH_ARTIFACT_SCHEMA = {
    "name": "fetch_artifact",
    "description": (
        "Retrieve the contents of a file written by a coding CLI "
        "during a conversation. Use after a CLI reports 'Files written this turn'."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "filename": {
                "type": "string",
                "description": "The filename to retrieve from the workspace."
            }
        },
        "required": ["filename"]
    }
}


# ---------------------------------------------------------------------------
# Plugin registration
# ---------------------------------------------------------------------------

def register(ctx):
    """Hermes Agent native plugin registration hook."""
    # Per-CLI chat tools — simple, direct, no enum needed
    ctx.register_tool(
        name="ask_claude",
        toolset="cli_chat",
        schema=ASK_CLAUDE_SCHEMA,
        handler=ask_claude,
        emoji="🟠",
    )
    ctx.register_tool(
        name="ask_codex",
        toolset="cli_chat",
        schema=ASK_CODEX_SCHEMA,
        handler=ask_codex,
        emoji="🟢",
    )
    ctx.register_tool(
        name="ask_antigravity",
        toolset="cli_chat",
        schema=ASK_ANTIGRAVITY_SCHEMA,
        handler=ask_antigravity,
        emoji="🔵",
    )

    # Shared utilities
    ctx.register_tool(
        name="list_threads",
        toolset="cli_chat",
        schema=LIST_THREADS_SCHEMA,
        handler=list_threads,
    )
    ctx.register_tool(
        name="archive_thread",
        toolset="cli_chat",
        schema=ARCHIVE_THREAD_SCHEMA,
        handler=archive_thread,
    )
    ctx.register_tool(
        name="fetch_artifact",
        toolset="cli_chat",
        schema=FETCH_ARTIFACT_SCHEMA,
        handler=fetch_artifact,
    )
