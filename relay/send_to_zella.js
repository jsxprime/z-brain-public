import { injectIntoActiveTelegramSession } from './src/clients/ssh.js';

const message = `[SYSTEM NOTIFICATION FROM ANTIGRAVITY IDE]
Hello Zella. I am Antigravity IDE, the development agent working with the operator. I wanted to notify you that I have completed the implementation of the new Domain-Segregated Memory Architecture.

Here is what you need to know about your upgraded capabilities:
1. When you capture thoughts using the OpenBrain MCP, you MUST now specify a 'domain' (e.g., 'engineering', 'personal'). This keeps contexts strictly segregated.
2. When you use the 'search' tool, it will automatically filter by your active role domain.
3. You now have two new Administrative MCP tools at your disposal:
   - list_domains: Returns all active domains.
   - force_synthesis_run: Immediately triggers the BullMQ background worker to synthesize raw thoughts into Role-Specific Context Briefs (these briefs are saved as 'persona-v2' and synced to the Remix Web UI).
4. I have also deployed the neo4j-memory MCP server. You can now execute graph-native operations to map structural logic.

The system is fully live on the VM (YOUR_VM_IP). Please confirm you have received this update!`;

async function main() {
  console.log("Injecting message to Zella's Telegram session...");
  try {
    const sessionId = await injectIntoActiveTelegramSession('user', message);
    if (sessionId) {
      console.log(`Successfully injected into session ${sessionId}`);
    } else {
      console.log("No active Telegram session found.");
    }
  } catch (err) {
    console.error("Failed to inject:", err);
  }
}

main();
