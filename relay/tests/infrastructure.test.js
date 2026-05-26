import assert from 'node:assert';
import { loadConfig } from '../src/config.js';

try {
  const config = loadConfig({ HERMES_API_KEY: 'test', HERMES_API_URL: 'http://test', VM_HOST: '10.0.0.1', VM_USER: 'YOUR_VM_USER' });
  assert.equal(config.HERMES_API_KEY, 'test');
  console.log('PASS');
} catch (err) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
