/**
 * Standalone MCP server using Node's raw http module.
 * 
 * DIAGNOSTIC: Bypass ALL frameworks (Express, Fastify) to eliminate
 * any framework-level interference with the SSE response stream.
 */

import http from 'http';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer } from './server.js';

export function startMcpServer(pool, config, port = 3081) {
  const sessions = {};

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    // ── GET /sse ──
    if (req.method === 'GET' && url.pathname === '/sse') {
      console.log(`  [MCP-RAW] SSE connection from ${req.socket.remoteAddress}`);
      
      // Disable ALL Node timeouts on this socket
      req.socket.setTimeout(0);
      req.socket.setKeepAlive(true, 30000);
      
      const transport = new SSEServerTransport('/messages', res);
      const mcpServer = createMcpServer(pool, config);

      // Log transport lifecycle
      transport.onclose = () => console.log(`  [MCP-RAW] transport.onclose: ${transport.sessionId}`);
      transport.onerror = (err) => console.error(`  [MCP-RAW] transport.onerror:`, err);

      sessions[transport.sessionId] = { transport, server: mcpServer };

      res.on('close', () => {
        console.log(`  [MCP-RAW] res.close: ${transport.sessionId}`);
        delete sessions[transport.sessionId];
      });

      await mcpServer.connect(transport);
      console.log(`  [MCP-RAW] session ready: ${transport.sessionId}`);
      // Handler doesn't return — res stays open via SSE
      return;
    }

    // ── POST /messages ──
    if (req.method === 'POST' && url.pathname === '/messages') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId || !sessions[sessionId]) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing session ID' }));
        return;
      }

      // Collect body
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      const parsed = JSON.parse(body);
      console.log(`  [MCP-RAW] <<< ${parsed.method || 'response'} id=${parsed.id ?? '-'}`);

      const { transport } = sessions[sessionId];
      await transport.handlePostMessage(req, res, parsed);
      console.log(`  [MCP-RAW] >>> ${parsed.method || 'response'} OK`);
      return;
    }

    // ── GET /health ──
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', sessions: Object.keys(sessions).length }));
      return;
    }

    // ── 404 ──
    res.writeHead(404);
    res.end('Not found');
  });

  // Disable server-level timeouts that could kill SSE connections
  server.timeout = 0;
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.keepAliveTimeout = 0;

  server.listen(port, '0.0.0.0', () => {
    console.log(`  [MCP-RAW] Raw Node HTTP server listening on port ${port}`);
  });

  return server;
}
