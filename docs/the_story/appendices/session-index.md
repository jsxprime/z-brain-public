# Session Index

> Index of all development sessions with summaries, linked to relevant chapters and reference docs.

Sessions are identified by their conversation ID prefix (8 hex chars) and the primary agent used.

---

## Sessions by Date (Most Recent First)

| Session ID | Date | Agent | Summary | Related Chapters |
|---|---|---|---|---|
| `e90e6146` | 2026-06-10 | Antigravity (Gemini 2.5) | Fable 5 implementation: all 5 priority items executed (extraction prompt, Neo4j dedup, synth worker tx, crash investigation, morning brief). Plus 2 core-app bugs fixed (memory_ingest data loss, session heartbeat noise) via bind-mount patches. | Timeline: Phase 9 |
| `c0ff9750` | 2026-06-10 | Antigravity (Gemini 2.5) | Fable 5 Memory Architecture Review. Prepared 15K-token briefing, ran Claude Fable 5 read-only review. Produced 200-line report with 10 prioritized recommendations. Created 5-item implementation plan. | Timeline: Phase 9 |
| `73e58237` | 2026-06-09 | Antigravity (Gemini 3.1) | Timezone shifted to EDT. Neo4j duplicate relation bug fixed. Episodic ingestion stall investigated. Recovered from accidental compose overwrite (permission denied). | Timeline: Phase 8 |
| `8c02e948` | 2026-06-08 | Antigravity (Gemini 2.5) | Hermes s6-overlay restore (upstream design). Z-Brain memory pipeline repair — 712 embeddings backfilled (Matryoshka 1024→768). Cross-model review (GPT-5.5 via Codex). | Timeline: Phase 8 |
| `5198c89f` | 2026-06-05 | Antigravity (Opus Thinking) | Z-Brain Chronicle documentation project launched. Design spec, directory structure, initial content created. Zella inaugural interview conducted. | [Preface](../chapters/00-preface.md) |
| `7f254e83` | 2026-06-05 | Antigravity | Hermes Desktop remote access deployment. Upgraded Hermes to v0.16.0. Desktop connected via `zella.zb.example.com`. | [Ch. 12](../chapters/12-hermes-desktop.md) |
| `7f2001ab` | 2026-06-05 | Antigravity | Cron MCP Toolset root-cause investigation. Read Hermes source code AND asked Zella for her account. Fixed `enabled_toolsets` whitelist. | [Ch. 8](../chapters/08-the-gateway-boot-paradox.md) |
| `cc5ffd84` | 2026-06-04 | Antigravity | Public repository creation. Git history scrubbed (4 passes). Sync script created. | [Ch. 11](../chapters/11-building-in-public.md) |
| `05c2bb51` | ~2026-06-03 | Antigravity | Strategic brainstorm. Three Brains analysis (Chris Lema). Nate B. Jones mapping. "Real Work" gap identified. Content project flagged. | [Ch. 10](../chapters/10-three-brains.md) |
| `1a6a81be` | ~2026-06-03 | Antigravity | Ops hardening. synth-mcp triple bug fix. SOUL.md Execution Context. Docker image pinning. Wiki.js article published by Zella. | Timeline: Phase 4 |
| `e03cd5be` | ~2026-06-02 | Antigravity | synth-mcp resolution. 10-point instrumentation. Cross-model critique workflow. Critical rule: never modify `/opt/hermes/`. | [Ch. 9](../chapters/09-cross-model-critique.md) |
| `05f5df02` | ~2026-06-01 | Antigravity | Hermes v0.14.0→v0.15.1 upgrade. CORE v0.7.13→v0.7.14. Cross-model plan review (Codex + Claude). MCP mount fix. Backup suite. | Timeline: Phase 4 |
| `4e3a9fc4` | ~2026-05-31 | Antigravity | Cron job fix. Root-caused all 4 jobs. Nemotron model stall discovered. | [Ch. 8](../chapters/08-the-gateway-boot-paradox.md) |
| `e6afc740` | ~2026-05-30 | Antigravity | Zella bug fixes. Wiki.js tool bypass. Context compression. `HERMES_HOME` fix. Terminal backend → `local`. TUI ghost connection. | [Ch. 6](../chapters/06-teaching-zella-where-she-lives.md) |
| `b5a2351d` | ~2026-05-29 | Antigravity + Gemini | Phase 2 Agent Tooling. MCP tools TDD plan. Zulip routing mystery. SOUL.md ecosystem tools. 48 commits pushed. | [Ch. 7](../chapters/07-the-ecosystem.md) |
| `0faa5955` | ~2026-05-28 | Antigravity | Ecosystem deployment. Dashboard, Wiki.js poller, CLI proxy. `.env` overwrite incident. | [Ch. 7](../chapters/07-the-ecosystem.md) |
| `9f4a44a1` | ~2026-05-27 | Antigravity | Architecture & planning. Superbrainstorming (Claude + ChatGPT). Ecosystem design. Phase 1A/1B/deployment plans. | [Ch. 7](../chapters/07-the-ecosystem.md) |
| — | ~2026-05-27 | — | **The Amnesia Incident.** Google API credits depleted. 24-hour migration. | [Ch. 3](../chapters/03-the-amnesia-incident.md) |
| — | 2026-05-26 | Claude Code | Read-only codebase review. | Timeline: Phase 1 |

---

## Sessions by Agent

### Antigravity IDE (Primary)
Most deep-work sessions use Antigravity as the primary agent, with Claude Opus 4.x (various subversions) as the model.

### Gemini CLI
Used for executing detailed implementation plans (Phase 1A Synthesizer, Phase 1B Dashboard, Phase 2 Agent Tooling). Receives plans from Antigravity sessions.

### Claude Code
Used for cross-model critique and independent code review.

### Codex CLI
Used for independent plan review alongside Claude. Authenticated via ChatGPT consumer account.

---

*This index is a living document, updated at each session teardown.*
