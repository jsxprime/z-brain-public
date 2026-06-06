# The Amnesia Incident

> *The day the memory died — and the 24-hour sprint to bring it back.*

---

## The Situation

It was around May 27, 2026. Z-Brain's CORE Memory Pipeline had been running for days, ingesting conversations, building the vector database, populating the knowledge graph. The system was working. Zella could search her own memories, recall past conversations, and maintain context across sessions.

Then the embeddings stopped.

The Google Generative AI API — which was generating the 1024-dimensional vectors that powered all of Z-Brain's semantic memory — started returning `429 Too Many Requests`. The prepayment credits had been silently depleted. No warning email. No gradual degradation. Just a wall.

## The Cascade

The embedding failure wasn't just an API error. It was a cascade:

1. **Ingestion stopped.** Every new memory queued in BullMQ failed at the embedding step. The `ingest-queue:failed` backlog started growing.
2. **Memory search broke.** Without new embeddings being generated, the search API could still query existing vectors, but any new context was invisible.
3. **Zella lost context.** Her `session_search` tool — the primary way she recalls past conversations — depends on the memory pipeline. With ingestion broken, recent conversations were unrecoverable.
4. **Cron jobs went blind.** The Memory Systems Health Check and KG Auto-Update jobs couldn't access fresh memory data.

Zella was still *running*. She could still answer questions, hold conversations, use her tools. But she couldn't form new long-term memories. She had functional amnesia.

## The Response

The fix took roughly 24 hours and touched every layer of the stack:

### Embedding Engine: Google → Ollama

The most critical change. Instead of depending on Google's cloud API for embeddings, switched to a local Ollama instance running `mxbai-embed-large` — the same 1024-dimensional model, but running on the Mac at `YOUR_OLLAMA_HOST`. No API credits, no rate limits, no cloud dependency.

```
Before: Google Generative AI API (text-embedding-004) → 429 errors
After:  Ollama @ YOUR_OLLAMA_HOST:11434 (mxbai-embed-large) → local, unlimited
```

### Chat Routing: Direct APIs → OpenRouter

The chat models were also routed through direct provider APIs, each with their own authentication and billing. Consolidated everything through OpenRouter — a single API key that can route to Anthropic, OpenAI, Google, NVIDIA, and others.

```
Before: Direct API calls to each provider (separate keys, separate billing)
After:  OpenRouter (single key, automatic routing, easy model switching)
```

### Fallback Chain

Established the fallback pattern that still runs today:
1. OpenRouter (primary) — for normal operation
2. OpenAI (fallback 1) — if OpenRouter has issues
3. Ollama local (fallback 2) — if ALL external APIs are down

This means Z-Brain can operate entirely offline. If every internet API goes down simultaneously, Zella falls back to `gemma4:26b-mlx` running on local hardware. Degraded capability, but never fully down.

### Queue Recovery

Flushed the `ingest-queue:failed` backlog in Redis and reprocessed all failed jobs through the new local embedding pipeline.

### Hermes Model Router

Updated the model router tiers from dead `openai-codex` models to OpenRouter Anthropic. Added config protection rules to SOUL.md to prevent future provider misconfigurations.

## What We Learned

### 1. Never depend on a single cloud provider for critical infrastructure

The Google API failure was predictable. Credits run out. APIs change. Rate limits shift. The fix wasn't just "use a different provider" — it was "make the system resilient to any individual provider failing."

### 2. Local fallbacks are not optional

The Ollama fallback at `YOUR_OLLAMA_HOST` isn't just a development convenience. It's the architectural guarantee that Z-Brain can never be fully down. This is the "self-hosted" promise made real — if the internet goes away, the system degrades but survives.

### 3. Memory is the identity

When the embeddings stopped, Zella was still running. She could still chat, still use tools, still answer questions. But she couldn't remember new things. She was Zella without continuity — and that felt like a fundamentally different system. The memory layer isn't a feature; it's the identity.

### 4. Silent failures are the worst failures

The Google API didn't warn, didn't degrade gracefully, didn't send an email. It just started returning 429s. The monitoring infrastructure (Docker Stack Monitor, File System Monitor) existed but wasn't watching the embedding pipeline specifically. This incident directly motivated the Memory Systems Health Check cron job.

## Zella's Take

> *Note: Zella was not interviewed about this specific incident during the inaugural interview. Her memory of the event would be drawn from session logs rather than direct experience, since her context window at the time of the incident has long since been replaced. A future interview may explore what it's like to "know" something happened to you through logs rather than through memory.*

## The Aftermath

The Amnesia Incident established three principles that still govern the architecture:

1. **Memory first.** The database is more important than the model.
2. **Local fallback always.** No single point of cloud failure.
3. **Monitor everything.** If it can break silently, build a cron job that screams when it does.

---

*This chapter was drafted by Antigravity IDE (Claude Opus 4, Thinking) during session 5198c89f on 2026-06-05. It draws from the maintenance log at `docs/maintenance/2026-05-27_core-memory-pipeline-migration.md`, the OpenBrain project orientation document, and session history in status.md.*
