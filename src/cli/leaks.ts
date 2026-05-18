#!/usr/bin/env tsx
import { defaultDbPath, openDatabase } from '../db/index.js';
import { findLeaks, recommendGames, getProgress } from '../stats/index.js';

async function main(): Promise<void> {
  const heroAccount = process.argv[2] ?? 'mzane42';
  const db = openDatabase({ dbPath: defaultDbPath() });

  process.stdout.write('=== LEAK ANALYSIS ===\n\n');
  const leaks = findLeaks(db, heroAccount);
  if (leaks.length === 0) {
    process.stdout.write('No major leaks detected.\n\n');
  } else {
    for (const l of leaks) {
      const unit = l.costUnit === 'eur' ? '€' : ' chips';
      process.stdout.write(`[${l.severity.toUpperCase()}] ${l.title} (cost: ${l.cost.toFixed(2)}${unit})\n`);
      process.stdout.write(`  ${l.description}\n`);
      process.stdout.write(`  → ${l.recommendation}\n\n`);
    }
  }

  process.stdout.write('=== GAME RECOMMENDATIONS ===\n\n');
  const recs = recommendGames(db, heroAccount);
  for (const r of recs) {
    process.stdout.write(
      `  ${r.format.padEnd(16)} ${r.stake.padEnd(8)} ${String(r.tournamentsPlayed).padStart(4)} tournaments  ROI ${r.roi
        .toFixed(1)
        .padStart(7)}%  [${r.confidence}] → ${r.recommendation}\n`
    );
  }

  process.stdout.write('\n=== PROGRESS (quarterly) ===\n\n');
  const prog = getProgress(db, heroAccount, 'quarter');
  for (const p of prog) {
    process.stdout.write(
      `  ${p.period.padEnd(10)} ${String(p.tournamentsPlayed).padStart(4)} t  net ${p.net.toFixed(2).padStart(8)}€  ROI ${p.roi.toFixed(1).padStart(7)}%  ITM ${p.itm.toFixed(0).padStart(3)}%\n`
    );
  }

  db.close();
}

main().catch((err) => {
  process.stderr.write(`Failed: ${(err as Error).message}\n`);
  process.exit(1);
});
