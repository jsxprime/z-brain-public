import { describe, it, expect, vi } from 'vitest';

describe('mcp/transport', () => {
  it('registerMcpRoutes adds a POST /mcp route to the Fastify app', async () => {
    const { registerMcpRoutes } = await import('../../src/mcp/transport.js');

    // Minimal mock Fastify app
    const routes = [];
    const mockApp = {
      post: vi.fn((path, opts, handler) => {
        routes.push({ method: 'POST', path, handler: handler || opts });
      }),
      get: vi.fn((path, opts, handler) => {
        routes.push({ method: 'GET', path, handler: handler || opts });
      }),
      delete: vi.fn((path, opts, handler) => {
        routes.push({ method: 'DELETE', path, handler: handler || opts });
      }),
      addContentTypeParser: vi.fn(),
    };
    const mockPool = { query: vi.fn() };
    const mockConfig = {
      zulip: { apiUrl: '', botEmail: '', botApiKey: '' },
      wikijs: { apiUrl: '', apiKey: '' },
      worker: { pollIntervalMs: 5000, batchSize: 10, maxRetries: 3 },
    };

    registerMcpRoutes(mockApp, mockPool, mockConfig);

    // Verify the /mcp POST route was registered
    const mcpPostRoute = routes.find(r => r.method === 'POST' && r.path === '/mcp');
    expect(mcpPostRoute).toBeDefined();
  });
});
