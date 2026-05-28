/**
 * Wiki.js webhook handler.
 *
 * Wiki.js can send webhooks on page:created, page:updated, page:deleted.
 * Docs: https://docs.requarks.io/webhooks
 *
 * We normalize into our canonical event format.
 */

const PAGE_EVENTS = new Set(['page:created', 'page:updated']);

/**
 * Parse a Wiki.js webhook payload into a canonical event.
 *
 * @param {object} payload - Raw Wiki.js webhook JSON body.
 * @returns {object|null} Canonical event, or null if ignored.
 */
export function parseWikiJsWebhook(payload) {
  if (!payload || !PAGE_EVENTS.has(payload.event) || !payload.page) {
    return null;
  }

  const page = payload.page;

  // Use page_id + updatedAt as the composite source_id.
  // This ensures each revision is a unique event (idempotent).
  const sourceId = `wikijs-page-${page.id}-${page.updatedAt}`;

  return {
    source: 'wikijs',
    sourceId,
    sourceUrl: null, // Wiki.js webhooks don't include the full URL; construct from config if needed
    payload: {
      event: payload.event,
      pageId: page.id,
      path: page.path,
      title: page.title,
      content: page.content,
      author: page.authorName,
      updatedAt: page.updatedAt,
    },
  };
}

/**
 * Register the Wiki.js webhook route on a Fastify instance.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {import('pg').Pool} pool
 * @param {object} config
 */
export function registerWikiJsWebhook(app, pool, config) {
  app.post('/webhooks/wikijs', async (request, reply) => {
    // Validate webhook secret
    const secret = request.query.secret || request.headers['x-wikijs-webhook-secret'];
    if (config.wikijs.webhookSecret && secret !== config.wikijs.webhookSecret) {
      return reply.code(401).send({ error: 'Invalid webhook secret' });
    }

    const parsed = parseWikiJsWebhook(request.body);
    if (!parsed) {
      return reply.code(200).send({ status: 'ignored' });
    }

    const { enqueueEvent } = await import('../queue/enqueue.js');
    const result = await enqueueEvent(pool, parsed);

    if (result.duplicate) {
      return reply.code(200).send({ status: 'duplicate', sourceId: parsed.sourceId });
    }

    return reply.code(201).send({ status: 'enqueued', id: result.id });
  });
}
