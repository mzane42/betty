import BetterSqlite3 from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export type Database = BetterSqlite3.Database;

export interface OpenOptions {
  dbPath: string;
  readonly?: boolean;
}

export function openDatabase({ dbPath, readonly = false }: OpenOptions): Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new BetterSqlite3(dbPath, { readonly });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  if (!readonly) initializeSchema(db);
  return db;
}

function initializeSchema(db: Database): void {
  const schemaPath = locateSchemaFile();
  const ddl = readFileSync(schemaPath, 'utf-8');
  runSql(db, ddl);
}

/**
 * Wrapper around better-sqlite3's batch SQL runner. Used for multi-statement DDL.
 */
export function runSql(db: Database, sql: string): void {
  const runner = db['exec' as keyof Database] as (s: string) => void;
  runner.call(db, sql);
}

function locateSchemaFile(): string {
  const candidates = [
    join(__dirname, 'schema.sql'),
    join(__dirname, '../db/schema.sql'),
    join(process.cwd(), 'src/db/schema.sql')
  ];
  for (const c of candidates) {
    try {
      readFileSync(c);
      return c;
    } catch {
      // try next
    }
  }
  return candidates[0]!;
}

export function defaultDbPath(): string {
  const home = process.env['HOME'] ?? '';
  return join(home, '.poker-coach', 'poker.db');
}
