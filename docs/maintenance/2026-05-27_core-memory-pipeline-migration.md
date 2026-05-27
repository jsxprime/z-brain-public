# CORE Memory Pipeline Migration — 2026-05-27

> **Date**: 2026-05-27 (00:00–00:25 EDT)
> **Session**: `25c8d5a4-1162-4893-9614-f758c9834e9e`
> **Operator**: Antigravity IDE Agent
> **Commits**: 2 on `main` branch

---

## Problem Statement

The CORE Memory OS (deployed on Z-Brain VM `YOUR_VM_IP`) had its Google API credits fully depleted, causing all memory operations to fail:
- **Embeddings** — `gemini-embedding-2` returning "prepayment credits are depleted"
- **Chat/extraction** — Google model calls failing, breaking knowledge graph extraction
- **Hermes Agent** — All tiers in `model_router_state.json` pointed to non-existent `openai-codex` models, causing 400 errors on every API call

Additionally, the operator has a **standing preference**: no direct Google API usage anywhere in the stack. All Google models must be routed through Abacus or OpenRouter.

---

## Architecture Reference

```
┌─────────────────────────────────────────────────┐
│                 Z-Brain VM (YOUR_VM_IP)        │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ core-app │  │  redis   │  │ postgres │      │
│  │ (Node)   │  │          │  │ core_brain│      │
│  └────┬─────┘  └──────────┘  └──────────┘      │
│       │                                         │
│  ┌────┴─────┐  ┌──────────┐  ┌──────────┐      │
│  │  neo4j   │  │ hermes-  │  │  SOUL.md │      │
│  │(graph DB)│  │  agent   │  │(behavior)│      │
│  └──────────┘  └──────────┘  └──────────┘      │
│                                                 │
│  External connections:                          │
│  • Ollama → host Mac (YOUR_OLLAMA_HOST:11434)       │
│  • OpenRouter → openrouter.ai/api/v1           │
└─────────────────────────────────────────────────┘
```

### Key Paths on VM
| Component | Path |
|-----------|------|
| CORE source | `~/docker/core-stack/core/` |
| CORE .env | `~/docker/core-stack/.env` |
| CORE docker-compose | `~/docker/core-stack/docker-compose.yml` |
| Hermes config | `/opt/data/config.yaml` (mounted volume) |
| Hermes model router | `/opt/data/model_router_state.json` |
| Hermes personality | `/opt/data/SOUL.md` |
| Local workspace sync | `/Volumes/nvme-2tb/ant-workspace/z-brain/` |

---

## Changes Made

### 1. Environment Configuration (`.env`)

```diff
-EMBEDDINGS_PROVIDER=google
-EMBEDDING_MODEL=gemini-embedding-2
-EMBEDDING_MODEL_SIZE=768
+EMBEDDINGS_PROVIDER=ollama
+EMBEDDING_MODEL=mxbai-embed-large
+EMBEDDING_MODEL_SIZE=1024

-CHAT_PROVIDER=google
-MODEL=gemini-2.0-flash
+CHAT_PROVIDER=openrouter
+MODEL=anthropic/claude-sonnet-4

-OLLAMA_URL=http://YOUR_OLLAMA_HOST:11434/api
+OLLAMA_URL=http://YOUR_OLLAMA_HOST:11434

+OPENROUTER_API_KEY=sk-or-v1-...
```

> **IMPORTANT**: `OLLAMA_URL` must NOT have `/api` suffix. The AI SDK code appends `/v1` to create the OpenAI-compatible endpoint (`http://host:11434/v1`). If you set it to `.../api`, the resulting URL `http://host:11434/api/v1` returns 404.

### 2. Docker Compose (`docker-compose.yml`)

Added missing environment variable passthrough:
```diff
       - OLLAMA_URL=${OLLAMA_URL}
+      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
```

### 3. CORE Source Patches

#### `llm-provider.server.ts` — Model Seed Undeprecation

**The Problem**: The CORE app seeds models from a hardcoded list on startup. Any model NOT in the seed list gets `isDeprecated = true`. Custom models specified via env vars (like `mxbai-embed-large`) are not in the seed list, so they get deprecated on every restart. The custom model creation section finds the existing (but deprecated) model and skips re-creation.

**The Fix**: After the seed loop, check if `EMBEDDING_MODEL` or `MODEL` env vars specify a model that exists but is deprecated, and undeprecate it.

```typescript
// After seed loop completes:
} else if (embeddingModel.isDeprecated) {
  // Undeprecate env-specified embedding models that the seed loop deprecated
  await prisma.lLMModel.update({
    where: { id: embeddingModel.id },
    data: { isDeprecated: false, isEnabled: true },
  });
  logger.info(
    `[LLM] Undeprecated env-specified embedding model: ${embeddingModelId}`,
  );
}
```

**Startup log now shows** (expected and correct):
```
[LLM] Deprecated model: mxbai-embed-large
[LLM] Undeprecated env-specified embedding model: mxbai-embed-large
```

#### `model.server.ts` — OpenRouter Provider Routing

**The Problem (routing order)**: When `MODEL=anthropic/claude-sonnet-4` and `CHAT_PROVIDER=openrouter`:
1. `resolveModelForWorkspace` correctly resolves API key from OpenRouter
2. `createAgent("anthropic/claude-sonnet-4", ..., { apiKey: "sk-or-v1-..." })` is called
3. `getProvider("anthropic/claude-sonnet-4")` splits on `/` → returns `"anthropic"`
4. The **generic BYOK handler** (`if (options?.apiKey)`) catches the call
5. `toRouterString` passes `anthropic/claude-sonnet-4` to Mastra's router
6. Mastra creates an Anthropic provider client, sends OpenRouter key to Anthropic → **`invalid x-api-key`**

**The Fix**: Moved the OpenRouter check BEFORE the generic BYOK handler:

```typescript
// OpenRouter: use OpenAI-compatible client (handles both server-level and BYOK)
// Must come before generic BYOK to prevent Mastra router misrouting anthropic/* models
if (provider === "openrouter" || getDefaultChatProviderType() === "openrouter") {
  return new Agent({
    model: getModel(modelString) as any,
    ...
  });
}

// BYOK: pass { id: "provider/model", apiKey } — Mastra's router handles the rest.
if (options?.apiKey) { ... }
```

**The Problem (structured output)**: Using `createOpenAI` for OpenRouter works for simple chat, but structured output (JSON schema) isn't strictly enforced through OpenAI-compatible endpoints. The model returned `source_entity` instead of `source`, `relation` instead of `predicate`, etc.

**The Fix**: Use `createAnthropic` with OpenRouter's base URL. This sends requests in Anthropic's native messages format which enforces schema via tool-use:

```typescript
import { createAnthropic } from "@ai-sdk/anthropic";

// In getModel():
const anthropicViaOR = createAnthropic({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: openrouterKey,
});
return anthropicViaOR(modelId);
```

### 4. Hermes Agent Configuration

#### `config.yaml`
```diff
 model:
-  provider: openai
-  default: gpt-4o-mini
+  provider: openrouter
+  default: anthropic/claude-sonnet-4
   providers:
+    openrouter:
+      base_url: https://openrouter.ai/api/v1
```

#### `model_router_state.json`
All tiers updated from broken `openai-codex` to:
- High tier: `openrouter:anthropic/claude-sonnet-4`
- Medium tier: `openrouter:anthropic/claude-sonnet-4`
- Low tier: `openrouter:anthropic/claude-haiku-3`

### 5. SOUL.md Config Protection

Added a "Configuration Safety Rules" section to prevent Zella from writing broken configs:
- Never write bare strings where dicts are expected in `fallback_providers`
- Always validate config before/after writing
- the operator's standing provider preferences documented

### 6. Database Changes

```sql
-- Added openrouter provider
INSERT INTO "LLMProvider" (type, ...) VALUES ('openrouter', ...);

-- Moved mxbai-embed-large from openai to ollama provider
UPDATE "LLMModel" SET "providerId" = (ollama_provider_id)
WHERE "modelId" = 'mxbai-embed-large';

-- Marked 48 stale PENDING ingestion records as FAILED
UPDATE "IngestionQueue" SET status = 'FAILED'
WHERE status = 'PENDING' AND "createdAt" < '2026-05-27T04:10:00Z';
```

---

## Bugs Found and Fixed (5 total)

| # | Bug | Root Cause | Fix | File |
|---|-----|-----------|-----|------|
| 1 | Model deprecated on every restart | Seed loop deprecates non-seed models; custom model check finds deprecated model, skips re-creation | Added undeprecation after seed | `llm-provider.server.ts` |
| 2 | Ollama embeddings 404 | `OLLAMA_URL` had `/api` suffix; AI SDK adds `/v1` → `host:11434/api/v1` doesn't exist | Removed `/api` from URL | `.env` |
| 3 | OpenRouter key not in container | `OPENROUTER_API_KEY` missing from `docker-compose.yml` environment | Added env passthrough | `docker-compose.yml` |
| 4 | OpenRouter calls hit Anthropic directly | Generic BYOK handler intercepted before OpenRouter check; Mastra router misrouted `anthropic/*` to Anthropic provider | Moved OpenRouter check before BYOK | `model.server.ts` |
| 5 | Structured output wrong field names | OpenAI-compat endpoint doesn't enforce JSON schema strictly | Switched to `createAnthropic` via OpenRouter | `model.server.ts` |

---

## Verification Results

```
memory_ingest → {success: true, id: "cmpnk42mt0001uj015chspa4s"}
  → Preprocessing ✅
  → Ollama embedding (mxbai-embed-large, 1024-dim) ✅
  → Knowledge graph: 3 triples extracted ✅
  → Entity resolution: 3 triples, 1 merge ✅
  → Statement resolution: 3 resolved ✅
  → Label assignment: completed ✅
  → Aspect resolution: 1 new voice aspect ✅

memory_search("What changes were made to CORE memory system?")
  → 2 episodes returned with relevance scores (0.54, 0.54) ✅
```

---

## Current Provider Configuration

| Component | Provider | Model | Endpoint |
|-----------|----------|-------|----------|
| CORE Embeddings | Ollama (local) | `mxbai-embed-large` (1024-dim) | `http://YOUR_OLLAMA_HOST:11434/v1` |
| CORE Chat/Extraction | OpenRouter | `anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| Hermes Primary | OpenRouter | `anthropic/claude-sonnet-4` | `https://openrouter.ai/api/v1` |
| Hermes Fallback 1 | Ollama (local) | `gemma4:26b-mlx` | `http://YOUR_OLLAMA_HOST:11434/v1` |
| Hermes Fallback 2 | Abacus | `gemini-3.5-flash` | `https://routellm.abacus.ai/v1` |

---

## Troubleshooting Guide

### If memory_ingest fails with "invalid x-api-key"
- Check `OPENROUTER_API_KEY` is set in `.env` AND in `docker-compose.yml`
- Verify key is valid: `curl -H "Authorization: Bearer $KEY" https://openrouter.ai/api/v1/models`
- Check that the OpenRouter handler in `createAgent()` comes BEFORE the generic BYOK handler

### If embeddings fail with 404
- Verify `OLLAMA_URL` does NOT have `/api` suffix — should be `http://YOUR_OLLAMA_HOST:11434`
- Test Ollama connectivity: `curl http://YOUR_OLLAMA_HOST:11434/v1/models`
- Check model is loaded: `curl http://YOUR_OLLAMA_HOST:11434/api/tags`

### If mxbai-embed-large is deprecated after restart
- This is expected — the seed loop deprecates it, then the custom model section undeprecates it
- If the undeprecation log line (`[LLM] Undeprecated env-specified embedding model`) is missing, the fix in `llm-provider.server.ts` may have been reverted
- Manual fix: `UPDATE "LLMModel" SET "isDeprecated" = false WHERE "modelId" = 'mxbai-embed-large';`

### If structured output validation fails
- Check that `getModel()` uses `createAnthropic` (not `createOpenAI`) for the OpenRouter case
- The Anthropic provider sends structured output via tool-use which strictly enforces schema
- The OpenAI-compatible endpoint uses JSON mode which doesn't enforce field names

### If Zella stops responding
- Check Hermes logs: `docker logs hermes-agent --since 60s`
- Verify config.yaml has `provider: openrouter` and `default: anthropic/claude-sonnet-4`
- Check model_router_state.json — all tiers should use `openrouter:anthropic/...`
- Test OpenRouter directly: `zella_status` via z-relay MCP

---

## Standing Rules (the operator's Preferences)

1. **NO direct Google API keys** — never use `provider: google` or `GOOGLE_API_KEY`
2. Route Google models through **Abacus** or **OpenRouter** only
3. Hermes fallback order: Ollama → Abacus → OpenRouter
4. All config edits on VM via `docker exec`, then sync to local workspace
5. SOUL.md is loaded fresh each message — no restart needed for behavior changes
