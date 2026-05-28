import { describe, it, expect } from 'vitest';

describe('webhooks/wikijs', () => {
  it('extracts page_id and revision from a Wiki.js page update event', async () => {
    const { parseWikiJsWebhook } = await import('../../src/webhooks/wikijs.js');

    const wikijsPayload = {
      event: 'page:updated',
      page: {
        id: 42,
        path: 'homelab/docker-templates/traefik',
        title: 'Traefik Docker Compose Template',
        content: '# Traefik\n\n```yaml\nversion: "3"\nservices:\n  traefik:\n    image: traefik:v3\n```',
        updatedAt: '2026-05-28T18:00:00Z',
        authorName: 'the operator',
      },
    };

    const parsed = parseWikiJsWebhook(wikijsPayload);

    expect(parsed.source).toBe('wikijs');
    expect(parsed.sourceId).toBe('wikijs-page-42-2026-05-28T18:00:00Z');
    expect(parsed.payload.pageId).toBe(42);
    expect(parsed.payload.path).toBe('homelab/docker-templates/traefik');
    expect(parsed.payload.title).toBe('Traefik Docker Compose Template');
    expect(parsed.payload.content).toContain('traefik:v3');
  });

  it('handles page:created events', async () => {
    const { parseWikiJsWebhook } = await import('../../src/webhooks/wikijs.js');

    const payload = {
      event: 'page:created',
      page: {
        id: 43,
        path: 'homelab/commands/ssh',
        title: 'Useful SSH Commands',
        content: '# SSH\n\nssh-keygen -t ed25519',
        updatedAt: '2026-05-28T19:00:00Z',
        authorName: 'the operator',
      },
    };

    const parsed = parseWikiJsWebhook(payload);
    expect(parsed).not.toBeNull();
    expect(parsed.sourceId).toBe('wikijs-page-43-2026-05-28T19:00:00Z');
  });

  it('returns null for non-page events', async () => {
    const { parseWikiJsWebhook } = await import('../../src/webhooks/wikijs.js');

    const parsed = parseWikiJsWebhook({ event: 'user:login', user: {} });
    expect(parsed).toBeNull();
  });
});
