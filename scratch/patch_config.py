import yaml

with open('/Volumes/nvme-2tb/ant-workspace/z-brain/scratch/config.yaml', 'r') as f:
    cfg = yaml.safe_load(f)

# Add openai, remove abacus
if 'abacus' in cfg.get('providers', {}):
    del cfg['providers']['abacus']
cfg['providers']['openai'] = {'key_env': 'OPENAI_API_KEY', 'models': {}}

# Update fallback_providers
cfg['fallback_providers'] = [
    {'provider': 'ollama', 'model': 'gemma4:26b-mlx', 'base_url': 'http://YOUR_OLLAMA_HOST:11434/v1'},
    {'provider': 'openai', 'model': 'gpt-4o-mini'}
]

# Update auxiliary models
for key, aux in cfg.get('auxiliary', {}).items():
    if aux.get('provider') == 'abacus':
        aux['provider'] = 'openai'
        aux['model'] = 'gpt-4o-mini'
        if 'base_url' in aux:
            aux['base_url'] = ''

with open('/Volumes/nvme-2tb/ant-workspace/z-brain/scratch/config.yaml', 'w') as f:
    yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
