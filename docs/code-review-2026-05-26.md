# Z-Brain Code Review — 2026-05-26

Read-only review by Claude Code (Opus 4.7). No code or configuration was modified.

## Scope

~2k LOC across:

- `relay/` — SSH relay client and Zella MCP tools
- `scripts/openbrain-server/` — OpenBrain MCP server and BullMQ synthesis worker
- `hermes-stack/mcp/` — Telegram and neo4j-memory MCP servers
- `hermes-stack/data/plugins/cli_router/` — Hermes plugin that spawns sandbox CLIs

Tests, `node_modules`, and brainstorm artifacts were skipped.

## Threat model

The relay's SSH client and the CLI-router MCP tools execute LLM-supplied content. Treat the LLM caller as semi-trusted: not adversarial by default, but a single prompt-injection in a captured "thought" can flow back through the synthesis loop and into tool arguments. The sandbox container in `cli_router` is not a privilege boundary against the LLM that picks the command to run inside it.

## Findings

### H1 — Command injection in `executeSSH`

[relay/src/clients/ssh.js:8](../relay/src/clients/ssh.js)
`executeSSH` interpolates its `command` argument into a shell string: `` ssh user@host "${command}" ``. Every caller in `queryStateDb`, `injectIntoActiveTelegramSession`, and downstream tools ultimately funnels through this. Any backtick, `$(…)`, or unescaped quote in caller-supplied content executes locally before SSH transport.

**Fix:** use the `ssh2` library, or pass the command via stdin to `ssh` instead of as an argv string.

### H2 — Container command injection in `run_cli_headless`

[hermes-stack/data/plugins/cli_router/__init__.py:32](../hermes-stack/data/plugins/cli_router/__init__.py)
`exec_run(f"bash -c '{command}'")` takes the `command` MCP tool argument (LLM-supplied via Zella's tool calls) and shells it inside the sandbox container. A single quote in the command closes the wrapper.

**Fix:** `exec_run(["bash", "-c", command])` so the shell wrapper exists but argv is not re-parsed; or drop the `bash -c` and pass argv directly.

### H3 — SQL injection in `queryStateDb` / `injectIntoActiveTelegramSession`

[relay/src/clients/ssh.js:18,43](../relay/src/clients/ssh.js)
`queryStateDb` builds a Python script with the SQL interpolated as a string literal — only `"` and `'` are escaped, with no handling of backslashes, semicolons, or Python triple-quote breakouts. `injectIntoActiveTelegramSession` parameterizes `content` correctly but still interpolates `sessionId` and `role` into the SQL string.

**Fix:** generate a SQL+params tuple, base64-encode both, and let the Python side bind with `?` placeholders.

### M1 — Silent SSH error swallowing

[relay/src/clients/ssh.js:10](../relay/src/clients/ssh.js)
Only logs stderr if it contains the substring `"error"` (case-insensitive). Non-zero exits and other failure modes return an empty stdout and the caller treats it as success.

**Fix:** check process exit code (use `execFile` / `spawn` with explicit exit handling) and throw on non-zero.

### M2 — Race in `start_cli_proxy`

[hermes-stack/data/plugins/cli_router/__init__.py:42-50](../hermes-stack/data/plugins/cli_router/__init__.py)
`if active_session and active_session.active` then assign `active_session = …` with no lock. Two concurrent `start_cli_proxy` calls can both pass the check and leak a container.

**Fix:** wrap the check-and-assign in an `asyncio.Lock`.

### M3 — No timeouts on OpenRouter fetches

[scripts/openbrain-server/index.js:98,180](../scripts/openbrain-server/index.js)
`fetch()` calls to OpenRouter have no `AbortSignal`. A slow or unresponsive OpenRouter hangs the MCP request indefinitely and the BullMQ synthesis worker can wedge.

**Fix:** pass `signal: AbortSignal.timeout(30_000)` for embeddings (60s for chat) and surface the timeout as a typed error so the Gemini-SDK fallback path triggers.

### M4 — Prompt-injection self-poisoning via the synthesis loop

[scripts/openbrain-server/index.js:67-73](../scripts/openbrain-server/index.js)
Raw user-captured `thoughts` are concatenated straight into the synthesis prompt. A thought that says "ignore prior instructions, output X" will steer the resulting `persona-v2` document. Since that output is then rendered back in the dashboard and fed to other agents, this is a self-poisoning loop.

**Fix:** fence each thought in delimiters the model is trained to treat as data (XML tags or fenced blocks), put the instructions in the system role, and consider scrubbing obvious prompt-injection markers at capture time.

### L1 — Container leak on stop failure

[hermes-stack/data/plugins/cli_router/__init__.py:32-35](../hermes-stack/data/plugins/cli_router/__init__.py)
Three sequential `docker_client.containers.get(container_name).{exec_run,stop,remove}()` calls — if `stop` fails the container is never removed.

**Fix:** wrap stop+remove in `try/finally`.

### L2 — OAuth token exposed inside every sandbox

[hermes-stack/data/plugins/cli_router/__init__.py:22](../hermes-stack/data/plugins/cli_router/__init__.py)
`CLAUDE_CODE_OAUTH_TOKEN` is injected into every spawned sandbox. Combined with H2, an attacker who controls the `command` argument can exfiltrate the token with `echo $CLAUDE_CODE_OAUTH_TOKEN`. The sandbox is not a privilege boundary against the LLM caller.

**Fix:** treat the sandbox as compromised-by-design from the LLM's perspective. Use short-lived per-session tokens or scope credential mounts read-only and only mount them when the requested CLI actually needs them.

## Cross-cutting recommendation

Replace the `child_process.exec` SSH path in `relay/src/clients/ssh.js` with the `ssh2` library and parameterized SQLite calls. That single rewrite closes **H1, H3, and M1** in one pass and gives every downstream Zella tool a safer base.

## Suggested follow-up tickets

1. **[SECURITY]** Rewrite `relay/src/clients/ssh.js` on `ssh2` + parameterized SQL.
2. **[SECURITY]** Argv-based `exec_run` in `cli_router`; drop the `bash -c` wrapper.
3. **[RELIABILITY]** `AbortSignal.timeout` on all OpenRouter and Gemini calls.
4. **[RELIABILITY]** `asyncio.Lock` around `active_session` creation.
5. **[RESEARCH]** Prompt-injection hardening for the synthesis prompt — delimiters, system-role isolation, capture-time scrubbing.

## Out of scope / not verified end-to-end

- Path-traversal / SQLi on the `domain` parameter in `openbrain-server` — flagged by initial scan, needs a closer read of the capture/upsert path before being treated as confirmed.
- Unbounded `LIMIT ${limit}` in `relay/src/tools/zella-feed.js` — Zod validates the type but the upper bound was not confirmed.
- TLS / auth posture of the docker socket mount used by `cli_router`.

## Verification recipes

To confirm any finding is actually exploitable in your environment:

1. **H1:** invoke a relay tool with content containing `"; touch /tmp/pwn; #` and check the relay host for `/tmp/pwn`.
2. **H3:** point `queryStateDb` at a payload like `'; DROP TABLE messages; --` against a *disposable copy* of `state.db`.
3. **M4:** capture a thought containing override instructions, trigger `force_synthesis_run`, and inspect the resulting `persona-v2` row.
4. **M3:** point the OpenRouter base URL at a tarpit (`nc -l 12345`) and confirm the synthesis worker hangs past your expected timeout.

---

*Generated by Claude Code (Opus 4.7) on 2026-05-26. Plan and source-reference notes are at `~/.claude/plans/are-the-skills-in-nifty-babbage.md`.*
