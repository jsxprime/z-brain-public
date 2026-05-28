/**
 * Thread Registry — SQLite-backed named thread management
 *
 * Maps friendly thread names to CLI session UUIDs.
 * Namespaced per CLI: a Claude thread and a Codex thread
 * with the same name are completely separate entries.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.THREAD_DB_PATH || '/home/hermes/.zella/threads.db';

export function createThreadRegistry() {
  // Ensure directory exists
  mkdirSync(dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cli TEXT NOT NULL,
      name TEXT NOT NULL,
      session_uuid TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      archived INTEGER NOT NULL DEFAULT 0,
      turn_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(cli, name)
    );

    CREATE INDEX IF NOT EXISTS idx_threads_cli_name ON threads(cli, name);
    CREATE INDEX IF NOT EXISTS idx_threads_cli_archived ON threads(cli, archived);
  `);

  const stmts = {
    getThread: db.prepare('SELECT * FROM threads WHERE cli = ? AND name = ? AND archived = 0'),
    createThread: db.prepare(`
      INSERT INTO threads (cli, name, session_uuid)
      VALUES (?, ?, ?)
      ON CONFLICT(cli, name) DO UPDATE SET
        session_uuid = COALESCE(excluded.session_uuid, threads.session_uuid),
        updated_at = datetime('now')
      RETURNING *
    `),
    updateSessionId: db.prepare(`
      UPDATE threads SET session_uuid = ?, updated_at = datetime('now')
      WHERE cli = ? AND name = ?
    `),
    incrementTurnCount: db.prepare(`
      UPDATE threads SET turn_count = turn_count + 1, updated_at = datetime('now')
      WHERE cli = ? AND name = ?
    `),
    listThreads: db.prepare(`
      SELECT * FROM threads WHERE cli = ? AND archived = 0
      ORDER BY updated_at DESC
    `),
    archiveThread: db.prepare(`
      UPDATE threads SET archived = 1, updated_at = datetime('now')
      WHERE cli = ? AND name = ?
    `),
  };

  return {
    getThread(cli, name) {
      return stmts.getThread.get(cli, name) || null;
    },

    createThread(cli, name, sessionUuid = null) {
      return stmts.createThread.get(cli, name, sessionUuid);
    },

    updateSessionId(cli, name, sessionUuid) {
      stmts.updateSessionId.run(sessionUuid, cli, name);
    },

    incrementTurnCount(cli, name) {
      stmts.incrementTurnCount.run(cli, name);
    },

    listThreads(cli) {
      return stmts.listThreads.all(cli);
    },

    archiveThread(cli, name) {
      stmts.archiveThread.run(cli, name);
    },

    close() {
      db.close();
    },
  };
}
