/**
 * MCP Streamable HTTP transport integration for Fastify.
 *
 * Registers a POST /mcp endpoint that handles JSON-RPC messages
 * using the MCP SDK's StreamableHTTPServerTransport.
 *
 * Hermes connects to this via mcp-remote:
 *   npx -y mcp-remote http://synth-app:3080/mcp --allow-http
 */

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from './server.js';

/**
 * Register MCP routes on a Fastify instance.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {import('pg').Pool} pool
 * @param {object} config
 */
export function registerMcpRoutes(app, pool, config) {
  // Session store: maps sessionId → transport
  const sessions = new Map();

  // Create the MCP server (tools are registered here)
  const mcpServer = createMcpServer(pool, config);

  // Handle JSON-RPC messages via POST /mcp
  app.post('/mcp', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'];
    let transport;

    if (sessionId && sessions.has(sessionId)) {
      // Reuse existing session
      transport = sessions.get(sessionId);
    } else if (!sessionId && isInitializeRequest(request.body)) {
      // New session — create transport and connect
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Use default UUID generator
      });

      // Connect MCP server to this transport
      await mcpServer.connect(transport);

      // Store the session
      sessions.set(transport.sessionId, transport);

      // Cleanup on close
      transport.onclose = () => {
        sessions.delete(transport.sessionId);
      };
    } else {
      // Invalid — no session and not an initialize request
      return reply.code(400).send({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session. Send an initialize request first.' },
        id: null,
      });
    }

    // Delegate to the transport's request handler
    // StreamableHTTPServerTransport.handleRequest expects (req, res, body)
    await transport.handleRequest(request.raw, reply.raw, request.body);

    // Mark reply as sent (Fastify should not try to send again)
    reply.hijack();
  });

  // Handle GET /mcp for SSE-based notifications (optional, for clients that want server-to-client push)
  app.get('/mcp', async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'];
    if (!sessionId || !sessions.has(sessionId)) {
      return reply.code(400).send({ error: 'Invalid or missing session ID' });
    }

    const transport = sessions.get(sessionId);
    await transport.handleRequest(request.raw, reply.raw);
    reply.hijack();
  });

  // Handle DELETE /mcp for session termination
  app.delete('/mcp', async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'];
    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId);
      await transport.close();
      sessions.delete(sessionId);
    }
    return reply.code(200).send({ status: 'session terminated' });
  });

  console.log('  MCP Streamable HTTP transport registered at POST /mcp');
}
