import { queryStateDb } from './src/clients/ssh.js';

async function main() {
  try {
    const sql = `SELECT role, content FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE source='telegram' ORDER BY started_at DESC LIMIT 1) ORDER BY timestamp DESC LIMIT 5`;
    const rows = await queryStateDb(sql);
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error(err);
  }
}

main();
