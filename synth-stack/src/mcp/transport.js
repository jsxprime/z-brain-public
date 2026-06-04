/**
 * MCP transport integration for Fastify.
 *
 * Supports two transports:
 * 1. Streamable HTTP at POST /mcp (protocol 2025-11-25)
 * 2. Legacy SSE at GET /sse + POST /messages (protocol 2024-11-05)
 *
 * mcp-remote uses "http-first" strategy — tries Streamable HTTP first,
 * falls back to SSE. The SSE fallback is the reliable path that
 * openbrain and z-brain use successfully.
 *
 * Hermes connects via:
 *   npx -y mcp-remote http://synth-app:3080/sse --allow-http
 */

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
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
  // Session store: maps sessionId → { transport, server, type }
  const sessions = new Map();

  // ═══════════════════════════════════════════════════════════════════
  // STREAMABLE HTTP TRANSPORT (protocol 2025-11-25) — POST /mcp
  // ═══════════════════════════════════════════════════════════════════

  app.post('/mcp', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'];
    let transport;

    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId);
      if (session.type !== 'streamable') {
        return reply.code(400).send({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Session uses a different transport protocol' },
          id: null,
        });
      }
      transport = session.transport;
    } else if (!sessionId && isInitializeRequest(request.body)) {
      // New session
      const mcpServer = createMcpServer(pool, config);
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        onsessioninitialized: (sid) => {
          sessions.set(sid, { transport, server: mcpServer, type: 'streamable' });
          console.log(`  Streamable HTTP session initialized: ${sid}`);
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
        }
      };

      await mcpServer.connect(transport);
    } else {
      return reply.code(400).send({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session. Send an initialize request first.' },
        id: null,
      });
    }

    await transport.handleRequest(request.raw, reply.raw, request.body);
    reply.hijack();
  });

  app.get('/mcp', async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'];
    if (!sessionId || !sessions.has(sessionId)) {
      return reply.code(400).send({ error: 'Invalid or missing session ID' });
    }
    const { transport } = sessions.get(sessionId);
    await transport.handleRequest(request.raw, reply.raw);
    reply.hijack();
  });

  app.delete('/mcp', async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'];
    if (sessionId && sessions.has(sessionId)) {
      const { transport } = sessions.get(sessionId);
      await transport.close();
      sessions.delete(sessionId);
    }
    return reply.code(200).send({ status: 'session terminated' });
  });

  // ═══════════════════════════════════════════════════════════════════
  // LEGACY SSE TRANSPORT (protocol 2024-11-05) — GET /sse + POST /messages
  // This is the reliable path that mcp-remote falls back to.
  // ═══════════════════════════════════════════════════════════════════

  app.get('/sse', async (request, reply) => {
    // IMPORTANT: hijack BEFORE any writes to reply.raw.
    // mcpServer.connect() → transport.start() → writes SSE headers.
    // If hijack() is called after, Fastify may interfere with the stream.
    reply.hijack();

    const transport = new SSEServerTransport('/messages', reply.raw);
    const mcpServer = createMcpServer(pool, config);

    sessions.set(transport.sessionId, { transport, server: mcpServer, type: 'sse' });
    console.log(`  SSE session initialized: ${transport.sessionId}`);

    reply.raw.on('close', () => {
      sessions.delete(transport.sessionId);
    });

    await mcpServer.connect(transport);
  });

  app.post('/messages', async (request, reply) => {
    const sessionId = request.query.sessionId;
    console.log(`  POST /messages sessionId=${sessionId} body=${JSON.stringify(request.body)?.substring(0, 200)}`);
    if (!sessionId || !sessions.has(sessionId)) {
      console.log(`  POST /messages: session not found`);
      return reply.code(400).send({ error: 'Invalid or missing session ID' });
    }

    const session = sessions.get(sessionId);
    if (session.type !== 'sse') {
      return reply.code(400).send({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Session uses a different transport protocol' },
        id: null,
      });
    }

    try {
      // Hijack BEFORE passing to SDK — handlePostMessage writes directly to reply.raw
      reply.hijack();
      await session.transport.handlePostMessage(request.raw, reply.raw, request.body);
      console.log(`  POST /messages: handled OK`);
    } catch (err) {
      console.error(`  POST /messages ERROR: ${err.message}`);
    }
  });

  console.log('  MCP transports registered: Streamable HTTP at /mcp, SSE at /sse');
}
