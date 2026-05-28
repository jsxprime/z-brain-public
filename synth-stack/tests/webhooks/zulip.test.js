import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPool } from '../setup.js';

describe('webhooks/zulip', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = createMockPool();
    // Simulate successful insert
    mockPool.query.mockResolvedValue({ rows: [{ id: 'test-uuid' }], rowCount: 1 });
  });

  it('extracts message_id and stream/topic from a Zulip message event', async () => {
    const { parseZulipWebhook } = await import('../../src/webhooks/zulip.js');

    const zulipPayload = {
      type: 'message',
      message: {
        id: 99001,
        sender_full_name: 'the operator',
        sender_email: 'jay@example.com',
        type: 'stream',
        display_recipient: 'engineering',
        subject: 'docker-templates',
        content: 'Here is a useful docker compose template for traefik...',
        timestamp: 1716900000,
      },
    };

    const parsed = parseZulipWebhook(zulipPayload);

    expect(parsed.sourceId).toBe('zulip-msg-99001');
    expect(parsed.source).toBe('zulip');
    expect(parsed.payload.stream).toBe('engineering');
    expect(parsed.payload.topic).toBe('docker-templates');
    expect(parsed.payload.sender).toBe('the operator');
    expect(parsed.payload.content).toBe('Here is a useful docker compose template for traefik...');
  });

  it('returns null for non-message events', async () => {
    const { parseZulipWebhook } = await import('../../src/webhooks/zulip.js');

    const heartbeatPayload = { type: 'heartbeat' };
    const parsed = parseZulipWebhook(heartbeatPayload);

    expect(parsed).toBeNull();
  });
});
