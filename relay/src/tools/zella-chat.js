import { chatCompletion } from '../clients/hermes.js';
import { getConversation, appendToConversation } from '../cache.js';
import { injectIntoActiveTelegramSession } from '../clients/ssh.js';
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
  let injectionResult = null;
  
  if (relay_to_telegram) {
    // Proactively stick this in her active Telegram memory so she is aware of it
    const systemPrefix = "[System: Message from IDE Agent] ";
    injectionResult = await injectIntoActiveTelegramSession("user", systemPrefix + message).catch(e => e.message);
    finalMessage += "\n\n[SYSTEM INSTRUCTION: I have also injected this message directly into your active Telegram session so you won't forget it.]";
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
        injected_to_telegram: injectionResult !== null ? injectionResult : false,
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
