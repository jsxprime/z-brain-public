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
        .mockResolvedValueOnce({ rows: [{ value: 'false' }] }) // SELECT system_config
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
    const selectCall = mockClient.query.mock.calls[2];
    expect(selectCall[0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(selectCall[0]).toContain('pending');
  });

  it('processBatch skips processing when worker is paused', async () => {
    const { processBatch } = await import('../../src/queue/worker.js');
    const pool = createMockPool();

    // Mock: system_config says worker is paused
    const mockClient = {
      query: vi.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ value: 'true' }] }) // SELECT system_config
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

    // Should have checked the pause flag but NOT issued the SELECT FOR UPDATE query
    const queries = mockClient.query.mock.calls.map(c => c[0]);
    expect(queries).toContain('BEGIN');
    // The pause check query
    expect(queries.some(q => typeof q === 'string' && q.includes('system_config'))).toBe(true);
    // Should NOT have the SKIP LOCKED query
    expect(queries.some(q => typeof q === 'string' && q.includes('SKIP LOCKED'))).toBe(false);
  });
});
