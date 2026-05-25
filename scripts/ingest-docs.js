import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// OpenBrain server URL — runs on the z-brain VM, exposed on port 3040
const OPENBRAIN_URL = process.env.OPENBRAIN_URL || 'http://YOUR_VM_IP:3040';

/**
 * Split text into chunks by markdown headers.
 * Secondary split if any chunk exceeds 2000 chars.
 */
function chunkMarkdown(text) {
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if (line.startsWith('## ') || line.startsWith('# ')) {
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  // Secondary split if chunk is still too large (> 2000 chars)
  const finalChunks = [];
  for (const chunk of chunks) {
    if (chunk.length > 2000) {
      const parts = chunk.match(/[\s\S]{1,1500}(?=\s|$)/g) || [chunk];
      finalChunks.push(...parts);
    } else {
      finalChunks.push(chunk);
    }
  }

  return finalChunks;
}

/**
 * Recursively find local markdown files in docs/
 */
function getLocalDocs(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getLocalDocs(filePath, fileList);
    } else if (file.endsWith('.md')) {
      fileList.push({
        source: filePath,
        content: fs.readFileSync(filePath, 'utf8'),
      });
    }
  }
  return fileList;
}

/**
 * Read the manifest and fetch remote documentation URLs.
 */
async function getRemoteDocs() {
  const manifestPath = path.join(__dirname, '../docs/foundational_stack.md');
  if (!fs.existsSync(manifestPath)) return [];

  const content = fs.readFileSync(manifestPath, 'utf8');
  const urls = content.match(/https:\/\/raw\.githubusercontent\.com[^\s]+/g) || [];

  const remoteDocs = [];
  for (const url of urls) {
    console.log(`Fetching remote documentation: ${url}`);
    try {
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        remoteDocs.push({ source: url, content: text });
      }
    } catch (err) {
      console.error(`Failed to fetch ${url}:`, err.message);
    }
  }
  return remoteDocs;
}

async function run() {
  console.log('Starting Document Ingestion Pipeline...');
  console.log(`OpenBrain URL: ${OPENBRAIN_URL}`);

  // Verify OpenBrain is reachable
  try {
    const healthRes = await fetch(`${OPENBRAIN_URL}/health`);
    const health = await healthRes.json();
    console.log(`OpenBrain v${health.version} is healthy (${health.sessions} active sessions)`);
  } catch (err) {
    console.error(`❌ Cannot reach OpenBrain at ${OPENBRAIN_URL}: ${err.message}`);
    console.error('   Make sure the openbrain-server container is running on the z-brain VM.');
    process.exit(1);
  }

  // Connect to OpenBrain via MCP SSE
  console.log('Connecting to OpenBrain MCP...');
  const transport = new SSEClientTransport(new URL(`${OPENBRAIN_URL}/sse`));
  const client = new Client({ name: 'ingest-docs', version: '2.0.0' });
  await client.connect(transport);
  console.log('✅ MCP connection established');

  // Gather documents
  const docsDir = path.join(__dirname, '../docs');
  const localDocs = getLocalDocs(docsDir);
  const remoteDocs = await getRemoteDocs();
  const allDocs = [...localDocs, ...remoteDocs];
  console.log(`Found ${localDocs.length} local files and ${remoteDocs.length} remote files.`);

  let successCount = 0;
  let errorCount = 0;

  for (const doc of allDocs) {
    console.log(`\nProcessing: ${doc.source}`);
    const chunks = chunkMarkdown(doc.content);
    console.log(`  ${chunks.length} chunks`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      // Prefix with source for traceability
      const content = `[Source: ${path.basename(doc.source)}]\n${chunk}`;

      try {
        const result = await client.callTool({
          name: 'capture',
          arguments: { content },
        });

        const text = result.content?.[0]?.text || '';
        if (result.isError) {
          console.error(`  ❌ Chunk ${i + 1}/${chunks.length}: ${text}`);
          errorCount++;
        } else {
          console.log(`  ✅ Chunk ${i + 1}/${chunks.length} (${chunk.length} chars): ${text}`);
          successCount++;
        }
      } catch (err) {
        console.error(`  ❌ Chunk ${i + 1}/${chunks.length}: ${err.message}`);
        errorCount++;
      }

      // Rate limit — OpenBrain calls Gemini for embeddings + metadata
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Ingestion Complete! ✅ ${successCount} succeeded, ❌ ${errorCount} failed`);

  await client.close();
}

run().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
