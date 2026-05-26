#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import neo4j from 'neo4j-driver';

// Environment variables configuration
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j';

// Initialize Neo4j Driver
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

// Create MCP Server
const server = new Server(
  {
    name: 'neo4j-memory-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'add_entities',
        description: 'Add multiple entities and their observations to the memory graph.',
        inputSchema: {
          type: 'object',
          properties: {
            entities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Name of the entity' },
                  entityType: { type: 'string', description: 'Type of the entity (e.g., Person, Concept)' },
                  observations: { type: 'array', items: { type: 'string' } }
                },
                required: ['name', 'entityType']
              }
            }
          },
          required: ['entities']
        }
      },
      {
        name: 'add_relations',
        description: 'Add multiple relations between existing entities.',
        inputSchema: {
          type: 'object',
          properties: {
            relations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  from: { type: 'string', description: 'Source entity name' },
                  to: { type: 'string', description: 'Target entity name' },
                  relationType: { type: 'string', description: 'Type of relationship' }
                },
                required: ['from', 'to', 'relationType']
              }
            }
          },
          required: ['relations']
        }
      },
      {
        name: 'search_entities',
        description: 'Search for entities by name or type and retrieve their properties and relationships.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Name or type to search for' }
          },
          required: ['query']
        }
      }
    ],
  };
});

// Handle Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const session = driver.session();

  try {
    if (name === 'add_entities') {
      const entities = args.entities;
      let added = 0;
      for (const entity of entities) {
        const obs = entity.observations ? entity.observations.join('; ') : '';
        await session.run(
          `MERGE (e:Entity {name: $name})
           SET e.type = $type, e.observations = $obs`,
          { name: entity.name, type: entity.entityType, obs }
        );
        added++;
      }
      return {
        content: [{ type: 'text', text: `Successfully added/updated ${added} entities.` }],
      };
    }

    if (name === 'add_relations') {
      const relations = args.relations;
      let added = 0;
      for (const rel of relations) {
        // Cypher requires relationship types to be static, but we can pass standard names 
        // Using APOC or a generic RELATIONSHIP with a type property if dynamic
        await session.run(
          `MATCH (a:Entity {name: $from})
           MATCH (b:Entity {name: $to})
           MERGE (a)-[r:RELATED_TO {type: $relationType}]->(b)`,
          { from: rel.from, to: rel.to, relationType: rel.relationType }
        );
        added++;
      }
      return {
        content: [{ type: 'text', text: `Successfully added ${added} relations.` }],
      };
    }

    if (name === 'search_entities') {
      const result = await session.run(
        `MATCH (e:Entity)
         WHERE e.name CONTAINS $query OR e.type CONTAINS $query
         OPTIONAL MATCH (e)-[r:RELATED_TO]->(target)
         RETURN e.name AS name, e.type AS type, e.observations AS observations, collect({to: target.name, type: r.type}) AS relations
         LIMIT 10`,
        { query: args.query }
      );
      
      const entities = result.records.map(record => ({
        name: record.get('name'),
        type: record.get('type'),
        observations: record.get('observations'),
        relations: record.get('relations').filter(rel => rel.to !== null)
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify(entities, null, 2) }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: error.message }],
    };
  } finally {
    await session.close();
  }
});

// Start the server
async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Neo4j Memory MCP Server running on stdio');
}

start().catch(console.error);
