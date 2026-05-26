import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config({ path: '/opt/data/.env' });

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const allowedUsers = process.env.TELEGRAM_ALLOWED_USERS ? process.env.TELEGRAM_ALLOWED_USERS.split(',') : [];
const homeChannel = process.env.TELEGRAM_HOME_CHANNEL || allowedUsers[0];

if (!botToken) {
  console.error("Missing TELEGRAM_BOT_TOKEN in environment.");
  process.exit(1);
}

const server = new McpServer({
  name: "telegram_push",
  version: "1.0.0"
});

server.tool(
  "send_telegram_notification",
  "Push a direct Telegram message to the user. Use this when you are specifically asked to proactively notify the user.",
  {
    message: z.string().describe("The text message to send to the user.")
  },
  async ({ message }) => {
    try {
      const targetChat = homeChannel;
      if (!targetChat) {
        return { content: [{ type: "text", text: "Error: No target chat ID configured in environment." }], isError: true };
      }

      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChat,
          text: message
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        return {
          content: [{ type: "text", text: `Failed to send Telegram message: ${JSON.stringify(data)}` }],
          isError: true
        };
      }

      return {
        content: [{ type: "text", text: "Successfully pushed notification to Telegram!" }]
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Exception while sending Telegram message: ${e.message}` }],
        isError: true
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Telegram Push MCP Server running on stdio.");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
