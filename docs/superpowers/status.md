# Z-Brain Superpowers Status

> Last updated: 2026-05-27T00:25:00-04:00 (Session: 25c8d5a4)

## Current State — All Systems Operational ✅

- ✅ **CORE Memory Pipeline** — fully operational (Ollama embeddings + OpenRouter chat)
- ✅ **Hermes Agent (Zella)** — online, responding via OpenRouter `anthropic/claude-sonnet-4`
- ✅ **Memory Ingest** — MCP tool working, knowledge graph extraction verified
- ✅ **Memory Search** — vector similarity search returning results
- ✅ **No direct Google API usage** anywhere in the stack

## Provider Configuration

| Component | Provider | Model | Endpoint |
|-----------|----------|-------|----------|
| CORE Embeddings | Ollama (local) | `mxbai-embed-large` (1024-dim) | `http://YOUR_OLLAMA_HOST:11434/v1` |
| CORE Chat | OpenRouter | `anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| Hermes Primary | OpenRouter | `anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| Hermes Fallback 1 | Ollama (local) | `gemma4:26b-mlx` | `http://YOUR_OLLAMA_HOST:11434/v1` |
| Hermes Fallback 2 | Abacus | `gemini-3.5-flash` | `https://routellm.abacus.ai/v1` |

## Session Work Completed

Fixed CORE memory pipeline end-to-end. The Google API credits were fully depleted, which broke all memory operations. Migration required 5 cascading bug fixes:

1. **Config migration** — Google → Ollama (embeddings) + OpenRouter (chat)
2. **Seed deprecation race** — custom models auto-deprecated on every CORE restart
3. **Ollama URL suffix** — `/api` suffix caused 404 (AI SDK appends `/v1`)
4. **OpenRouter routing order** — Mastra router misrouted `anthropic/*` to direct Anthropic API
5. **Structured output schema** — switched to native Anthropic provider via OpenRouter for tool-use enforcement

Also fixed Hermes Agent: all model_router tiers were pointing at dead `openai-codex` models. Updated to OpenRouter Anthropic. Added config protection rules to SOUL.md.

**Detailed maintenance log**: `docs/maintenance/2026-05-27_core-memory-pipeline-migration.md`

## Key Preferences

- **NO direct Google API key** — route Google models through `abacus` or `openrouter`
- Hermes fallback order: `ollama` → `abacus` → `openrouter`
- All config edits on VM via `docker exec`, then sync to local workspace
- SOUL.md loaded fresh each message — no restart needed for behavior changes
