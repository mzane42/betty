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
  applyAdHocMigrations(db);
}

/**
 * For schemas that pre-date a new column, add columns idempotently.
 * SQLite ALTER TABLE ADD COLUMN with try/catch on error 'duplicate column'.
 */
function applyAdHocMigrations(db: Database): void {
  const handsExtra: Array<[string, string]> = [
    ['hero_equity_preflop', 'REAL'],
    ['hero_equity_flop', 'REAL'],
    ['hero_equity_turn', 'REAL'],
    ['hero_equity_river', 'REAL'],
    ['equity_computed_at', 'TEXT']
  ];
  for (const [col, type] of handsExtra) {
    try {
      runSql(db, `ALTER TABLE hands ADD COLUMN ${col} ${type}`);
    } catch (err) {
      if (!String(err).includes('duplicate column')) throw err;
    }
  }

  // Ensure player_notes table exists for older DBs that pre-date it.
  try {
    runSql(
      db,
      `CREATE TABLE IF NOT EXISTS player_notes (
        player_name TEXT NOT NULL,
        hero_account TEXT NOT NULL,
        note TEXT,
        tags_json TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (player_name, hero_account)
      )`
    );
    runSql(
      db,
      `CREATE TABLE IF NOT EXISTS session_annotations (
        session_date TEXT NOT NULL,
        hero_account TEXT NOT NULL,
        annotation TEXT,
        mood TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (session_date, hero_account)
      )`
    );
  } catch (err) {
    console.error('migration failed', err);
  }
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
