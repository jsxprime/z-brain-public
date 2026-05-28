/**
 * Zulip webhook handler.
 *
 * Zulip sends outgoing webhooks as POST with a JSON body.
 * Docs: https://zulip.com/api/outgoing-webhooks
 *
 * We normalize the Zulip payload into our canonical event format
 * before enqueuing it.
 */

/**
 * Parse a Zulip webhook payload into a canonical event.
 *
 * @param {object} payload - Raw Zulip webhook JSON body.
 * @returns {object|null} Canonical event, or null if we should ignore this event.
 */
export function parseZulipWebhook(payload) {
  // Only process actual messages (not heartbeats, typing indicators, etc.)
  if (!payload || payload.type !== 'message' || !payload.message) {
    return null;
  }

  const msg = payload.message;

  return {
    source: 'zulip',
    sourceId: `zulip-msg-${msg.id}`,
    sourceUrl: null, // Zulip outgoing webhooks don't include a permalink; construct later if needed
    payload: {
      messageId: msg.id,
      stream: msg.display_recipient || null,
      topic: msg.subject || null,
      sender: msg.sender_full_name || msg.sender_email,
      content: msg.content,
      timestamp: msg.timestamp,
      type: msg.type, // 'stream' or 'private'
    },
  };
}

/**
 * Register the Zulip webhook route on a Fastify instance.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {import('pg').Pool} pool
 * @param {object} config
 */
export function registerZulipWebhook(app, pool, config) {
  app.post('/webhooks/zulip', async (request, reply) => {
    // Optional: validate webhook secret via query param or header
    const secret = request.query.secret || request.headers['x-zulip-webhook-secret'];
    if (config.zulip.webhookSecret && secret !== config.zulip.webhookSecret) {
      return reply.code(401).send({ error: 'Invalid webhook secret' });
    }

    const parsed = parseZulipWebhook(request.body);
    if (!parsed) {
      // Acknowledge but ignore non-message events
      return reply.code(200).send({ status: 'ignored' });
    }

    // Lazy import to avoid circular deps
    const { enqueueEvent } = await import('../queue/enqueue.js');
    const result = await enqueueEvent(pool, parsed);

    if (result.duplicate) {
      return reply.code(200).send({ status: 'duplicate', sourceId: parsed.sourceId });
    }

    return reply.code(201).send({ status: 'enqueued', id: result.id });
  });
}
