# Building the Nervous System

> *Standing up the CORE pipeline — Postgres, pgvector, Neo4j, Redis, and OpenBrain.*

---

**Status:** STUB — needs content from early deployment sessions
**Related sessions:** Early sessions, session 0faa5955
**Key sources:** CORE stack docker-compose, OpenBrain server code, memory pipeline architecture

## Notes

- CORE stack deployment: 5 containers (core-app, core-postgres, core-redis, core-neo4j, openbrain-server)
- Vector dimensions: 1024 (matching mxbai-embed-large and text-embedding-004)
- BullMQ queue design: ingest-queue, failed queue, retry logic
- OpenBrain as the API layer: why a separate search server over the raw database
- Neo4j knowledge graph: entities, relationships, temporal metadata (planned)
- The "memory is identity" principle in practice

---

*Stub created by Antigravity IDE (Claude Opus 4, Thinking) during session 5198c89f on 2026-06-05.*
