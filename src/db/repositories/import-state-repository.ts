import type { Database } from '../database.js';

export interface ImportStateRow {
  filePath: string;
  fileSize: number;
  byteOffset: number;
  handsImported: number;
  lastImportedAt: string;
  fileKind: 'hand' | 'summary';
}

export interface ImportStateRepository {
  get(filePath: string): ImportStateRow | null;
  upsert(row: ImportStateRow): void;
  reset(filePath: string): void;
  resetAll(): void;
}

export function createImportStateRepository(db: Database): ImportStateRepository {
  const getStmt = db.prepare('SELECT * FROM import_state WHERE file_path = ?');
  const upsertStmt = db.prepare(`
    INSERT INTO import_state (file_path, file_size, byte_offset, hands_imported, last_imported_at, file_kind)
    VALUES (@file_path, @file_size, @byte_offset, @hands_imported, @last_imported_at, @file_kind)
    ON CONFLICT(file_path) DO UPDATE SET
      file_size = excluded.file_size,
      byte_offset = excluded.byte_offset,
      hands_imported = excluded.hands_imported,
      last_imported_at = excluded.last_imported_at,
      file_kind = excluded.file_kind
  `);
  const resetStmt = db.prepare('DELETE FROM import_state WHERE file_path = ?');
  const resetAllStmt = db.prepare('DELETE FROM import_state');

  function get(filePath: string): ImportStateRow | null {
    const row = getStmt.get(filePath) as
      | {
          file_path: string;
          file_size: number;
          byte_offset: number;
          hands_imported: number;
          last_imported_at: string;
          file_kind: 'hand' | 'summary';
        }
      | undefined;
    if (!row) return null;
    return {
      filePath: row.file_path,
      fileSize: row.file_size,
      byteOffset: row.byte_offset,
      handsImported: row.hands_imported,
      lastImportedAt: row.last_imported_at,
      fileKind: row.file_kind
    };
  }

  function upsert(row: ImportStateRow): void {
    upsertStmt.run({
      file_path: row.filePath,
      file_size: row.fileSize,
      byte_offset: row.byteOffset,
      hands_imported: row.handsImported,
      last_imported_at: row.lastImportedAt,
      file_kind: row.fileKind
    });
  }

  function reset(filePath: string): void {
    resetStmt.run(filePath);
  }

  function resetAll(): void {
    resetAllStmt.run();
  }

  return { get, upsert, reset, resetAll };
}
