import { describe, it, expect, vi } from 'vitest';

describe('db/pool', () => {
  it('exports a createPool function that returns a pg Pool', async () => {
    const { createPool } = await import('../../src/db/pool.js');
    expect(typeof createPool).toBe('function');

    const mockConfig = {
      db: {
        host: 'localhost',
        port: 5432,
        name: 'test_db',
        user: 'test_user',
        password: 'test_pass',
      },
    };

    const pool = createPool(mockConfig);
    expect(pool).toBeDefined();
    expect(typeof pool.query).toBe('function');
    expect(typeof pool.end).toBe('function');

    // Clean up — don't actually connect
    await pool.end();
  });
});
