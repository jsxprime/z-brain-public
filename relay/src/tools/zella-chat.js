import { chatCompletion } from '../clients/hermes.js';
import { getConversation, appendToConversation } from '../cache.js';
import { z } from 'zod';
import crypto from 'crypto';

export const schema = {
  name: "zella_chat",
  description: "Send a message to Zella and get her response",
  parameters: {
    message: z.string().describe("What to say to Zella"),
    context: z.string().optional().describe("System prompt/context"),
    relay_to_telegram: z.boolean().optional().describe("Ask Zella to forward to Telegram"),
    session_id: z.string().optional().describe("Session ID for conversation continuity")
  }
};

export async function handler({ message, context, relay_to_telegram, session_id }) {
  const sessionId = session_id || crypto.randomUUID();
  const conv = getConversation(sessionId);
  
  if (conv.length === 0 && context) {
    conv.push({ role: "system", content: context });
  }

  let finalMessage = message;
  if (relay_to_telegram) {
    finalMessage += "\n\n[SYSTEM INSTRUCTION: Please send a summary of this interaction to the user via Telegram.]";
  }

  conv.push({ role: "user", content: finalMessage });

  try {
    const data = await chatCompletion(conv);
    const reply = data.choices[0].message.content;
    conv.push({ role: "assistant", content: reply });

    return {
      content: [{ type: "text", text: JSON.stringify({
        response: reply,
        session_id: sessionId,
        usage: data.usage
      }, null, 2) }]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error communicating with Zella: ${error.message}` }],
      isError: true
    };
  }
}
