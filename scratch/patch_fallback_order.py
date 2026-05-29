import yaml

with open('/opt/data/config.yaml', 'r') as f:
    cfg = yaml.safe_load(f)

fallbacks = cfg.get('fallback_providers', [])
openai_idx = next((i for i, f in enumerate(fallbacks) if f.get('provider') == 'openai'), -1)
ollama_idx = next((i for i, f in enumerate(fallbacks) if f.get('provider') == 'ollama'), -1)

if openai_idx != -1 and ollama_idx != -1:
    if ollama_idx < openai_idx:
        fallbacks[ollama_idx], fallbacks[openai_idx] = fallbacks[openai_idx], fallbacks[ollama_idx]

with open('/opt/data/config.yaml', 'w') as f:
    yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
