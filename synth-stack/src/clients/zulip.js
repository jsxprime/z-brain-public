/**
 * Zulip REST API client.
 *
 * Uses the Zulip POST /api/v1/messages endpoint.
 * Docs: https://zulip.com/api/send-message
 *
 * Authentication: HTTP Basic Auth with bot email + API key.
 */

/**
 * Post a message to Zulip.
 *
 * @param {object} config - App config (must have config.zulip.apiUrl, .botEmail, .botApiKey)
 * @param {object} params
 * @param {string} params.type - 'stream' or 'direct' (or 'private')
 * @param {string} params.to - Stream name (for stream) or JSON array of emails (for direct)
 * @param {string} [params.topic] - Topic name (required for stream messages)
 * @param {string} params.content - Message content (Zulip Markdown)
 * @returns {Promise<{id: number, msg: string}>}
 * @throws {Error} If config is missing or API returns an error.
 */
export async function postMessage(config, { type, to, topic, content }) {
  if (!config.zulip.apiUrl || !config.zulip.botEmail || !config.zulip.botApiKey) {
    throw new Error('Zulip API not configured: set ZULIP_API_URL, ZULIP_BOT_EMAIL, ZULIP_BOT_API_KEY');
  }

  const url = `${config.zulip.apiUrl}/api/v1/messages`;

  // Build URL-encoded form body (Zulip API expects form data, not JSON)
  const params = new URLSearchParams();
  params.set('type', type);
  params.set('to', to);
  if (topic) params.set('topic', topic);
  params.set('content', content);

  // HTTP Basic Auth: base64(email:apiKey)
  const credentials = Buffer.from(`${config.zulip.botEmail}:${config.zulip.botApiKey}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`Zulip API error: ${response.status} ${response.statusText} — ${errorBody.msg || 'unknown'}`);
  }

  return response.json();
}
