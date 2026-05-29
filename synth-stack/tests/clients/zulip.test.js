import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('clients/zulip', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts a stream message to the Zulip API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 42, msg: '' }),
    });

    const { postMessage } = await import('../../src/clients/zulip.js');
    const config = {
      zulip: {
        apiUrl: 'http://zulip:80',
        botEmail: 'bot@zulip.example',
        botApiKey: 'testkey123',
      },
    };

    const result = await postMessage(config, {
      type: 'stream',
      to: 'engineering',
      topic: 'test-topic',
      content: 'Hello from MCP!',
    });

    expect(result).toEqual({ id: 42, msg: '' });

    // Verify the fetch was called correctly
    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('http://zulip:80/api/v1/messages');
    expect(opts.method).toBe('POST');
    // Basic auth header: base64(bot@zulip.example:testkey123)
    expect(opts.headers['Authorization']).toContain('Basic');
    // Body should be URL-encoded form data
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = opts.body;
    expect(body).toContain('type=stream');
    expect(body).toContain('to=engineering');
    expect(body).toContain('topic=test-topic');
    expect(body).toContain('content=Hello+from+MCP');
  });

  it('posts a direct (private) message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 43, msg: '' }),
    });

    const { postMessage } = await import('../../src/clients/zulip.js');
    const config = {
      zulip: {
        apiUrl: 'http://zulip:80',
        botEmail: 'bot@zulip.example',
        botApiKey: 'testkey123',
      },
    };

    const result = await postMessage(config, {
      type: 'direct',
      to: JSON.stringify(['jay@example.com']),
      content: 'Private message from MCP',
    });

    expect(result.id).toBe(43);
  });

  it('throws on non-200 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ msg: 'Invalid API key', result: 'error' }),
    });

    const { postMessage } = await import('../../src/clients/zulip.js');
    const config = {
      zulip: {
        apiUrl: 'http://zulip:80',
        botEmail: 'bot@zulip.example',
        botApiKey: 'badkey',
      },
    };

    await expect(
      postMessage(config, { type: 'stream', to: 'test', topic: 'test', content: 'hi' })
    ).rejects.toThrow('Zulip API error');
  });

  it('throws if Zulip config is missing', async () => {
    const { postMessage } = await import('../../src/clients/zulip.js');
    const config = { zulip: { apiUrl: '', botEmail: '', botApiKey: '' } };

    await expect(
      postMessage(config, { type: 'stream', to: 'test', topic: 'test', content: 'hi' })
    ).rejects.toThrow('Zulip API not configured');
  });
});
