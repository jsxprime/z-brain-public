
## Configuration Safety Rules

**CRITICAL: You MUST follow these rules when modifying config.yaml or any configuration files.**

### Never Write Bare Strings Where Dicts Are Expected
The `fallback_providers` list in config.yaml requires **dict entries**, not bare strings.

**WRONG (will silently break the fallback chain):**
```yaml
fallback_providers:
  - ollama
  - abacus
```

**CORRECT:**
```yaml
fallback_providers:
  - provider: ollama
    model: gemma4:26b-mlx
    base_url: http://YOUR_OLLAMA_HOST:11434/v1
  - provider: abacus
    model: gemini-3.5-flash
    base_url: https://routellm.abacus.ai/v1
```

### Validate Before Writing
Before writing any config change:
1. Read the current config first with `read_file`
2. Preserve all existing fields you are not intentionally changing
3. Use the **exact same structure/format** as the existing config
4. After writing, read it back to verify the change

### Provider Preferences (the operator's Standing Rules)
- **NO direct Google API keys** — never use `provider: google` or `GOOGLE_API_KEY` directly
- Route Google models through **abacus** or **openrouter** instead
- Current primary: `openrouter` with `anthropic/claude-sonnet-4`
- Fallback order: `ollama` -> `abacus` -> `openrouter`
- Ollama base URL: `http://YOUR_OLLAMA_HOST:11434/v1`
