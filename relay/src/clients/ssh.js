import { exec } from 'child_process';
import util from 'util';
import { config } from '../config.js';

const execAsync = util.promisify(exec);

export async function executeSSH(command) {
  const cmd = `ssh ${config.VM_USER}@${config.VM_HOST} "${command}"`;
  const { stdout, stderr } = await execAsync(cmd);
  if (stderr && stderr.toLowerCase().includes('error')) {
    console.error(`SSH Stderr: ${stderr}`);
  }
  return stdout.trim();
}

export async function queryStateDb(sql) {
  const escapedSql = sql.replace(/"/g, '\\"').replace(/'/g, "\\'");
  const pyCmd = `import sqlite3, json; conn = sqlite3.connect('/opt/data/state.db'); conn.row_factory = sqlite3.Row; cur = conn.cursor(); cur.execute('${escapedSql}'); print(json.dumps([dict(ix) for ix in cur.fetchall()]))`;
  const b64Cmd = Buffer.from(pyCmd).toString('base64');
  const cmd = `docker exec hermes-agent sh -c 'echo ${b64Cmd} | base64 -d | python3'`;
  
  const output = await executeSSH(cmd);
  if (!output) return [];
  try {
    return JSON.parse(output);
  } catch (e) {
    throw new Error(`Failed to parse sqlite output: ${e.message}\\nOutput: ${output}`);
  }
}

// injectIntoActiveTelegramSession has been removed.
// Use the Telegram Bot API client (clients/telegram.js) for notifications instead.
// SSH is retained only for read-only diagnostic queries (queryStateDb, executeSSH).
