/**
 * Push extracted memory into CORE's episodic pipeline via MCP Streamable HTTP.
 *
 * CORE exposes an MCP endpoint at /api/v1/mcp (Streamable HTTP transport).
 * We call memory_ingest directly using JSON-RPC, which queues the content
 * for entity/statement extraction and vector indexing.
 *
 * Protocol notes:
 *   - Must send Accept: 'application/json, text/event-stream'
 *   - First call must be 'initialize' to get an mcp-session-id header
 *   - Subsequent calls include the session ID header
 *   - Responses are SSE-formatted (event: message\ndata: {...})
 */

// Module-level MCP session cache (reused across batches within the same process)
let mcpSessionId = null;

/**
 * Parse an SSE response body to extract the JSON-RPC result.
 * Format: "event: message\ndata: {json}\n\n"
 */
function parseSSE(body) {
  const lines = body.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      return JSON.parse(line.slice(6));
    }
  }
  return null;
}

/**
 * Initialize an MCP session with CORE if we don't already have one.
 * Returns the mcp-session-id for subsequent calls.
 */
async function ensureMCPSession(config) {
  if (mcpSessionId) return mcpSessionId;

  const response = await fetch(config.core.mcpUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${config.core.mcpToken}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'synth-worker', version: '1.0.0' },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP initialize failed: ${response.status} ${response.statusText}`);
  }

  mcpSessionId = response.headers.get('mcp-session-id');
  if (!mcpSessionId) {
    throw new Error('MCP initialize response missing mcp-session-id header');
  }

  return mcpSessionId;
}

/**
 * Call a CORE MCP tool via Streamable HTTP.
 *
 * @param {object} config - App config (needs config.core.mcpUrl, config.core.mcpToken)
 * @param {string} toolName - MCP tool name (e.g., 'memory_ingest')
 * @param {object} toolArgs - Tool arguments
 * @returns {Promise<object>} The JSON-RPC result
 */
async function callMCPTool(config, toolName, toolArgs) {
  const sessionId = await ensureMCPSession(config);

  const response = await fetch(config.core.mcpUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${config.core.mcpToken}`,
      'Mcp-Session-Id': sessionId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: toolArgs },
    }),
  });

  if (!response.ok) {
    // Session might have expired — clear and let next call re-initialize
    if (response.status === 404 || response.status === 400) {
      mcpSessionId = null;
    }
    throw new Error(`MCP tools/call failed: ${response.status} ${response.statusText}`);
  }

  const body = await response.text();
  const parsed = parseSSE(body);

  if (!parsed) {
    throw new Error('MCP tools/call returned empty SSE response');
  }

  if (parsed.error) {
    throw new Error(`MCP tool error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
  }

  return parsed.result;
}

/**
 * Initialize a CORE conversation session for grouping ingested memories.
 *
 * @param {object} config
 * @returns {Promise<string>} sessionId for use with memory_ingest
 */
export async function initializeCORESession(config) {
  const result = await callMCPTool(config, 'initialize_conversation_session', {});
  // The tool returns the sessionId in its content
  const content = result?.content?.[0]?.text;
  if (!content) {
    throw new Error('initialize_conversation_session returned no content');
  }
  // Parse sessionId from response (format varies — try JSON first, then extract UUID)
  try {
    const parsed = JSON.parse(content);
    return parsed.sessionId || parsed.session_id || parsed.id;
  } catch {
    // Try to extract UUID pattern from text
    const match = content.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (match) return match[0];
    throw new Error(`Could not parse sessionId from: ${content}`);
  }
}

/**
 * Push extracted memory into CORE's episodic pipeline.
 *
 * @param {object} config - App config (needs config.core.*)
 * @param {string} content - The enriched memory content to ingest
 * @param {string} sessionId - CORE session ID for grouping
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function ingestIntoCORE(config, content, sessionId) {
  try {
    await callMCPTool(config, 'memory_ingest', {
      message: content,
      sessionId: sessionId,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
