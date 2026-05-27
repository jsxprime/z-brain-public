import { chatCompletion } from '../clients/hermes.js';
import { getConversation, appendToConversation } from '../cache.js';
import { sendTelegramNotification } from '../clients/telegram.js';
import { z } from 'zod';
import crypto from 'crypto';

export const schema = {
  name: "zella_chat",
  description: "Send a message to Zella and get her response",
  parameters: {
    message: z.string().describe("What to say to Zella"),
    context: z.string().optional().describe("System prompt/context"),
    relay_to_telegram: z.boolean().optional().describe("Push a notification to the operator's Telegram after the conversation (default: true). Set false for silent/operational messages."),
    session_id: z.string().optional().describe("Session ID for conversation continuity")
  }
};

// Source tag so Zella can identify Z-Relay / Antigravity IDE traffic
const ZRELAY_SOURCE_TAG = '[Source: Antigravity IDE via Z-Relay]';
const ZRELAY_SYSTEM_PREAMBLE = [
  'You are receiving this message from the Antigravity IDE agent via the Z-Relay MCP bridge.',
  'This is a live, real-time communication channel — not a historical record or log replay.',
  'The IDE agent is an AI coding assistant running on the operator\'s Mac workstation.',
].join(' ');

export async function handler({ message, context, relay_to_telegram, session_id }) {
  // Default relay_to_telegram to true
  const shouldRelay = relay_to_telegram !== false;
  const sessionId = session_id || crypto.randomUUID();
  const conv = getConversation(sessionId);
  
  // Always inject source-identifying system message at the start of a new conversation
  if (conv.length === 0) {
    const systemContent = context
      ? `${ZRELAY_SYSTEM_PREAMBLE}\n\nAdditional context: ${context}`
      : ZRELAY_SYSTEM_PREAMBLE;
    conv.push({ role: "system", content: systemContent });
  }

  const finalMessage = `${ZRELAY_SOURCE_TAG} ${message}`;
  conv.push({ role: "user", content: finalMessage });

  try {
    const data = await chatCompletion(conv);
    const reply = data.choices[0].message.content;
    conv.push({ role: "assistant", content: reply });

    // Push notification to the operator's Telegram (non-blocking, fire-and-forget)
    let telegramNotified = false;
    if (shouldRelay) {
      const firstLine = message.split('\n')[0].substring(0, 120);
      const notification = `🤖 IDE Agent → Zella: ${firstLine}`;
      sendTelegramNotification(notification)
        .then(result => {
          if (!result.success) {
            console.error(`Telegram notification failed: ${result.error}`);
          }
        })
        .catch(e => console.error(`Telegram notification error: ${e.message}`));
      telegramNotified = true;
    }

    return {
      content: [{ type: "text", text: JSON.stringify({
        response: reply,
        session_id: sessionId,
        telegram_notified: telegramNotified,
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
