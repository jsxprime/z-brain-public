import dotenv from 'dotenv';
dotenv.config({ quiet: true });

export function loadConfig(env = process.env) {
  return {
    HERMES_API_KEY: env.HERMES_API_KEY || '',
    HERMES_API_URL: env.HERMES_API_URL || 'http://YOUR_VM_IP:8642',
    VM_HOST: env.VM_HOST || 'YOUR_VM_IP',
    VM_USER: env.VM_USER || 'YOUR_VM_USER',
    OPENBRAIN_URL: env.OPENBRAIN_URL || 'http://YOUR_VM_IP:3040',
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN || '',
    TELEGRAM_HOME_CHANNEL: env.TELEGRAM_HOME_CHANNEL || '',
    CACHE_TTL_SECONDS: parseInt(env.CACHE_TTL_SECONDS || '60', 10),
    CHAT_MAX_TOKENS: parseInt(env.CHAT_MAX_TOKENS || '16000', 10)
  };
}

export const config = loadConfig();
