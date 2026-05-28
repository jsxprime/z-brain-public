/**
 * Shared test utilities.
 * For integration tests, we use a real Postgres. For unit tests, we mock.
 */
import { vi } from 'vitest';

/**
 * Create a mock pg Pool that records queries.
 */
export function createMockPool() {
  const queries = [];
  return {
    queries,
    query: vi.fn(async (text, params) => {
      queries.push({ text, params });
      return { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(async () => ({
      query: vi.fn(async (text, params) => {
        queries.push({ text, params });
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    })),
    end: vi.fn(),
  };
}
