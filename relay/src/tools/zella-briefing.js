import { getHealth } from '../clients/hermes.js';
import { executeSSH, queryStateDb } from '../clients/ssh.js';

export const schema = {
  name: "zella_briefing",
  description: "High-level summary for IDE startup sequences",
  parameters: {}
};

export async function handler() {
  try {
    const health = await getHealth().catch(e => ({ status: 'error', error: e.message }));
    
    // SSH Check
    let sshStatus = 'ok';
    try {
      await executeSSH('echo 1');
    } catch {
      sshStatus = 'error';
    }

    // Sessions
    const sessions = await queryStateDb(`SELECT id, started_at, message_count FROM sessions ORDER BY started_at DESC LIMIT 3`).catch(() => []);

    return {
      content: [{ type: "text", text: JSON.stringify({
        health: {
          hermes: health,
          ssh_loopback: { status: sshStatus }
        },
        sessions: {
          recent: sessions,
          active_agents: health.active_agents || 0
        },
        activity_summary: "Review recent items in zella_feed for more context.",
        last_briefing_at: new Date().toISOString()
      }, null, 2) }]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Briefing error: ${error.message}` }],
      isError: true
    };
  }
}
