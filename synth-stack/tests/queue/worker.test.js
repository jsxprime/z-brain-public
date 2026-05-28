import { describe, it, expect, vi } from 'vitest';
import { createMockPool } from '../setup.js';

describe('queue/worker', () => {
  it('processBatch fetches pending events using SELECT FOR UPDATE SKIP LOCKED', async () => {
    const { processBatch } = await import('../../src/queue/worker.js');
    const pool = createMockPool();

    // Mock: no pending events
    const mockClient = {
      query: vi.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT (no events)
        .mockResolvedValueOnce({}), // COMMIT
      release: vi.fn(),
    };
    pool.connect.mockResolvedValueOnce(mockClient);

    const config = {
      worker: { batchSize: 10, maxRetries: 3 },
      llm: { apiUrl: 'http://test', apiKey: 'key', model: 'test' },
      openbrain: { url: 'http://test', domain: 'test' },
    };

    await processBatch(pool, config);

    // Verify it issued BEGIN and a SELECT with SKIP LOCKED
    const selectCall = mockClient.query.mock.calls[1];
    expect(selectCall[0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(selectCall[0]).toContain('pending');
  });
});
