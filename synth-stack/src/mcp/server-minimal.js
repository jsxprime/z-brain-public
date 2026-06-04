/**
 * MINIMAL MCP Server — ONE trivial tool for diagnostic testing.
 * 
 * If Hermes connects to this → the real server's tool schemas are the problem.
 * If Hermes fails on this too → it's a lifecycle/transport issue.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function createMcpServer(_pool, _config) {
  const server = new McpServer({
    name: 'z-brain-synth-mcp',
    version: '0.1.0',
  });

  server.tool(
    'ping',
    'Returns pong. Used for connectivity testing.',
    {},
    async () => ({
      content: [{ type: 'text', text: 'pong' }],
    })
  );

  return server;
}
