import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('clients/wikijs', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates a new page via GraphQL mutation', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          pages: {
            create: {
              responseResult: { succeeded: true, errorCode: 0, message: '' },
              page: { id: 101, path: 'homelab/test', title: 'Test Page' },
            },
          },
        },
      }),
    });

    const { createPage } = await import('../../src/clients/wikijs.js');
    const config = {
      wikijs: {
        apiUrl: 'http://wikijs:3000/graphql',
        apiKey: 'wikijs-test-key',
      },
    };

    const result = await createPage(config, {
      path: 'homelab/test',
      title: 'Test Page',
      content: '# Test\n\nHello world',
      description: 'A test page',
    });

    expect(result.succeeded).toBe(true);
    expect(result.page.id).toBe(101);

    // Verify GraphQL mutation was sent
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('http://wikijs:3000/graphql');
    expect(opts.headers['Authorization']).toBe('Bearer wikijs-test-key');
    const body = JSON.parse(opts.body);
    expect(body.query).toContain('mutation');
    expect(body.query).toContain('create');
  });

  it('updates an existing page via GraphQL mutation', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          pages: {
            update: {
              responseResult: { succeeded: true, errorCode: 0, message: '' },
              page: { id: 101, path: 'homelab/test', title: 'Updated Title' },
            },
          },
        },
      }),
    });

    const { updatePage } = await import('../../src/clients/wikijs.js');
    const config = {
      wikijs: {
        apiUrl: 'http://wikijs:3000/graphql',
        apiKey: 'wikijs-test-key',
      },
    };

    const result = await updatePage(config, {
      id: 101,
      title: 'Updated Title',
      content: '# Updated\n\nNew content',
      description: 'Updated description',
    });

    expect(result.succeeded).toBe(true);
    expect(result.page.title).toBe('Updated Title');
  });

  it('throws on GraphQL error response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          pages: {
            create: {
              responseResult: { succeeded: false, errorCode: 1, message: 'Page already exists' },
              page: null,
            },
          },
        },
      }),
    });

    const { createPage } = await import('../../src/clients/wikijs.js');
    const config = {
      wikijs: { apiUrl: 'http://wikijs:3000/graphql', apiKey: 'key' },
    };

    await expect(
      createPage(config, { path: 'test', title: 'Test', content: 'hi' })
    ).rejects.toThrow('Page already exists');
  });

  it('throws if Wiki.js config is missing', async () => {
    const { createPage } = await import('../../src/clients/wikijs.js');
    const config = { wikijs: { apiUrl: '', apiKey: '' } };

    await expect(
      createPage(config, { path: 'test', title: 'Test', content: 'hi' })
    ).rejects.toThrow('Wiki.js API not configured');
  });
});
