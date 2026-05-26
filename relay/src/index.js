import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as zellaStatus from "./tools/zella-status.js";

export function createServer() {
  const server = new McpServer({
    name: "z-relay",
    version: "1.0.0"
  });

  server.tool(
    zellaStatus.schema.name,
    zellaStatus.schema.description,
    zellaStatus.handler
  );

  return server;
}

export async function run() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("z-relay MCP server running");
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  run().catch(console.error);
}
