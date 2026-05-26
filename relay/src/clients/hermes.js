import { config } from '../config.js';

export async function getHealth() {
  const response = await fetch(`${config.HERMES_API_URL}/health/detailed`);
  if (!response.ok) {
    throw new Error(`Hermes health check failed: ${response.statusText}`);
  }
  return response.json();
}

export async function chatCompletion(messages) {
  const response = await fetch(`${config.HERMES_API_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.HERMES_API_KEY}`
    },
    body: JSON.stringify({
      model: "hermes-agent",
      messages: messages,
      stream: false
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Hermes chat API failed: ${response.status} ${errText}`);
  }
  return response.json();
}
