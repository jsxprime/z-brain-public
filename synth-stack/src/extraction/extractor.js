import { buildSystemPrompt, buildUserPrompt } from './prompts.js';

/**
 * Call the LLM to extract memory records from a raw event.
 *
 * @param {object} config - App config (config.llm.*)
 * @param {object} event - The raw event from the events table { source, payload }
 * @param {string[]} [availableDomains] - Domain names from OpenBrain for LLM domain selection.
 * @returns {Promise<Array<{type: string, content: string, domain: string, confidence: number}>>}
 * @throws {Error} If the LLM API returns a non-200 response or unparseable content
 */
export async function extractMemories(config, event, availableDomains = []) {
  const systemPrompt = buildSystemPrompt(availableDomains);
  const userPrompt = buildUserPrompt(event);

  const response = await fetch(config.llm.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2, // Low temperature for consistent structured output
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('LLM returned 200 but no message content — possible rate limit or empty response');
  }

  try {
    // Strip potential markdown code fences the LLM might wrap around JSON
    const cleaned = content.replace(/^```json?\n?/gm, '').replace(/\n?```$/gm, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      console.warn('LLM returned non-array response, treating as empty:', content);
      return [];
    }

    // Validate each record has required fields (domain is optional — falls back in commit layer)
    return parsed.filter(
      (record) =>
        record &&
        typeof record.type === 'string' &&
        typeof record.content === 'string' &&
        typeof record.confidence === 'number'
    );
  } catch (err) {
    throw new Error(`LLM returned unparseable JSON (${content.length} chars): ${err.message}`);
  }
}

