# Z-Brain Superpowers Status

> Last updated: 2026-05-26T23:52:00-04:00 (Session: 25c8d5a4)

## Session Summary

Fixed two critical system failures:

1. **CORE Memory System** — Google API key was depleted (`prepayment credits depleted`), breaking all embeddings and chat. Switched to Ollama (`mxbai-embed-large`, 1024-dim) for embeddings and OpenRouter (`anthropic/claude-sonnet-4`) for chat. Added `openrouter` provider and model records to CORE database. Eliminated all direct Google API usage per the operator's standing preference.

2. **Hermes Agent Model Selection** — The `model_router` plugin had all tiers pointing at broken `openai-codex` models, causing 400 "No models provided" errors on every API call. Updated primary provider to `openrouter` with `anthropic/claude-sonnet-4`, and updated all model_router tiers to use OpenRouter Anthropic models. Zella is back online and responding.

## Changes Made

| File | Location | Change |
|---|---|---|
| `.env` | VM `~/docker/core-stack/.env` | Switched EMBEDDINGS_PROVIDER→ollama, CHAT_PROVIDER→openrouter, added OPENROUTER_API_KEY, neutralized Google keys |
| `.env` | Local workspace (synced from VM) | Synced via `scp` |
| `config.yaml` | VM `/opt/data/config.yaml` | Changed model.provider→openrouter, model.default→anthropic/claude-sonnet-4, added openrouter to providers |
| `config.yaml` | Local workspace (synced from VM) | Synced via `docker cp` + `scp` |
| `model_router_state.json` | VM `/opt/data/model_router_state.json` | Updated all tiers from openai-codex to openrouter anthropic models |
| `model_router_state.json` | Local workspace (synced from VM) | Synced via `docker cp` + `scp` |
| DB: `LLMProvider` | CORE PostgreSQL | Added `openrouter` provider record |
| DB: `LLMModel` | CORE PostgreSQL | Moved `mxbai-embed-large` from openai→ollama provider, added `anthropic/claude-sonnet-4` chat model |

## Current State

- ✅ Zella is **online** and responding (via OpenRouter `anthropic/claude-sonnet-4`)
- ✅ Hermes model router tiers updated to OpenRouter Anthropic models
- ✅ CORE embeddings switched to Ollama `mxbai-embed-large` (1024-dim, local)
- ✅ CORE chat switched to OpenRouter
- ✅ **No direct Google API keys in use anywhere**
- ✅ All configs synced: VM → local workspace
- ⚠️ `memory_ingest` MCP tool still broken — pre-existing code bug (`Cannot read properties of undefined (reading 'match')`)
- ⚠️ `memory_search` V2 has a related `slice` error
- ⚠️ 12 stale failed jobs from Google API era (not growing)

## Key Preferences Recorded

- **NO direct Google API key** — route Google models through `abacus` or `openrouter`
- Hermes fallback order: `ollama` (gemma4:26b-mlx) → `abacus` (gemini-3.5-flash) → `openrouter` (anthropic/claude-sonnet-4)
- CORE embedding provider: `ollama` (mxbai-embed-large, 1024-dim)
- CORE chat provider: `openrouter` (anthropic/claude-sonnet-4)
- Always edit Hermes config via `docker exec` on VM, then sync to local workspace

## Next Session Priorities

1. **Fix `memory_ingest` MCP bug** — The `.match` error is in the CORE MCP handler chain, likely a missing `source` or `workspaceId` parameter not being passed through from the MCP session. Needs tracing through `server.ts` → `mcp.server.ts` → `memory.ts` → `memory-operations.ts` → `ingest.server.ts`.
2. **Fix `memory_search` V2 `slice` error** — Likely related to the same parameter passing issue.
3. **Clean up 12 stale failed jobs** — These are from the Google API era and won't self-resolve. Need BullMQ retry or removal.
4. **SOUL.md config protection** — Add instructions preventing Zella from writing broken config formats.
