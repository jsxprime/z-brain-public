# CORE Episodic Recency Gap Fix — 2026-06-06

> **Date**: 2026-06-06
> **Session**: `50794e9b-0a76-4f6c-b952-1ec1b63975d3`
> **Operator**: Antigravity IDE Agent

---

## Problem Statement

The CORE Memory OS episode ingestion pipeline was dead for 9 days (May 28 – June 6). The `ingest-episode` BullMQ worker failed with `AI_APICallError: invalid x-api-key` when extracting structured knowledge from episodes.

### Timeline

| Date | Event |
|------|-------|
| May 27 | Source-patched `model.server.ts` for OpenRouter routing |
| May 28 | Last successful episode ingestion |
| May 29 | CORE v0.7.14 released — container rebuilt from upstream, **wiping source patches** |
| June 1 | CORE v0.7.15 — first FAILED ingestion |
| June 6 | **Fixed** via pure configuration (no source patches) |

---

## Root Cause

The May 27 migration used `CHAT_PROVIDER=openrouter` which requires custom source patches to work. The correct approach is CORE's **built-in OpenAI proxy** path, which supports any OpenAI-compatible endpoint via `OPENAI_BASE_URL`.

When upstream CORE was rebuilt, the source patches were lost, breaking the `openrouter` provider routing.

---

## Fix Applied

### Correct `.env` Configuration

```ini
# Route through OpenRouter via OpenAI-compatible proxy
CHAT_PROVIDER=openai
MODEL=openai/anthropic/claude-sonnet-4    # openai/ prefix REQUIRED (see note below)
OPENAI_API_KEY=sk-or-v1-...          # OpenRouter key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_MODE=chat_completions     # Required for proxy endpoints

# Embeddings (unchanged)
EMBEDDINGS_PROVIDER=ollama
EMBEDDING_MODEL=mxbai-embed-large
EMBEDDING_MODEL_SIZE=1024
OLLAMA_URL=http://YOUR_OLLAMA_HOST:11434
```

### `docker-compose.yml` Environment Passthrough

```yaml
environment:
  - OPENAI_API_KEY=${OPENAI_API_KEY}
  - OPENAI_BASE_URL=${OPENAI_BASE_URL}
  - OPENAI_API_MODE=${OPENAI_API_MODE}
```

### Database Changes

```sql
-- Disable GPT models (not available on OpenRouter)
UPDATE "LLMModel" SET "isEnabled" = false
WHERE "providerId" IN (SELECT id FROM "LLMProvider" WHERE type = 'openai')
AND "modelId" NOT LIKE 'text-embedding%';

-- Disable Anthropic/Azure direct models (no API keys)
UPDATE "LLMModel" SET "isEnabled" = false
WHERE "providerId" IN (SELECT id FROM "LLMProvider" WHERE type IN ('anthropic', 'azure'));
```

---

## How CORE's OpenAI Proxy Works

CORE's `getModel()` has explicit handling for custom OpenAI endpoints:

```typescript
// When CHAT_PROVIDER=openai AND OPENAI_BASE_URL is set:
if ("openai" === provider && config.baseUrl) {
    const client = createOpenAI({ baseURL: config.baseUrl, apiKey });
    return apiMode === "chat_completions" 
        ? client.chat(modelId)     // OpenRouter
        : client.responses(modelId); // Direct OpenAI
}
```

For structured output, it detects proxy mode and uses prompt-based extraction:

```typescript
// Proxy detection:
const isProxy = apiMode === "chat_completions" && !!baseUrl;
if (isProxy || isOllama) {
    // Use prompt-based structured output (not strict JSON schema)
}
```

> [!CAUTION]
> **MODEL must use `openai/` prefix** (e.g., `openai/anthropic/claude-sonnet-4`). CORE's `getProvider()` splits on the first `/` to determine the routing provider. Without the `openai/` prefix:
> - `anthropic/claude-sonnet-4` → provider = `"anthropic"` → sends to `api.anthropic.com` with `ANTHROPIC_API_KEY` → fails
> - `claude-sonnet-4` → pattern match `claude-*` → provider = `"anthropic"` → same failure
> 
> With `openai/` prefix: `openai/anthropic/claude-sonnet-4` → provider = `"openai"` → uses `OPENAI_BASE_URL` proxy → sends `anthropic/claude-sonnet-4` as model ID to OpenRouter ✅

---

## Updated Troubleshooting Guide

### If memory_ingest fails with "invalid x-api-key"
- Verify `CHAT_PROVIDER=openai` (NOT `openrouter`)
- Check `OPENAI_API_KEY` is the OpenRouter key (starts with `sk-or-`)
- Check `OPENAI_BASE_URL=https://openrouter.ai/api/v1`
- Ensure these are in `docker-compose.yml` environment section

### If structured output validation fails
- Verify `OPENAI_API_MODE=chat_completions` is set
- This triggers prompt-based structured output instead of strict JSON schema
- Do NOT use `OPENAI_API_MODE=responses` with proxy endpoints

### If model not found on OpenRouter
- Check `LLMModel` table — disable any models not available on OpenRouter
- The model router picks from DB models first, then falls back to `MODEL` env var
- GPT-5.x, Azure, and direct Anthropic models should be disabled

### If PENDING episodes are stuck after DB reset
- BullMQ tracks jobs in Redis, not Postgres
- Updating `status` in `IngestionQueue` doesn't create Redis jobs
- Restart CORE to re-scan PENDING items: `docker compose restart core-app`

---

## Supersedes

This document supersedes the source-patch approach from:
- [2026-05-27_core-memory-pipeline-migration.md](./2026-05-27_core-memory-pipeline-migration.md) (Bugs #4 and #5)

The source patches in `model.server.ts` and `llm-provider.server.ts` are **no longer needed**. The configuration approach is upgrade-safe.

---

## Current Provider Configuration

| Component | Provider | Model | Endpoint |
|-----------|----------|-------|----------|
| CORE Chat/Extraction | OpenAI SDK → OpenRouter | `openai/anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| CORE Embeddings | Ollama (local) | `mxbai-embed-large` (1024-dim) | `http://YOUR_OLLAMA_HOST:11434` |
| Hermes Primary | OpenRouter | `anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| Hermes Fallback 1 | Ollama (local) | `gemma4:26b-mlx` | `http://YOUR_OLLAMA_HOST:11434/v1` |
| Hermes Fallback 2 | Abacus | `gemini-3.5-flash` | `https://routellm.abacus.ai/v1` |
