#!/usr/bin/env node

/**
 * Recall MCP Server — Unified Memory Facade
 *
 * Fans out to all three Z-Brain memory layers:
 *   1. OpenBrain — domain-segregated thought store (HTTP)
 *   2. CORE — episodic pipeline, vectorized conversations (MCP Streamable HTTP)
 *   3. Neo4j — knowledge graph entities & relations (Bolt driver)
 *
 * Returns a merged, deduplicated, ranked list with provenance tags.
 *
 * Env vars:
 *   OPENBRAIN_URL     — e.g., http://openbrain-server:3040
 *   CORE_MCP_URL      — e.g., http://core-app:3000/api/v1/mcp
 *   CORE_MCP_TOKEN    — Bearer token for CORE MCP auth
 *   NEO4J_URI         — e.g., bolt://core-neo4j:7687
 *   NEO4J_USERNAME    — e.g., neo4j
 *   NEO4J_PASSWORD    — Neo4j password
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import neo4j from 'neo4j-driver';

// ─── Configuration ──────────────────────────────────────────────────────────

const OPENBRAIN_URL = process.env.OPENBRAIN_URL || 'http://openbrain-server:3040';
const CORE_MCP_URL = process.env.CORE_MCP_URL || '';
const CORE_MCP_TOKEN = process.env.CORE_MCP_TOKEN || '';
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j';

// Lazy-init Neo4j driver (only when graph layer is queried)
let _driver = null;
function getDriver() {
  if (!_driver) {
    _driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  }
  return _driver;
}

// ─── CORE MCP Session Management ────────────────────────────────────────────

let coreMcpSessionId = null;

function parseSSE(body) {
  const lines = body.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      return JSON.parse(line.slice(6));
    }
  }
  return null;
}

async function ensureCoreSession() {
  if (coreMcpSessionId) return coreMcpSessionId;
  if (!CORE_MCP_URL) return null;

  try {
    const response = await fetch(CORE_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${CORE_MCP_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'recall-mcp', version: '1.0.0' },
        },
      }),
    });

    if (!response.ok) return null;
    coreMcpSessionId = response.headers.get('mcp-session-id');
    return coreMcpSessionId;
  } catch {
    return null;
  }
}

async function callCoreTool(toolName, toolArgs) {
  const sessionId = await ensureCoreSession();
  if (!sessionId) return null;

  const response = await fetch(CORE_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${CORE_MCP_TOKEN}`,
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
    if (response.status === 404 || response.status === 400) {
      coreMcpSessionId = null; // session expired
    }
    return null;
  }

  const body = await response.text();
  const parsed = parseSSE(body);
  if (!parsed || parsed.error) return null;
  return parsed.result;
}

// ─── Layer Query Functions ──────────────────────────────────────────────────

/**
 * Query OpenBrain for semantic thought search.
 */
async function queryOpenBrain(query, limit) {
  try {
    const response = await fetch(`${OPENBRAIN_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit, threshold: 0.4 }),
    });

    if (!response.ok) return { results: [], error: `HTTP ${response.status}` };

    const data = await response.json();
    // OpenBrain returns an array of thought objects
    const thoughts = Array.isArray(data) ? data : (data.results || []);

    return {
      results: thoughts.map((t) => ({
        content: t.content || '',
        type: extractType(t.content),
        source: 'openbrain',
        domain: t.domain || t.metadata?.domain || null,
        score: t.similarity || t.score || null,
        created_at: t.created_at || t.createdAt || null,
        id: t.id || null,
      })),
      error: null,
    };
  } catch (err) {
    return { results: [], error: err.message };
  }
}

/**
 * Query CORE for episodic memory search.
 */
async function queryCORE(query, limit) {
  if (!CORE_MCP_URL) return { results: [], error: 'CORE_MCP_URL not configured' };

  try {
    const result = await callCoreTool('memory_search', { intent: query });
    if (!result) return { results: [], error: 'CORE MCP call returned null' };

    // memory_search returns content as text — parse it
    const text = result?.content?.[0]?.text || '';

    // The response is a synthesized text block — wrap as a single episode result
    if (text && text.length > 10) {
      return {
        results: [{
          content: text.slice(0, 2000), // Cap length for context efficiency
          type: 'episode',
          source: 'core',
          domain: null,
          score: null,
          created_at: null,
          id: null,
        }],
        error: null,
      };
    }

    return { results: [], error: null };
  } catch (err) {
    return { results: [], error: err.message };
  }
}

/**
 * Query Neo4j for knowledge graph entities and relations.
 */
async function queryGraph(query, limit) {
  const session = getDriver().session();
  try {
    const result = await session.run(
      `MATCH (e:Entity)
       WHERE toLower(e.name) CONTAINS toLower($query)
          OR toLower(coalesce(e.type,'')) CONTAINS toLower($query)
          OR toLower(coalesce(e.observations,'')) CONTAINS toLower($query)
       OPTIONAL MATCH (e)-[r:RELATED_TO]->(target) WHERE r.invalid_at IS NULL
       RETURN e.name AS name, e.type AS type, e.observations AS observations,
              collect({to: target.name, type: r.type}) AS relations
       LIMIT $limit`,
      { query, limit: neo4j.int(limit) }
    );

    const entities = result.records.map((record) => {
      const name = record.get('name');
      const type = record.get('type');
      const observations = record.get('observations');
      const relations = record.get('relations').filter((r) => r.to !== null);

      const parts = [`Entity: ${name} (${type || 'unknown type'})`];
      if (observations) parts.push(`Observations: ${observations}`);
      if (relations.length > 0) {
        parts.push(
          `Relations: ${relations.map((r) => `→ ${r.to} [${r.type}]`).join(', ')}`
        );
      }

      return {
        content: parts.join('\n'),
        type: 'entity',
        source: 'graph',
        domain: null,
        score: null,
        created_at: null,
        id: name,
      };
    });

    return { results: entities, error: null };
  } catch (err) {
    return { results: [], error: err.message };
  } finally {
    await session.close();
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract the memory type tag from content prefix (e.g., "[decision] ..." → "decision").
 */
function extractType(content) {
  const match = content?.match(/^\[(\w+)\]/);
  return match ? match[1] : 'thought';
}

/**
 * Simple deduplication by substring overlap.
 * If result A's content is a substantial substring of result B's content, drop A.
 */
function dedup(results) {
  const kept = [];
  for (const item of results) {
    const dominated = kept.some(
      (existing) =>
        existing.content.length > item.content.length &&
        existing.content.includes(item.content.slice(0, 80))
    );
    if (!dominated) {
      kept.push(item);
    }
  }
  return kept;
}

/**
 * Sort results: scored items first (descending), then unscored by recency.
 */
function rankResults(results) {
  return results.sort((a, b) => {
    // Scored items first
    if (a.score !== null && b.score !== null) return b.score - a.score;
    if (a.score !== null) return -1;
    if (b.score !== null) return 1;
    // Then by date (newest first)
    if (a.created_at && b.created_at) {
      return new Date(b.created_at) - new Date(a.created_at);
    }
    return 0;
  });
}

// ─── MCP Server ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'recall-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'recall',
      description:
        'Unified memory recall across all Z-Brain layers. Fans out to OpenBrain (thoughts/decisions), CORE (episodes/conversations), and Neo4j (knowledge graph entities/relations). Returns a merged, deduplicated, ranked list with provenance tags. Use this as your primary memory query — it replaces the need to call individual memory tools.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language query — what context do you need?',
          },
          types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['decision', 'snippet', 'command', 'summary', 'reference', 'episode', 'entity', 'thought'],
            },
            description: 'Optional: filter results by memory type. Omit for all types.',
          },
          limit: {
            type: 'number',
            description: 'Max total results (default 10, max 25).',
          },
          layers: {
            type: 'array',
            items: { type: 'string', enum: ['openbrain', 'core', 'graph'] },
            description: 'Optional: which layers to query. Default: all three.',
          },
        },
        required: ['query'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== 'recall') {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    };
  }

  const query = args.query;
  const typeFilter = args.types || null;
  const limit = Math.min(args.limit || 10, 25);
  const layers = args.layers || ['openbrain', 'core', 'graph'];

  // Fan out to all requested layers in parallel
  const queries = [];
  const layerNames = [];

  if (layers.includes('openbrain')) {
    queries.push(queryOpenBrain(query, limit));
    layerNames.push('openbrain');
  }
  if (layers.includes('core')) {
    queries.push(queryCORE(query, limit));
    layerNames.push('core');
  }
  if (layers.includes('graph')) {
    queries.push(queryGraph(query, limit));
    layerNames.push('graph');
  }

  const layerResults = await Promise.all(queries);

  // Collect all results and track layer health
  let allResults = [];
  const layerStatus = {};

  for (let i = 0; i < layerResults.length; i++) {
    const { results, error } = layerResults[i];
    const name = layerNames[i];
    layerStatus[name] = error ? `error: ${error}` : `${results.length} results`;
    allResults.push(...results);
  }

  // Apply type filter if specified
  if (typeFilter && typeFilter.length > 0) {
    allResults = allResults.filter((r) => typeFilter.includes(r.type));
  }

  // Deduplicate, rank, and cap
  allResults = dedup(allResults);
  allResults = rankResults(allResults);
  allResults = allResults.slice(0, limit);

  // Build response
  const response = {
    query,
    total: allResults.length,
    layers: layerStatus,
    results: allResults,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
  };
});

// ─── Start ──────────────────────────────────────────────────────────────────

async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Recall MCP Server running on stdio');
}

start().catch(console.error);
