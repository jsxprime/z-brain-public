import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

/**
 * Run all pending migrations against the database.
 * Idempotent — safe to run multiple times.
 *
 * @param {pg.Pool} pool - A pg Pool instance.
 */
export async function runMigrations(pool) {
  // Ensure the schema_migrations table exists (bootstrap)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get already-applied versions
  const { rows } = await pool.query(
    'SELECT version FROM schema_migrations ORDER BY version'
  );
  const applied = new Set(rows.map((r) => r.version));

  // Read migration files sorted by version number
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    // Extract version number from filename: "001-init.sql" → 1
    const version = parseInt(file.split('-')[0], 10);
    if (applied.has(version)) {
      console.log(`Migration ${file} already applied, skipping.`);
      continue;
    }

    console.log(`Applying migration: ${file}...`);
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [version]
      );
      await client.query('COMMIT');
      console.log(`Migration ${file} applied successfully.`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Migration ${file} FAILED:`, err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('All migrations complete.');
}

// Allow running as a standalone script: node src/db/migrate.js
// Only runs when this file is the entry point (not when imported)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { loadConfig } = await import('../config.js');
  const { createPool } = await import('./pool.js');

  // Load .env for standalone execution
  const { config } = await import('dotenv');
  config();

  const appConfig = loadConfig();
  const pool = createPool(appConfig);

  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
