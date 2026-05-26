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
  const escapedSql = sql.replace(/"/g, '\\"');
  // Zella's container uses sqlite3 for state.db
  const cmd = `docker exec hermes-agent sqlite3 -json /opt/data/state.db "${escapedSql}"`;
  const output = await executeSSH(cmd);
  if (!output) return [];
  try {
    return JSON.parse(output);
  } catch (e) {
    throw new Error(`Failed to parse sqlite output: ${e.message}\nOutput: ${output}`);
  }
}
