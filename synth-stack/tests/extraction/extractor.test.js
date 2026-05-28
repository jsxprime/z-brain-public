import { describe, it, expect, vi } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('extraction/extractor', () => {
  it('calls the LLM API and parses the JSON response', async () => {
    const { extractMemories } = await import('../../src/extraction/extractor.js');

    const llmResponse = [
      { type: 'decision', content: 'Team chose Zulip over Mattermost', confidence: 0.92 },
      { type: 'command', content: 'docker compose up -d', confidence: 0.85 },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(llmResponse) } }],
      }),
    });

    const config = {
      llm: {
        apiUrl: 'http://localhost:8642/v1/chat/completions',
        apiKey: 'test-key',
        model: 'gpt-5.4-mini',
      },
    };

    const event = {
      source: 'zulip',
      payload: {
        stream: 'engineering',
        topic: 'chat-selection',
        sender: 'the operator',
        content: 'We decided to go with Zulip. Also run: docker compose up -d',
      },
    };

    const results = await extractMemories(config, event);

    expect(results).toHaveLength(2);
    expect(results[0].type).toBe('decision');
    expect(results[0].confidence).toBe(0.92);
    expect(results[1].type).toBe('command');

    // Verify fetch was called with correct URL and auth
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8642/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      })
    );
  });

  it('returns empty array when LLM returns empty extraction', async () => {
    const { extractMemories } = await import('../../src/extraction/extractor.js');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '[]' } }],
      }),
    });

    const config = {
      llm: {
        apiUrl: 'http://localhost:8642/v1/chat/completions',
        apiKey: 'test-key',
        model: 'gpt-5.4-mini',
      },
    };

    const event = {
      source: 'zulip',
      payload: { stream: 'general', topic: 'greetings', sender: 'the operator', content: 'hello!' },
    };

    const results = await extractMemories(config, event);
    expect(results).toEqual([]);
  });

  it('throws on LLM API error', async () => {
    const { extractMemories } = await import('../../src/extraction/extractor.js');

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const config = {
      llm: {
        apiUrl: 'http://localhost:8642/v1/chat/completions',
        apiKey: 'test-key',
        model: 'gpt-5.4-mini',
      },
    };

    const event = {
      source: 'zulip',
      payload: { stream: 'general', topic: 'test', sender: 'the operator', content: 'test' },
    };

    await expect(extractMemories(config, event)).rejects.toThrow('LLM API error');
  });
});
