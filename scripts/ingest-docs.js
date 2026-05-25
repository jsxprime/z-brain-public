import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load from environment (see .env.example for required vars)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DB_URL = process.env.DATABASE_URL;

if (!GEMINI_API_KEY || !DB_URL) {
  console.error("❌ Missing required environment variables: GEMINI_API_KEY, DATABASE_URL");
  console.error("   Copy .env.example to .env and fill in the values.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-embedding-2" });

const pool = new pg.Pool({ connectionString: DB_URL });

/**
 * Split text into chunks by markdown headers
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
  
  // Secondary split if chunk is still too huge (> 2000 chars)
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
        remoteDocs.push({
          source: url,
          content: text
        });
      }
    } catch (err) {
      console.error(`Failed to fetch ${url}:`, err.message);
    }
  }
  return remoteDocs;
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
        content: fs.readFileSync(filePath, 'utf8')
      });
    }
  }
  return fileList;
}

async function ingestChunk(chunkText, source) {
  try {
    const result = await model.embedContent({
      content: { parts: [{ text: chunkText }] },
      outputDimensionality: 768,
    });
    const embedding = result.embedding.values.slice(0, 768);
    
    // Convert float array to pgvector string format '[0.1, 0.2, ...]'
    const vectorString = '[' + embedding.join(',') + ']';
    
    const metadata = { source, type: 'documentation' };
    
    // 1. First upsert the thought
    const upsertRes = await pool.query(
      `SELECT * FROM upsert_thought($1, $2::jsonb);`,
      [chunkText, JSON.stringify({ metadata })]
    );
    // Determine the ID from the returned row (the column name depends on the function's return type)
    const row = upsertRes.rows[0];
    let thoughtId = row.id || row.upsert_thought || Object.values(row)[0];
    if (typeof thoughtId === 'string' && thoughtId.startsWith('{')) {
      // Postgres returned a composite record as a string
      // E.g. {"id":"...","fingerprint":"..."} or (..., ...)
      // Let's regex extract the UUID
      const match = thoughtId.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (match) thoughtId = match[1];
    } else if (typeof thoughtId === 'object' && thoughtId !== null) {
      thoughtId = thoughtId.id;
    }
    
    // 2. Then update the embedding in a separate statement
    await pool.query(
      `UPDATE thoughts SET embedding = $1::vector WHERE id = $2;`,
      [vectorString, thoughtId]
    );
    console.log(`✅ Ingested chunk from ${source} (${chunkText.length} chars)`);
  } catch (err) {
    console.error(`❌ Failed to ingest chunk from ${source}:`, err.message);
  }
}

async function run() {
  console.log("Starting Document Ingestion Pipeline...");
  
  const docsDir = path.join(__dirname, '../docs');
  const localDocs = getLocalDocs(docsDir);
  const remoteDocs = await getRemoteDocs();
  
  const allDocs = [...localDocs, ...remoteDocs];
  console.log(`Found ${localDocs.length} local files and ${remoteDocs.length} remote files.`);
  
  for (const doc of allDocs) {
    console.log(`Processing: ${doc.source}`);
    const chunks = chunkMarkdown(doc.content);
    for (const chunk of chunks) {
      await ingestChunk(chunk, doc.source);
      // Rate limit safety
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  console.log("Ingestion Complete!");
  pool.end();
}

run().catch(err => {
  console.error("Fatal Error:", err);
  pool.end();
});
