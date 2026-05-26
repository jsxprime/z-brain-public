export const conversationCache = new Map();

export function getConversation(sessionId) {
  if (!conversationCache.has(sessionId)) {
    conversationCache.set(sessionId, []);
  }
  return conversationCache.get(sessionId);
}

export function appendToConversation(sessionId, message) {
  const conv = getConversation(sessionId);
  conv.push(message);
  // Simple token limit logic could be added here later
}
