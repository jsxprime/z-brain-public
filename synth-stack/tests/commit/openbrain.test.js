import { describe, it, expect, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('commit/openbrain', () => {
  it('posts a memory to OpenBrain capture endpoint', async () => {
    const { commitToOpenBrain } = await import('../../src/commit/openbrain.js');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'thought-uuid-123' }),
    });

    const config = {
      openbrain: {
        url: 'http://openbrain-server:3040',
        domain: 'synthesizer',
      },
    };

    const memory = {
      type: 'decision',
      content: 'Team chose Zulip over Mattermost for the Z-Brain ecosystem chat service',
      confidence: 0.92,
    };

    const provenance = {
      source: 'zulip',
      sourceId: 'zulip-msg-99001',
      stream: 'engineering',
      topic: 'chat-selection',
    };

    const result = await commitToOpenBrain(config, memory, provenance);

    expect(result.thoughtId).toBe('thought-uuid-123');

    // Verify the content sent to OpenBrain includes provenance
    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.content).toContain('Team chose Zulip');
    expect(body.content).toContain('[source: zulip');
    expect(body.domain).toBe('synthesizer');
  });

  it('throws on OpenBrain API error', async () => {
    const { commitToOpenBrain } = await import('../../src/commit/openbrain.js');

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    const config = { openbrain: { url: 'http://localhost:3040', domain: 'test' } };
    const memory = { type: 'summary', content: 'test', confidence: 1.0 };
    const provenance = { source: 'zulip', sourceId: 'test-123' };

    await expect(commitToOpenBrain(config, memory, provenance)).rejects.toThrow(
      'OpenBrain commit failed'
    );
  });
});
