/**
 * tennis-scan — terminal-driven scan + curator pass.
 *
 * Runs the same pipeline the Electron daemon runs (fetchAllEvents → runAutoScore
 * → runCurator), prints a summary, dumps any PLAY/STRONG picks.
 *
 * Drives task #21 UAT: makes it possible to refresh picks without launching
 * the GUI, and exit-codes when no actionable pick exists.
 */

import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defaultDbPath, openDatabase } from '../db/index.js';
import { createOddsApiClient } from '../tennis/ingest/odds-api.js';
import { runAutoScore } from '../tennis/auto-scorer.js';
import { runCurator } from '../tennis/curator.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
for (const file of ['.env.local', '.env']) {
  loadDotenv({ path: resolve(PROJECT_ROOT, file), override: false });
}

const apiKey = process.env.ODDS_API_KEY;
if (!apiKey) {
  console.error('ODDS_API_KEY missing. Add to .env.local.');
  process.exit(2);
}

const enableReddit = process.argv.includes('--reddit');
const skipCurator = process.argv.includes('--no-curator');
const windowHours = Number(
  process.argv.find((a) => a.startsWith('--window='))?.split('=')[1] ?? 36
);

const db = openDatabase({ dbPath: defaultDbPath() });
const client = createOddsApiClient({ apiKey });

console.log(`▶ Tennis scan — window=${windowHours}h, reddit=${enableReddit}`);
const t0 = Date.now();

const score = await runAutoScore(db, client, { enableReddit, windowHours });
for (const line of score.logs) console.log(line);

console.log('');
console.log(
  `▶ Auto-score: ${score.eventsConsidered} events, ${score.strongPicks} STRONG · ${score.playPicks} PLAY · ${score.skippedPicks} SKIP`
);
if (score.errors.length > 0) {
  console.log(`⚠ ${score.errors.length} errors:`);
  for (const err of score.errors.slice(0, 5)) {
    console.log(`  - ${err.matchId}: ${err.message}`);
  }
}

if (!skipCurator) {
  console.log('');
  console.log('▶ Curator Claude pass…');
  const curated = await runCurator(db, { pushTelegram: false });
  console.log(
    `✔ Curator: ${curated.selected_picks.length} retained, ${curated.skipped_picks.length} discarded`
  );
  if (curated.daily_message) console.log(`💬 ${curated.daily_message}`);
  for (const sel of curated.selected_picks) {
    const detail = db
      .prepare(
        `SELECT p.selection, p.book_decimal_odds, p.best_book, p.edge_pct, p.signal_score,
                m.tournament
         FROM tennis_picks p
         JOIN tennis_matches m ON m.match_id = p.match_id
         WHERE p.pick_id = ?`
      )
      .get(sel.pick_id) as
      | {
          selection: string;
          book_decimal_odds: number;
          best_book: string;
          edge_pct: number;
          signal_score: number;
          tournament: string;
        }
      | undefined;
    if (!detail) {
      console.log(`  ★ rank ${sel.rank} ${sel.pick_id} (not found in DB?)`);
      continue;
    }
    console.log(
      `  ★ #${sel.rank} ${detail.selection} @${detail.book_decimal_odds.toFixed(2)} (${detail.best_book}) ${detail.tournament} edge ${(detail.edge_pct * 100).toFixed(1)}% score ${detail.signal_score} [${sel.confidence}]`
    );
    console.log(`    tldr: ${sel.tldr}`);
    console.log(`    why:  ${sel.why}`);
  }
  for (const skp of curated.skipped_picks) {
    console.log(`  ✗ ${skp.pick_id} — ${skp.reason}`);
  }
}

console.log('');
const today = new Date().toISOString().slice(0, 10);
const rows = db
  .prepare(
    `SELECT verdict, COUNT(*) as n FROM tennis_picks
     WHERE DATE(generated_at) = ? GROUP BY verdict`
  )
  .all(today) as Array<{ verdict: string; n: number }>;
console.log(`DB today (${today}):`, rows.map((r) => `${r.verdict}=${r.n}`).join(' · ') || 'empty');

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`✓ Done in ${elapsed}s`);

if (score.playPicks + score.strongPicks === 0) {
  console.log('');
  console.log('⚠ No PLAY/STRONG today. UAT blocked — wait for R2/R3 RG or look at other tournaments.');
  process.exit(1);
}
process.exit(0);
