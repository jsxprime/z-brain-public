# Foundation — Choosing the Stack

> *Why Postgres over Pinecone, why Hermes over LangChain, and why self-hosted over everything.*

---

**Status:** STUB — needs content from early session logs and interviews
**Related sessions:** Early sessions (pre-9f4a44a1), code review (2026-05-26)
**Key sources:** `docs/foundational_stack.md`, `docs/code-review-2026-05-26.md`, OpenBrain orientation document

## Notes

- Tech stack decisions: Postgres+pgvector (vs. Pinecone/Weaviate), Neo4j (vs. just pgvector), Redis+BullMQ (vs. other queues), Node.js+Express (vs. Python)
- Hermes Agent selection: open source, self-hostable, MCP-native, multi-platform
- The "platform over scratch" principle from Slopthing applied here
- Why NOT LangChain/LlamaIndex/AutoGen — what was wrong with the framework approach
- The homelab decision: personal hardware, no cloud, full ownership

---

*Stub created by Antigravity IDE (Claude Opus 4, Thinking) during session 5198c89f on 2026-06-05.*
