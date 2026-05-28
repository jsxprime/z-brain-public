/**
 * Prompt templates for the LLM extraction stage.
 *
 * The LLM receives a normalized event (chat message or wiki page)
 * and returns structured JSON describing what memories to extract.
 */

export const SYSTEM_PROMPT = `You are a Memory Curator for the Z-Brain ecosystem.
Your job is to analyze incoming events (chat messages and wiki pages) and extract
durable memories that should be preserved for future context retrieval.

You MUST respond with valid JSON only. No markdown, no explanation.

For each event, extract zero or more memory records. Each record has:
- "type": one of "decision", "snippet", "command", "summary", "reference"
- "content": the extracted memory text, written for future retrieval
- "confidence": 0.0 to 1.0 — how confident you are this is worth preserving

Guidelines:
- "decision": A choice or conclusion reached in conversation (e.g., "We chose Zulip over Mattermost for chat")
- "snippet": A code block, Docker template, config fragment worth saving
- "command": A specific CLI command or one-liner worth remembering
- "summary": A high-level summary of a conversation topic or wiki page
- "reference": A URL, tool name, or external resource mentioned

Rules:
- Do NOT extract trivial greetings, small talk, or filler
- Do NOT extract information that is already well-known or obvious
- If the event contains nothing worth remembering, return an empty array
- Confidence < 0.6 will be quarantined for human review
- Write each memory as if someone will search for it months from now`;

/**
 * Build the user prompt for a given event.
 *
 * @param {object} event - The canonical event payload from the events table.
 * @returns {string} The user prompt.
 */
export function buildUserPrompt(event) {
  if (event.source === 'zulip') {
    return `Extract memories from this Zulip chat message:

Stream: ${event.payload.stream || 'unknown'}
Topic: ${event.payload.topic || 'unknown'}
Sender: ${event.payload.sender || 'unknown'}
Content:
${event.payload.content}

Respond with a JSON array of memory objects. Example:
[{"type": "decision", "content": "Team decided to use Postgres for the event queue", "confidence": 0.9}]

If nothing is worth extracting, respond with: []`;
  }

  if (event.source === 'wikijs') {
    return `Extract memories from this Wiki.js page:

Title: ${event.payload.title || 'untitled'}
Path: ${event.payload.path || 'unknown'}
Author: ${event.payload.author || 'unknown'}
Content:
${event.payload.content}

Respond with a JSON array of memory objects. Example:
[{"type": "snippet", "content": "Docker compose template for Traefik reverse proxy: ...", "confidence": 0.95}]

If nothing is worth extracting, respond with: []`;
  }

  return `Extract memories from this event:\n${JSON.stringify(event.payload, null, 2)}\n\nRespond with a JSON array.`;
}
