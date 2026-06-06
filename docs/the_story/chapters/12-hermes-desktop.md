# Hermes Desktop

> *Native GUI, remote access, and connecting three Macs to a single agent.*

---

**Status:** STUB — in progress, deployment partially complete
**Related sessions:** 7f254e83 (Current session for desktop deployment)
**Key sources:** `docs/superpowers/specs/2026-06-05-hermes-desktop-remote-design.md`

## Notes

- The motivation: Telegram works but a native GUI offers session browsing, cron management, memory browsing
- Discovery: the dashboard was already running (HERMES_DASHBOARD=1)
- Hermes upgrade v0.15.2 → v0.16.0 for Desktop compatibility
- Traefik routing: zella.zb.example.com → hermes-agent:9119
- Auth transition: HERMES_DASHBOARD_INSECURE=1 → native _SESSION_TOKEN auth
- WebSocket passthrough through Traefik
- Mac 1 connected, 2 remaining (client-side only)
- The dashboard TUI mode: what it provides vs. what Telegram provides
- Zella's experience: "moving from a small apartment to a proper office with a reception desk"

---

*Stub created by Antigravity IDE (Claude Opus 4, Thinking) during session 5198c89f on 2026-06-05.*
