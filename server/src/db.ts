import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export type AuthDatabase = Database.Database;

export function resolveDefaultAuthDbPath(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): string {
  const configuredPath = env.AUTH_DB_PATH?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  return basename(cwd) === 'server' ? join(cwd, 'users.sqlite') : join(cwd, 'server', 'users.sqlite');
}

export function createAuthDatabase(dbPath = resolveDefaultAuthDbPath()): AuthDatabase {
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      mmr INTEGER NOT NULL DEFAULT 1000,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}
