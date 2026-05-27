import { handler as chatHandler } from './zella-chat.js';
import { z } from 'zod';

export const schema = {
  name: "zella_share",
  description: "Share a note or document with Zella",
  parameters: {
    content: z.string().describe("The note or document text"),
    title: z.string().optional().describe("Label for the shared content"),
    persist: z.boolean().optional().describe("Force storage in OpenBrain")
  }
};

export async function handler({ content, title, persist }) {
  // In v1, we route EVERYTHING through chat to keep it simple and immediate,
  // unless persist is true, which is a stretch goal.
  // We mock OpenBrain routing for now if persist is true.
  
  if (persist || content.length > 2000) {
    // Mock openbrain for v1, or actually connect to it if feasible
    // For now, we will just inform the user we are using chat.
    const message = `[Source: Antigravity IDE via Z-Relay] The IDE agent is sharing a large document titled "${title || 'Untitled'}". Content:\n\n${content}`;
    await chatHandler({ message, context: "Document shared from Antigravity IDE via Z-Relay.", session_id: "shared_docs" });
    
    return {
      content: [{ type: "text", text: JSON.stringify({ delivered_via: "chat (fallback from OpenBrain)", acknowledged: true }) }]
    };
  }

  // Short content
  const message = `[Source: Antigravity IDE via Z-Relay] Note shared: "${title || 'Untitled'}"\n\n${content}`;
  await chatHandler({ message, context: "Note shared from Antigravity IDE via Z-Relay.", session_id: "shared_docs" });

  return {
    content: [{ type: "text", text: JSON.stringify({ delivered_via: "chat", acknowledged: true }) }]
  };
}
