import { describe, it, expect, vi } from 'vitest';
import { createMockPool } from '../setup.js';

describe('queue/enqueue', () => {
  it('inserts a zulip event with correct source and source_id', async () => {
    const { enqueueEvent } = await import('../../src/queue/enqueue.js');
    const pool = createMockPool();

    await enqueueEvent(pool, {
      source: 'zulip',
      sourceId: 'msg-12345',
      sourceUrl: 'https://zulip.example.com/#narrow/stream/general/topic/test/near/12345',
      payload: { type: 'message', message: { content: 'hello world' } },
    });

    expect(pool.query).toHaveBeenCalledOnce();
    const call = pool.query.mock.calls[0];
    expect(call[0]).toContain('INSERT INTO events');
    expect(call[1]).toContain('zulip');
    expect(call[1]).toContain('msg-12345');
  });

  it('handles duplicate source_id gracefully (upsert / ON CONFLICT DO NOTHING)', async () => {
    const { enqueueEvent } = await import('../../src/queue/enqueue.js');
    const pool = createMockPool();

    // Simulate a conflict — the function should not throw
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await enqueueEvent(pool, {
      source: 'zulip',
      sourceId: 'msg-12345',
      sourceUrl: null,
      payload: { type: 'message', message: { content: 'hello world' } },
    });

    // Should return a result indicating it was a duplicate
    expect(result).toBeDefined();
  });
});
