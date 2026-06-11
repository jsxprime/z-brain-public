import { getConfig } from "../config.js";

export const schema = {
  name: "zella_recall",
  description:
    "Unified memory recall across all Z-Brain layers (OpenBrain, CORE episodes, Neo4j graph). " +
    "Returns merged, deduplicated, ranked results with provenance tags. " +
    "This is the primary way to query Z-Brain's memory from the IDE.",
  parameters: {
    query: {
      type: "string",
      description: "Natural language query — what context do you need?",
    },
    types: {
      type: "array",
      items: { type: "string" },
      description:
        'Optional: filter by memory type (decision, snippet, command, summary, reference, episode, entity, thought). Omit for all.',
      optional: true,
    },
    limit: {
      type: "number",
      description: "Max results (default 10, max 25).",
      optional: true,
    },
    layers: {
      type: "array",
      items: { type: "string" },
      description:
        'Optional: which layers to query (openbrain, core, graph). Default: all three.',
      optional: true,
    },
  },
};

/**
 * Call the recall MCP tool on the Hermes VM via the Hermes API.
 *
 * Since the recall MCP server runs inside the Hermes container, we ask
 * Zella to invoke it for us. We send a structured message that instructs
 * Zella to use the mcp_recall_recall tool and return the raw output.
 */
export async function handler({ query, types, limit, layers }) {
  const config = getConfig();

  // Build a precise instruction for Zella to invoke the recall tool
  const toolArgs = { query };
  if (types && types.length > 0) toolArgs.types = types;
  if (limit) toolArgs.limit = limit;
  if (layers && layers.length > 0) toolArgs.layers = layers;

  const message =
    `[SYSTEM: Invoke the mcp_recall_recall tool with these exact arguments and return ONLY the raw JSON output, nothing else]\n` +
    JSON.stringify(toolArgs);

  try {
    const response = await fetch(`${config.hermesUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: "hermes-agent",
        messages: [{ role: "user", content: message }],
        stream: false,
      }),
    });

    if (!response.ok) {
      return {
        content: [
          {
            type: "text",
            text: `Recall failed: Hermes API returned ${response.status} ${response.statusText}`,
          },
        ],
        isError: true,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "No response";

    return {
      content: [{ type: "text", text: content }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Recall error: ${err.message}` }],
      isError: true,
    };
  }
}
