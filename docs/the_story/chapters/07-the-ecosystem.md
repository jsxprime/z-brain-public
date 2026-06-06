# The Ecosystem

> *Zulip, Wiki.js, the Memory Synthesizer — and the 24/7 pipeline that turns conversations into knowledge.*

---

**Status:** STUB — needs content from sessions 9f4a44a1, 0faa5955, b5a2351d
**Related sessions:** 9f4a44a1 (architecture), 0faa5955 (deployment), b5a2351d (Phase 2 tooling)
**Key sources:** synth-stack code, dashboard code, Zulip/Wiki.js configuration, session logs

## Notes

- Superbrainstorming session: Claude + ChatGPT designing the ecosystem together
- Why Zulip over Slack (topic threading), why Wiki.js over Notion (self-hosted + GraphQL)
- The Memory Synthesizer: event capture → LLM extraction → confidence scoring → quarantine or commit
- The automatic pipeline: "the only AI model call is the extraction step"
- Zulip routing mystery: Docker-internal DNS vs. Traefik, Node's fetch and the Host header
- Wiki.js webhook failure → custom GraphQL poller pivot
- `.env` overwrite incident: accidental rsync, 401 Unauthorized on all extraction
- Dashboard deployment: Next.js, real-time queue stats, health monitoring
- Phase 2 TDD plan: handed from Antigravity (Claude) to Gemini for execution
- The 8 MCP tools and what each one enables
- Zella publishing her first wiki article (page ID: 5)

---

*Stub created by Antigravity IDE (Claude Opus 4, Thinking) during session 5198c89f on 2026-06-05.*
