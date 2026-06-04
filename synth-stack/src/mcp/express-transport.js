/**
 * Standalone MCP server using Express (not Fastify).
 *
 * Fastify's reply.hijack() breaks SSE streams in production with
 * Hermes/mcp-remote clients. Express works reliably (openbrain uses it).
 *
 * This runs on a SEPARATE port (3081) from the main Fastify app (3080).
 * Hermes connects via:
 *   url: http://synth-app:3081/sse
 *   transport: sse
 */

import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer } from './server-minimal.js';  // DIAGNOSTIC: minimal one-tool server

/**
 * Start the MCP Express server on a given port.
 *
 * @param {import('pg').Pool} pool
 * @param {object} config
 * @param {number} [port=3081]
 */
export function startMcpServer(pool, config, port = 3081) {
  const app = express();
  app.use(express.json());

  // Global error handlers
  process.on('unhandledRejection', (reason, promise) => {
    console.error(`  [MCP] UNHANDLED REJECTION:`, reason);
  });
  process.on('uncaughtException', (err) => {
    console.error(`  [MCP] UNCAUGHT EXCEPTION:`, err);
  });

  // Session store
  const sessions = {};

  // SSE endpoint — client connects here to establish the stream
  app.get('/sse', async (req, res) => {
    console.log(`  [MCP] SSE connection from ${req.ip}`);
    const transport = new SSEServerTransport('/messages', res);
    const mcpServer = createMcpServer(pool, config);

    // Log EVERY message the transport receives
    const origHandlePost = transport.handlePostMessage.bind(transport);
    transport.handlePostMessage = async function(req2, res2, body) {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      console.log(`  [MCP] <<< ${parsed.method || 'response'} id=${parsed.id ?? '-'}`);
      try {
        const result = await origHandlePost(req2, res2, body);
        console.log(`  [MCP] >>> handled ${parsed.method || 'response'} OK`);
        return result;
      } catch (err) {
        console.error(`  [MCP] !!! handler error for ${parsed.method}: ${err.message}`);
        console.error(err.stack);
        throw err;
      }
    };

    // Log transport close
    transport.onclose = () => {
      console.log(`  [MCP] transport.onclose fired for ${transport.sessionId}`);
    };
    transport.onerror = (err) => {
      console.error(`  [MCP] transport.onerror: ${err?.message}`);
    };

    sessions[transport.sessionId] = { transport, server: mcpServer };

    res.on('close', () => {
      console.log(`  [MCP] SSE res.close for ${transport.sessionId}`);
      delete sessions[transport.sessionId];
    });

    await mcpServer.connect(transport);
    console.log(`  [MCP] SSE session ready: ${transport.sessionId}`);

    // Keep the handler alive until the client disconnects
    await new Promise((resolve) => {
      res.on('close', resolve);
    });
  });

  // Messages endpoint — client POSTs JSON-RPC messages here
  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId || !sessions[sessionId]) {
      res.status(400).send({ error: 'Invalid or missing session ID' });
      return;
    }

    const { transport } = sessions[sessionId];
    await transport.handlePostMessage(req, res, req.body);
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', sessions: Object.keys(sessions).length });
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`  MCP SSE server (Express) listening on port ${port}`);
  });

  return app;
}
