/**
 * OpenBrain Capture — MCP-based async turn capture
 *
 * OpenBrain is an MCP server (SSE transport). For each capture:
 *   1. Opens a fresh SSE connection to get a session
 *   2. Calls the `capture` tool via MCP JSON-RPC /message endpoint
 *   3. Closes the connection
 *
 * This per-capture connection approach avoids session expiry issues.
 */

const OPENBRAIN_URL = process.env.OPENBRAIN_CAPTURE_URL || 'http://YOUR_VM_IP:3040';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

// ---------------------------------------------------------------------------
// MCP SSE capture — fresh connection per call
// ---------------------------------------------------------------------------

let rpcId = 1;

/** Open SSE, extract message endpoint, call capture, done */
async function mcpCapture(content, domain) {
  // Step 1: Open SSE to get the session endpoint URL
  const controller = new AbortController();
  const sseTimeout = setTimeout(() => controller.abort(), 10000);

  let messageEndpoint = null;

  try {
    const sseRes = await fetch(`${OPENBRAIN_URL}/sse`, {
      signal: controller.signal,
    });

    if (!sseRes.ok) {
      throw new Error(`SSE connect failed: ${sseRes.status}`);
    }

    // Read just enough to get the endpoint URL from the first SSE event
    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (!messageEndpoint) {
      const { done, value } = await reader.read();
      if (done) throw new Error('SSE stream ended before endpoint received');

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ') && line.includes('/message')) {
          const data = line.slice(6).trim();
          messageEndpoint = new URL(data, OPENBRAIN_URL).toString();
          break;
        }
      }
    }

    clearTimeout(sseTimeout);

    // Step 2: Call the capture tool via MCP JSON-RPC
    // IMPORTANT: Keep SSE connection alive while we make the POST
    const id = rpcId++;
    const callRes = await fetch(messageEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name: 'capture',
          arguments: { content, domain },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!callRes.ok) {
      const errText = await callRes.text();
      throw new Error(`MCP POST failed: ${callRes.status} ${errText}`);
    }

    // MCP SSE transport returns "Accepted" (plain text) for async tool calls
    // The actual result comes back via the SSE stream, but we don't need it
    const responseText = await callRes.text();
    if (responseText.trim() === 'Accepted' || callRes.status === 202) {
      // Success — the capture was accepted
      reader.cancel().catch(() => {});
      return { accepted: true };
    }

    // Try parsing as JSON for synchronous responses
    try {
      const result = JSON.parse(responseText);
      if (result.error) {
        throw new Error(`MCP error: ${JSON.stringify(result.error)}`);
      }
      reader.cancel().catch(() => {});
      return result;
    } catch {
      // If it's not JSON and not "Accepted", treat as success if 2xx
      reader.cancel().catch(() => {});
      return { accepted: true, raw: responseText };
    }
  } finally {
    clearTimeout(sseTimeout);
    controller.abort(); // ensure cleanup
  }
}

// ---------------------------------------------------------------------------
// Payload formatting and retry logic
// ---------------------------------------------------------------------------

const retryQueue = [];
let retryTimer = null;

function startRetryLoop() {
  if (retryTimer) return;
  retryTimer = setInterval(async () => {
    if (retryQueue.length === 0) {
      clearInterval(retryTimer);
      retryTimer = null;
      return;
    }
    const item = retryQueue.shift();
    try {
      await doCapture(item.payload);
      console.log(`[OpenBrain] Retry succeeded for ${item.payload.cli}/${item.payload.thread}`);
    } catch (err) {
      item.retries++;
      if (item.retries < MAX_RETRIES) {
        retryQueue.push(item);
        console.error(`[OpenBrain] Retry ${item.retries}/${MAX_RETRIES} failed for ${item.payload.cli}/${item.payload.thread}`);
      } else {
        console.error(`[OpenBrain] Giving up on capture for ${item.payload.cli}/${item.payload.thread} after ${MAX_RETRIES} retries`);
      }
    }
  }, RETRY_DELAY_MS);
}

async function doCapture(payload) {
  const { thread, cli, session_uuid, prompt, response, files_written, timestamp } = payload;

  const parts = [
    `[CLI Chat Turn — ${cli}]`,
    `Thread: ${thread}`,
    `Session: ${session_uuid || 'new'}`,
    `Timestamp: ${timestamp}`,
    '',
    `**User Prompt:**`,
    prompt,
    '',
    `**${cli} Response:**`,
    response,
  ];

  if (files_written && Object.keys(files_written).length > 0) {
    parts.push('', '**Files Written:**');
    for (const [filename, content] of Object.entries(files_written)) {
      parts.push(`\n--- ${filename} ---`);
      parts.push(content);
    }
  }

  const content = parts.join('\n');
  await mcpCapture(content, `cli-chat:${cli}`);
}

/**
 * Capture a CLI turn to OpenBrain.
 * Async, fire-and-forget with retry queue.
 */
export async function captureToOpenBrain(payload) {
  try {
    await doCapture(payload);
    console.log(`[OpenBrain] Captured turn for ${payload.cli}/${payload.thread}`);
  } catch (err) {
    console.error(`[OpenBrain] Initial capture failed for ${payload.cli}/${payload.thread}:`, err.message);
    retryQueue.push({ payload, retries: 0 });
    startRetryLoop();
  }
}
