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

export async function injectIntoActiveTelegramSession(role, content) {
  // Find the latest telegram session
  const getSessionSql = `SELECT id FROM sessions WHERE source='telegram' ORDER BY started_at DESC LIMIT 1`;
  const sessionOutput = await queryStateDb(getSessionSql);
  if (!sessionOutput || sessionOutput.length === 0) return null;
  
  const sessionId = sessionOutput[0].id;
  const b64Content = Buffer.from(content).toString('base64');
  const pyScript = `import sqlite3, sys, base64
content = base64.b64decode("${b64Content}").decode('utf-8')
conn = sqlite3.connect('/opt/data/state.db')
cur = conn.cursor()
cur.execute('INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, strftime("%s", "now"))', ('${sessionId}', '${role}', content))
conn.commit()`;

  const b64PyScript = Buffer.from(pyScript).toString('base64');
  const cmd = `echo "${b64PyScript}" | base64 -d | ssh ${config.VM_USER}@${config.VM_HOST} "docker exec -i hermes-agent python3"`;
  
  await execAsync(cmd);
  
  return sessionId;
}
