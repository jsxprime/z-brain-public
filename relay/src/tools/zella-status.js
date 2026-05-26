import { getHealth } from '../clients/hermes.js';

export const schema = {
  name: "zella_status",
  description: "Quick health check for Zella and Hermes infrastructure",
  parameters: {} // Zod empty object handled in index.js registration
};

export async function handler() {
  try {
    const data = await getHealth();
    return {
      content: [{ type: "text", text: JSON.stringify({
        online: data.status === 'ok',
        gateway_state: data.gateway_state,
        telegram_connected: data.platforms?.telegram?.state === 'connected',
        active_agents: data.active_agents,
        uptime_since: data.updated_at
      }, null, 2) }]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ online: false, error: error.message }) }],
      isError: true
    };
  }
}
