import pg from 'pg';

const { Pool } = pg;

/**
 * Create a PostgreSQL connection pool from config.
 * @param {object} config - The config object from loadConfig().
 * @returns {pg.Pool} A pg Pool instance.
 */
export function createPool(config) {
  return new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user: config.db.user,
    password: config.db.password,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}
