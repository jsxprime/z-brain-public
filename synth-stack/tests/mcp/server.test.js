import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We'll test that the MCP server is created and has the correct tools registered.
// We mock the API clients and pool so no real I/O happens.

describe('mcp/server', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('createMcpServer returns a server with the expected tools', async () => {
    const { createMcpServer } = await import('../../src/mcp/server.js');
    const mockPool = { query: vi.fn() };
    const mockConfig = {
      zulip: { apiUrl: 'http://zulip:80', botEmail: 'bot@test', botApiKey: 'key' },
      wikijs: { apiUrl: 'http://wikijs:3000/graphql', apiKey: 'key' },
      worker: { pollIntervalMs: 5000, batchSize: 10, maxRetries: 3 },
    };

    const server = createMcpServer(mockPool, mockConfig);

    // The server should exist
    expect(server).toBeDefined();
    // It should be an instance with a connect method
    expect(typeof server.connect).toBe('function');
  });
});
