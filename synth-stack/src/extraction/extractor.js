import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';

/**
 * Call the LLM to extract memory records from a raw event.
 *
 * @param {object} config - App config (config.llm.*)
 * @param {object} event - The raw event from the events table { source, payload }
 * @returns {Promise<Array<{type: string, content: string, confidence: number}>>}
 * @throws {Error} If the LLM API returns a non-200 response
 */
export async function extractMemories(config, event) {
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
        { role: 'system', content: SYSTEM_PROMPT },
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
    return [];
  }

  try {
    // Strip potential markdown code fences the LLM might wrap around JSON
    const cleaned = content.replace(/^```json?\n?/gm, '').replace(/\n?```$/gm, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      console.warn('LLM returned non-array response, treating as empty:', content);
      return [];
    }

    // Validate each record has required fields
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
