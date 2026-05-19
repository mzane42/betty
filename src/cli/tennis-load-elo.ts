#!/usr/bin/env tsx
/**
 * CLI: fetch Sackmann ATP+WTA CSVs and compute clay-Elo cache.
 *
 * Usage:
 *   tsx src/cli/tennis-load-elo.ts                    # default: ATP+WTA last 2 years
 *   tsx src/cli/tennis-load-elo.ts --years 2023,2024,2025,2026
 *   tsx src/cli/tennis-load-elo.ts --force            # re-fetch CSVs
 *   tsx src/cli/tennis-load-elo.ts --atp-only
 */

import { buildClayElo } from '../tennis/model/sackmann-loader.js';
import { invalidateClayEloCache } from '../tennis/model/rating.js';

function parseArgs(argv: string[]): {
  years?: number[];
  tours?: Array<'atp' | 'wta'>;
  force: boolean;
} {
  const out: { years?: number[]; tours?: Array<'atp' | 'wta'>; force: boolean } = {
    force: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') out.force = true;
    else if (a === '--atp-only') out.tours = ['atp'];
    else if (a === '--wta-only') out.tours = ['wta'];
    else if (a === '--years') {
      const next = argv[++i];
      out.years = next.split(',').map((y) => parseInt(y, 10)).filter((y) => !Number.isNaN(y));
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log('[tennis-load-elo] starting', args);
  const result = await buildClayElo(args);
  invalidateClayEloCache();
  console.log(
    `[tennis-load-elo] done. ${result.playerCount} players from ${result.rowsProcessed} match rows → ${result.outputPath}`
  );
}

main().catch((err) => {
  console.error('[tennis-load-elo] failed:', err);
  process.exit(1);
});
