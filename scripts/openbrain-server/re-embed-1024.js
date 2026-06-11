#!/usr/bin/env node
/**
 * Re-embedding Migration Script for OpenBrain
 * 
 * Migrates all thoughts from 768-dim (gemini-embedding-2-preview) 
 * to 1024-dim (gemini-embedding-2 GA) embeddings via OpenRouter.
 * 
 * Processes in batches with rate limiting to avoid OpenRouter throttling.
 * Idempotent: can be re-run safely — checks current vector dimensions.
 * 
 * Usage: Run inside the openbrain-server container or with DATABASE_URL
 *        and OPENROUTER_API_KEY env vars set.
 * 
 *   node re-embed-1024.js [--dry-run] [--batch-size=50] [--delay-ms=500]
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!DATABASE_URL || !OPENROUTER_API_KEY) {
  console.error('Error: DATABASE_URL and OPENROUTER_API_KEY must be set');
  process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BATCH_SIZE = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '50', 10);
const DELAY_MS = parseInt(args.find(a => a.startsWith('--delay-ms='))?.split('=')[1] || '500', 10);

const MODEL = 'google/gemini-embedding-2';
const TARGET_DIMS = 1024;

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function getEmbedding(text) {
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      input: text,
      dimensions: TARGET_DIMS,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  if (!data.data?.[0]?.embedding) {
    throw new Error('No embedding values returned');
  }

  const embedding = data.data[0].embedding;
  if (embedding.length !== TARGET_DIMS) {
    throw new Error(`Expected ${TARGET_DIMS} dims, got ${embedding.length}`);
  }
  return embedding;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  // Get total count and dimension distribution
  const statsResult = await pool.query(`
    SELECT vector_dims(embedding) as dims, COUNT(*) as cnt 
    FROM thoughts WHERE embedding IS NOT NULL 
    GROUP BY vector_dims(embedding)
  `);
  console.log('Current dimension distribution:');
  for (const row of statsResult.rows) {
    console.log(`  ${row.dims}-dim: ${row.cnt} thoughts`);
  }

  // Find all thoughts that need re-embedding (not 1024-dim, or no embedding)
  const toProcess = await pool.query(`
    SELECT id, content 
    FROM thoughts 
    WHERE embedding IS NULL OR vector_dims(embedding) != $1
    ORDER BY created_at ASC
  `, [TARGET_DIMS]);

  const total = toProcess.rows.length;
  console.log(`\nThoughts needing re-embedding: ${total}`);
  
  if (total === 0) {
    console.log('Nothing to do — all thoughts already at target dimensions.');
    await pool.end();
    return;
  }

  if (DRY_RUN) {
    console.log('DRY RUN — no changes will be made.');
    await pool.end();
    return;
  }

  console.log(`\nProcessing ${total} thoughts in batches of ${BATCH_SIZE} (delay: ${DELAY_MS}ms)...\n`);

  let processed = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = toProcess.rows.slice(i, i + BATCH_SIZE);
    
    for (const row of batch) {
      try {
        // Truncate very long content to avoid token limits
        const text = row.content.slice(0, 8000);
        const embedding = await getEmbedding(text);
        
        await pool.query(
          'UPDATE thoughts SET embedding = $1 WHERE id = $2',
          [JSON.stringify(embedding), row.id]
        );
        
        processed++;
        if (processed % 10 === 0 || processed === total) {
          const pct = ((processed / total) * 100).toFixed(1);
          console.log(`  [${processed}/${total}] ${pct}% complete`);
        }
      } catch (err) {
        failed++;
        failures.push({ id: row.id, error: err.message });
        console.error(`  FAILED thought ${row.id}: ${err.message}`);
        
        // If we get a 429, back off significantly
        if (err.message.includes('429')) {
          console.log('  Rate limited — waiting 30s...');
          await sleep(30000);
        }
      }
      
      // Rate limiting between individual requests
      await sleep(DELAY_MS);
    }
    
    // Small pause between batches
    if (i + BATCH_SIZE < total) {
      console.log(`  Batch complete. Pausing 2s...`);
      await sleep(2000);
    }
  }

  // Final stats
  console.log(`\n=== Migration Complete ===`);
  console.log(`Processed: ${processed}/${total}`);
  console.log(`Failed: ${failed}`);

  if (failures.length > 0) {
    console.log(`\nFailed thoughts:`);
    for (const f of failures) {
      console.log(`  ${f.id}: ${f.error}`);
    }
  }

  // Verify final state
  const verifyResult = await pool.query(`
    SELECT vector_dims(embedding) as dims, COUNT(*) as cnt 
    FROM thoughts WHERE embedding IS NOT NULL 
    GROUP BY vector_dims(embedding)
  `);
  console.log(`\nFinal dimension distribution:`);
  for (const row of verifyResult.rows) {
    console.log(`  ${row.dims}-dim: ${row.cnt} thoughts`);
  }

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
