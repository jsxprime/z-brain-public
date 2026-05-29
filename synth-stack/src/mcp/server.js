/**
 * MCP Server for Z-Brain Synthesizer.
 *
 * Exposes tools that allow Hermes/Zella to:
 *   - Post messages to Zulip
 *   - Create/update Wiki.js pages
 *   - Pause/resume the Synthesizer worker
 *   - Force-reprocess failed/quarantined events
 *   - Trigger a backfill for a given time range
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { postMessage as zulipPostMessage } from '../clients/zulip.js';
import { createPage, updatePage } from '../clients/wikijs.js';

/**
 * Create and configure the MCP server.
 *
 * @param {import('pg').Pool} pool - Postgres pool for synth-postgres
 * @param {object} config - App config from loadConfig()
 * @returns {McpServer} Configured MCP server instance
 */
export function createMcpServer(pool, config) {
  const server = new McpServer({
    name: 'z-brain-synth-mcp',
    version: '0.1.0',
  });

  // ─── Zulip Tools ───────────────────────────────────────

  server.tool(
    'zulip_post_message',
    'Post a message to a Zulip stream/topic or send a direct message.',
    {
      type: z.enum(['stream', 'direct']).describe('Message type: "stream" for channel messages, "direct" for private messages'),
      to: z.string().describe('Stream name (for stream messages) or JSON array of user emails (for direct messages)'),
      topic: z.string().optional().describe('Topic name (required for stream messages)'),
      content: z.string().describe('Message content in Zulip Markdown format'),
    },
    async ({ type, to, topic, content }) => {
      try {
        const result = await zulipPostMessage(config, { type, to, topic, content });
        return {
          content: [{ type: 'text', text: `✅ Message posted to Zulip (ID: ${result.id})` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Zulip error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Wiki.js Tools ─────────────────────────────────────

  server.tool(
    'wikijs_create_page',
    'Create a new page in Wiki.js.',
    {
      path: z.string().describe('Page path (e.g. "homelab/docker/traefik")'),
      title: z.string().describe('Page title'),
      content: z.string().describe('Page content in Markdown format'),
      description: z.string().optional().describe('Short page description'),
    },
    async ({ path, title, content, description }) => {
      try {
        const result = await createPage(config, { path, title, content, description });
        return {
          content: [{ type: 'text', text: `✅ Wiki page created: "${result.page.title}" (ID: ${result.page.id}, path: ${result.page.path})` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Wiki.js error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'wikijs_update_page',
    'Update an existing page in Wiki.js.',
    {
      id: z.number().describe('Page ID to update'),
      title: z.string().describe('New page title'),
      content: z.string().describe('New page content in Markdown format'),
      description: z.string().optional().describe('New page description'),
    },
    async ({ id, title, content, description }) => {
      try {
        const result = await updatePage(config, { id, title, content, description });
        return {
          content: [{ type: 'text', text: `✅ Wiki page updated: "${result.page.title}" (ID: ${result.page.id})` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Wiki.js error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Synthesizer Control Tools ─────────────────────────

  server.tool(
    'synthesizer_pause',
    'Pause the Synthesizer worker. No new events will be processed until resumed.',
    {},
    async () => {
      try {
        await pool.query(
          `INSERT INTO system_config (key, value, updated_at) VALUES ('worker_paused', 'true', NOW())
           ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW()`
        );
        return {
          content: [{ type: 'text', text: '⏸️ Synthesizer worker paused. Use synthesizer_resume to resume.' }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Failed to pause: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'synthesizer_resume',
    'Resume the Synthesizer worker after a pause.',
    {},
    async () => {
      try {
        await pool.query(
          `INSERT INTO system_config (key, value, updated_at) VALUES ('worker_paused', 'false', NOW())
           ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = NOW()`
        );
        return {
          content: [{ type: 'text', text: '▶️ Synthesizer worker resumed.' }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Failed to resume: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'synthesizer_status',
    'Get the current status of the Synthesizer (pause state + queue stats).',
    {},
    async () => {
      try {
        const pauseResult = await pool.query(
          `SELECT value FROM system_config WHERE key = 'worker_paused'`
        );
        const isPaused = pauseResult.rows[0]?.value === 'true';

        const statsResult = await pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'pending') AS pending,
            COUNT(*) FILTER (WHERE status = 'processing') AS processing,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed
          FROM events
        `);
        const stats = statsResult.rows[0];

        const quarantineResult = await pool.query(
          `SELECT COUNT(*) AS count FROM processed_memories WHERE quarantined = TRUE AND reviewed_at IS NULL`
        );
        const quarantined = quarantineResult.rows[0].count;

        const text = [
          `Worker: ${isPaused ? '⏸️ PAUSED' : '▶️ RUNNING'}`,
          `Queue: ${stats.pending} pending, ${stats.processing} processing, ${stats.completed} completed, ${stats.failed} failed`,
          `Quarantine: ${quarantined} items awaiting review`,
        ].join('\n');

        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Status check failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'synthesizer_force_reprocess',
    'Move a failed or quarantined event back to pending for reprocessing.',
    {
      event_id: z.string().describe('UUID of the event to reprocess'),
    },
    async ({ event_id }) => {
      try {
        const result = await pool.query(
          `UPDATE events SET status = 'pending', retry_count = 0, error_message = NULL
           WHERE id = $1 AND status IN ('failed', 'quarantined')
           RETURNING id`,
          [event_id]
        );

        if (result.rowCount === 0) {
          return {
            content: [{ type: 'text', text: `⚠️ Event ${event_id} not found or not in failed/quarantined state.` }],
          };
        }

        return {
          content: [{ type: 'text', text: `🔄 Event ${event_id} moved back to pending for reprocessing.` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Reprocess failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'synthesizer_backfill',
    'Trigger a backfill by resetting all events in a time range back to pending.',
    {
      start_date: z.string().describe('ISO 8601 start date (e.g. "2026-05-01T00:00:00Z")'),
      end_date: z.string().describe('ISO 8601 end date (e.g. "2026-05-28T23:59:59Z")'),
      source: z.enum(['zulip', 'wikijs']).optional().describe('Optional: limit backfill to a specific source'),
    },
    async ({ start_date, end_date, source }) => {
      try {
        let query = `UPDATE events SET status = 'pending', retry_count = 0, error_message = NULL
                      WHERE created_at >= $1 AND created_at <= $2`;
        const params = [start_date, end_date];

        if (source) {
          query += ` AND source = $3`;
          params.push(source);
        }

        query += ` RETURNING id`;
        const result = await pool.query(query, params);

        return {
          content: [{ type: 'text', text: `🔄 Backfill triggered: ${result.rowCount} events reset to pending.` }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ Backfill failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}
