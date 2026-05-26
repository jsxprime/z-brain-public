import assert from 'node:assert';
import { createServer } from '../src/index.js';

try {
  const server = createServer();
  assert.ok(server);
  console.log('PASS');
} catch (err) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
