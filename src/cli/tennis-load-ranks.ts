#!/usr/bin/env tsx
/**
 * CLI: fetch latest ATP/WTA singles rankings from Sackmann and upsert into
 * tennis_players. Run weekly (Monday eve) to keep the rank-based model fresh.
 *
 * Usage:
 *   tsx src/cli/tennis-load-ranks.ts
 *   tsx src/cli/tennis-load-ranks.ts --force            # bypass CSV cache
 *   tsx src/cli/tennis-load-ranks.ts --atp-only
 */

import { defaultDbPath, openDatabase } from '../db/index.js';
import { loadRanksIntoDb } from '../tennis/model/ranks-loader.js';

function parseArgs(argv: string[]): {
  tours?: Array<'atp' | 'wta'>;
  force: boolean;
} {
  const out: { tours?: Array<'atp' | 'wta'>; force: boolean } = { force: false };
  for (const a of argv) {
    if (a === '--force') out.force = true;
    else if (a === '--atp-only') out.tours = ['atp'];
    else if (a === '--wta-only') out.tours = ['wta'];
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = openDatabase({ dbPath: defaultDbPath() });
  console.log('[tennis-load-ranks] starting', args);
  const result = await loadRanksIntoDb(db, args);
  console.log(
    `[tennis-load-ranks] ${result.rowsWritten} rows written ` +
      `(ATP: ${result.rankingDateAtp ?? 'n/a'}, WTA: ${result.rankingDateWta ?? 'n/a'})`
  );
  if (result.errors.length > 0) {
    console.error('[tennis-load-ranks] errors:', result.errors);
  }
  db.close();
}

main().catch((err) => {
  console.error('[tennis-load-ranks] failed:', err);
  process.exit(1);
});
