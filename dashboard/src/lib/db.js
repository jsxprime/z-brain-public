import pg from 'pg';
import { getConfig } from './config.js';

const { Pool } = pg;

let pool = null;

/**
 * Get the singleton Postgres pool.
 * Connects to synth-postgres (synthesizer_db) — NOT core_brain.
 */
export function getPool() {
  if (!pool) {
    const config = getConfig();
    pool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.name,
      user: config.db.user,
      password: config.db.password,
      max: 5,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}
