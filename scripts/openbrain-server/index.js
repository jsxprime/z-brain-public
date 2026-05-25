import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY is not defined in the environment.");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("Error: DATABASE_URL is not defined in the environment.");
  process.exit(1);
}

// Initialize clients
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
});

async function getEmbedding(text) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-2" });
    const result = await model.embedContent({
      content: { parts: [{ text }] },
      outputDimensionality: 768,
    });
    if (!result.embedding || !result.embedding.values) {
      throw new Error("No embedding values returned from Gemini API");
    }
    return result.embedding.values;
  } catch (err) {
    console.error("Error generating embedding:", err);
    throw err;
  }
}

async function extractMetadata(text) {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      }
    });
    const prompt = `Extract metadata from the user's captured thought. Return JSON with:
- "people": array of strings of people mentioned (empty if none)
- "action_items": array of strings of implied to-dos (empty if none)
- "dates_mentioned": array of strings YYYY-MM-DD (empty if none)
- "topics": array of 1-3 short topic tags (always at least one)
- "type": one of "observation", "task", "idea", "reference", "person_note"
Only extract what's explicitly there.
Thought: ${text}`;
    const result = await model.generateContent(prompt);
    const textResponse = result.response.text();
    return JSON.parse(textResponse);
  } catch (err) {
    console.error("Error extracting metadata, falling back to defaults:", err);
    return { topics: ["uncategorized"], type: "observation" };
  }
}

// Define tools (shared across all sessions)
const tools = [
  {
    name: "search",
    description: "Search thoughts in OpenBrain using semantic similarity. Returns matching thoughts.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The natural language query to search for" },
        threshold: { type: "number", description: "Cosine similarity threshold (default 0.5)", default: 0.5 },
        limit: { type: "number", description: "Max number of results (default 10)", default: 10 }
      },
      required: ["query"]
    }
  },
  {
    name: "fetch",
    description: "Retrieve a specific thought by its UUID ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The UUID of the thought" }
      },
      required: ["id"]
    }
  },
  {
    name: "capture",
    description: "Capture a new thought or update an existing one. Generates embeddings and extracts metadata automatically.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The thought text content to capture" }
      },
      required: ["content"]
    }
  },
  {
    name: "recent",
    description: "Retrieve recently captured thoughts, sorted by created date descending.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max number of thoughts to return (default 50)", default: 50 }
      }
    }
  },
  {
    name: "stats",
    description: "Get database stats including the total count of thoughts.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

/**
 * Creates a new MCP Server instance with all tool handlers registered.
 * Each SSE session gets its own Server instance to avoid transport conflicts.
 */
function createServer() {
  const mcpServer = new Server(
    {
      name: "openbrain",
      version: "1.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === "search") {
        const { query, threshold = 0.5, limit = 10 } = args;
        const embedding = await getEmbedding(query);

        const dbResult = await pool.query(
          `SELECT * FROM match_thoughts($1, $2, $3)`,
          [JSON.stringify(embedding), threshold, limit]
        );

        return {
          content: [{ type: "text", text: JSON.stringify(dbResult.rows, null, 2) }]
        };
      }

      if (name === "fetch") {
        const { id } = args;
        const dbResult = await pool.query(
          "SELECT id, content, metadata, created_at, updated_at FROM thoughts WHERE id = $1",
          [id]
        );

        if (dbResult.rows.length === 0) {
          return {
            content: [{ type: "text", text: `Thought not found for ID: ${id}` }],
            isError: true
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(dbResult.rows[0], null, 2) }]
        };
      }

      if (name === "capture") {
        const { content } = args;
        const metadata = await extractMetadata(content);
        const embedding = await getEmbedding(content);

        // Perform upsert via SQL helper
        const dbResult = await pool.query(
          "SELECT upsert_thought($1, $2)",
          [content, JSON.stringify({ metadata })]
        );

        const upsertResult = dbResult.rows[0].upsert_thought;
        const id = upsertResult.id;

        // Update the embedding column for the row (since upsert_thought only inserts/updates content, fingerprint, and metadata)
        await pool.query(
          "UPDATE thoughts SET embedding = $1 WHERE id = $2",
          [JSON.stringify(embedding), id]
        );

        return {
          content: [{ type: "text", text: `Successfully captured thought. ID: ${id}` }]
        };
      }

      if (name === "recent") {
        const { limit = 50 } = args;
        const dbResult = await pool.query(
          "SELECT id, content, metadata, created_at, updated_at FROM thoughts ORDER BY created_at DESC LIMIT $1",
          [limit]
        );

        return {
          content: [{ type: "text", text: JSON.stringify(dbResult.rows, null, 2) }]
        };
      }

      if (name === "stats") {
        const dbResult = await pool.query("SELECT COUNT(*)::integer as total_count FROM thoughts");
        return {
          content: [{ type: "text", text: JSON.stringify(dbResult.rows[0], null, 2) }]
        };
      }

      throw new Error(`Tool not found: ${name}`);
    } catch (err) {
      console.error(`Error executing tool ${name}:`, err);
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  });

  return mcpServer;
}

// ─── Multi-Session SSE Transport ────────────────────────────────────────────

async function main() {
  const app = express();
  const sessions = new Map(); // SDK sessionId → { transport, server }

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      version: "1.1.1",
      sessions: sessions.size,
      uptime: Math.floor(process.uptime()),
    });
  });

  // SSE endpoint — each connection gets its own session
  app.get("/sse", async (req, res) => {
    // Pass just "/message" — the SDK appends ?sessionId=<uuid> automatically
    const sessionTransport = new SSEServerTransport("/message", res);
    const sessionServer = createServer();

    // The SDK generates _sessionId internally — use that as our map key
    const sdkSessionId = sessionTransport._sessionId;
    console.error(`[SSE] New session: ${sdkSessionId} (total: ${sessions.size + 1})`);

    sessions.set(sdkSessionId, { transport: sessionTransport, server: sessionServer });

    // Clean up on disconnect
    res.on("close", () => {
      sessions.delete(sdkSessionId);
      console.error(`[SSE] Session closed: ${sdkSessionId} (remaining: ${sessions.size})`);
    });

    await sessionServer.connect(sessionTransport);
  });

  // Message endpoint — routes to the correct session's transport
  app.post("/message", async (req, res) => {
    const sessionId = req.query.sessionId;

    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId query parameter" });
    }

    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(400).json({ error: `Invalid or expired session: ${sessionId}` });
    }

    await session.transport.handlePostMessage(req, res);
  });

  app.listen(3040, "0.0.0.0", () => {
    console.error("OpenBrain MCP Server v1.1.1 running on HTTP port 3040...");
    console.error("Multi-session SSE transport enabled.");
  });
}

main().catch((err) => {
  console.error("Fatal error in main:", err);
  process.exit(1);
});
