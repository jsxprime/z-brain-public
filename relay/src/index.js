import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as zellaStatus from "./tools/zella-status.js";
import * as zellaChat from "./tools/zella-chat.js";
import * as zellaFeed from "./tools/zella-feed.js";
import * as zellaBriefing from "./tools/zella-briefing.js";
import * as zellaShare from "./tools/zella-share.js";
import * as zellaRecall from "./tools/zella-recall.js";

export function createServer() {
  const server = new McpServer({
    name: "z-relay",
    version: "1.1.0"
  });

  server.tool(
    zellaStatus.schema.name,
    zellaStatus.schema.description,
    zellaStatus.handler
  );

  server.tool(
    zellaChat.schema.name,
    zellaChat.schema.description,
    zellaChat.schema.parameters,
    zellaChat.handler
  );

  server.tool(
    zellaFeed.schema.name,
    zellaFeed.schema.description,
    zellaFeed.schema.parameters,
    zellaFeed.handler
  );

  server.tool(
    zellaBriefing.schema.name,
    zellaBriefing.schema.description,
    zellaBriefing.handler
  );

  server.tool(
    zellaShare.schema.name,
    zellaShare.schema.description,
    zellaShare.schema.parameters,
    zellaShare.handler
  );

  server.tool(
    zellaRecall.schema.name,
    zellaRecall.schema.description,
    zellaRecall.schema.parameters,
    zellaRecall.handler
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
