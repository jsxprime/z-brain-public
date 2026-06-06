# CORE Version Tracking & Upgrade Protection

> Tracks CORE Memory OS upstream versions and our configuration patches.
> **Critical:** CORE upstream rebuilds reset the container. Our configuration must survive upgrades.

---

## Current Configuration (as of 2026-06-06)

### Environment Variables (`.env` + `docker-compose.yml`)

```ini
CHAT_PROVIDER=openai
MODEL=openai/anthropic/claude-sonnet-4    # openai/ prefix REQUIRED
OPENAI_API_KEY=sk-or-v1-...              # OpenRouter key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_MODE=chat_completions
```

### Database Overrides (Applied manually, may need re-application after upgrade)

```sql
-- Disable GPT models (not available on OpenRouter)
UPDATE "LLMModel" SET "isEnabled" = false
WHERE "providerId" IN (SELECT id FROM "LLMProvider" WHERE type = 'openai')
AND "modelId" NOT LIKE 'text-embedding%';

-- Disable Anthropic/Azure direct models (no API keys)
UPDATE "LLMModel" SET "isEnabled" = false
WHERE "providerId" IN (SELECT id FROM "LLMProvider" WHERE type IN ('anthropic', 'azure'));
```

### Why the `openai/` prefix?

CORE's `getProvider()` function in `model.server.ts` splits on the first `/` to determine routing:
- `anthropic/claude-sonnet-4` → provider = `"anthropic"` → sends to `api.anthropic.com` → **FAILS** (no API key)
- `claude-sonnet-4` → pattern match `claude-*` → provider = `"anthropic"` → **FAILS**
- `openai/anthropic/claude-sonnet-4` → provider = `"openai"` → uses `OPENAI_BASE_URL` proxy → **WORKS** ✅

---

## Version History

| Version | Date | Impact | Notes |
|---------|------|--------|-------|
| v0.7.13 | ~May 25 | Baseline | First deployment |
| v0.7.14 | ~May 27 | ⚠️ Source patches wiped | Upstream rebuild. Included Ollama `toOllamaApiBase()` fix. Our `model.server.ts` and `llm-provider.server.ts` patches lost. |
| v0.7.15 | ~June 1 | 🔴 Pipeline broken | First FAILED ingestion. Old `CHAT_PROVIDER=openrouter` config no longer works. |
| v0.7.15 (fixed) | June 6 | ✅ Restored | Pure configuration fix. No source patches. Upgrade-safe. |

---

## Pre-Upgrade Checklist

Before upgrading CORE to a new version:

1. **Backup Postgres** — `docker exec core-postgres pg_dump -U postgres -d core_brain --clean --if-exists > ~/backups/core_brain_pre_upgrade.sql`
2. **Verify env vars pass through** — Check `docker-compose.yml` has all OPENAI_* vars in environment section
3. **Test after upgrade:**
   ```bash
   # Check model routing
   docker logs core-app --since 60s 2>&1 | grep 'model:'
   
   # Check for x-api-key errors
   docker logs core-app --since 60s 2>&1 | grep 'x-api-key'
   
   # Test ingest
   # Use z-brain MCP memory_ingest tool or CORE API
   ```
4. **Re-apply DB overrides if needed** — The seed process may re-enable GPT/Anthropic models:
   ```sql
   SELECT m."modelId", p.type, m."isEnabled"
   FROM "LLMModel" m JOIN "LLMProvider" p ON m."providerId" = p.id
   WHERE m."isDeprecated" = false AND m."isEnabled" = true
   ORDER BY p.type;
   ```
   If GPT models appear as enabled, re-run the disable SQL above.

---

## Post-Upgrade Verification

```bash
# 1. Check container is running
docker compose ps core-app

# 2. Check env vars are correct
docker exec core-app env | grep -E 'OPENAI_|CHAT_PROVIDER|^MODEL='

# 3. Check LLMModel table
docker exec core-postgres psql -U postgres -d core_brain -c \
  "SELECT m.\"modelId\", p.type, m.\"isEnabled\" FROM \"LLMModel\" m JOIN \"LLMProvider\" p ON m.\"providerId\" = p.id WHERE m.\"isEnabled\" = true AND m.\"isDeprecated\" = false;"

# 4. Submit test episode and monitor
# ... then check IngestionQueue for COMPLETED status

# 5. Check logs for correct model routing
docker logs core-app --since 120s 2>&1 | grep 'model:'
# Should show: openai/anthropic/claude-sonnet-4
```

---

## Known Upstream Behaviors

- **Seed process re-enables models:** On startup, CORE's seed process iterates through all known providers and may re-enable models we disabled. The `mxbai-embed-large` model gets deprecated then undeprecated (logged as `[LLM] Undeprecated env-specified embedding model`).
- **Docker compose up recreates containers:** `docker compose up -d` with a new image will recreate the container, resetting any `docker exec` patches but preserving volume-mounted data and Postgres data.
- **BullMQ state is in Redis:** The `IngestionQueue` Postgres table tracks status, but BullMQ's actual job state is in Redis. Directly updating Postgres `status` column does NOT create Redis jobs. Restart CORE to re-scan PENDING items, or re-submit via the API.

---

*Created by Antigravity IDE (Claude Opus 4) during session 50794e9b on 2026-06-06.*
