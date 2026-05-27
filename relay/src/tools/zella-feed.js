import { queryStateDb } from '../clients/ssh.js';
import { z } from 'zod';

export const schema = {
  name: "zella_feed",
  description: "Get Zella's recent activity (conversations, errors) from state.db",
  parameters: {
    limit: z.number().optional().default(20),
    filter: z.enum(["conversations", "errors", "all"]).optional().default("all")
  }
};

export async function handler({ limit, filter }) {
  try {
    // Get recent sessions
    const sessionsSql = `SELECT id, source, started_at FROM sessions ORDER BY started_at DESC LIMIT 5`;
    const sessions = await queryStateDb(sessionsSql);
    
    // Get recent messages (to infer conversations/errors)
    const messagesSql = `SELECT session_id, role, content, timestamp FROM messages ORDER BY id DESC LIMIT ${limit}`;
    const rawMessages = await queryStateDb(messagesSql);

    const items = [];
    for (const msg of rawMessages) {
      if (filter === "errors" || filter === "all") {
        if (msg.role === "tool" && (msg.content.includes("Error:") || msg.content.includes("Traceback"))) {
          items.push({ type: "error", timestamp: msg.timestamp, summary: "Tool error", session_id: msg.session_id, details: msg.content.substring(0, 100) });
        }
      }
      if (filter === "conversations" || filter === "all") {
        if (msg.role === "user" || msg.role === "assistant") {
           items.push({ type: "conversation", timestamp: msg.timestamp, summary: `Message from ${msg.role}`, session_id: msg.session_id, details: msg.content.substring(0, 100) });
        }
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify({
        items: items.slice(0, limit),
        latest_sessions: sessions
      }, null, 2) }]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error fetching feed: ${error.message}` }],
      isError: true
    };
  }
}
