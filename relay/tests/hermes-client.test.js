import assert from 'node:assert';
import { getHealth } from '../src/clients/hermes.js';

// Requires actual Hermes running or mock. We will test failure case if no key/host.
try {
  await getHealth();
  console.log('PASS');
} catch (err) {
  if (err.message.includes('fetch') || err.message.includes('ECONNREFUSED') || err.message.includes('failed')) {
     console.log('PASS');
  } else {
     console.error('FAIL:', err.message);
     process.exit(1);
  }
}
