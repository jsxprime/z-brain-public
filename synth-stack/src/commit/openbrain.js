/**
 * Commit an extracted memory to OpenBrain.
 *
 * OpenBrain's `capture` tool accepts:
 *   { content: string, domain: string }
 *
 * We append provenance metadata to the content so that the memory
 * can be traced back to its source (Zulip message, Wiki.js page, etc.)
 *
 * @param {object} config - App config (config.openbrain.*)
 * @param {object} memory - Extracted memory { type, content, confidence }
 * @param {object} provenance - Source metadata { source, sourceId, stream?, topic?, path?, title? }
 * @returns {Promise<{thoughtId: string}>}
 * @throws {Error} If OpenBrain returns a non-200 response.
 */
export async function commitToOpenBrain(config, memory, provenance) {
  // Build a rich content string with provenance trail
  const provenanceLine = [
    `[source: ${provenance.source}`,
    provenance.stream ? `stream: ${provenance.stream}` : null,
    provenance.topic ? `topic: ${provenance.topic}` : null,
    provenance.path ? `path: ${provenance.path}` : null,
    provenance.title ? `title: ${provenance.title}` : null,
    `id: ${provenance.sourceId}]`,
  ]
    .filter(Boolean)
    .join(', ');

  const enrichedContent = `[${memory.type}] ${memory.content}\n\n${provenanceLine}`;

  // OpenBrain MCP capture endpoint
  // The MCP server at openbrain-server:3040 exposes a JSON-RPC interface.
  // For direct HTTP integration, we use the tool's expected input format.
  const response = await fetch(`${config.openbrain.url}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: enrichedContent,
      domain: config.openbrain.domain,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenBrain commit failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return { thoughtId: data.id || null };
}
