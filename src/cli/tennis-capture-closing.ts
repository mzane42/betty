/**
 * tennis-capture-closing — manual closing-odds snapshot for unsettled bets
 * whose match is starting soon.
 *
 * Usage:
 *   bun run tennis-capture-closing
 *   bun run tennis-capture-closing --before=10 --after=60   # widen window
 *
 * The same logic runs automatically every 30 minutes via the signal daemon's
 * line-poll cron, but this CLI lets you trigger it on demand (e.g. right
 * before a match you placed a bet on).
 */

import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defaultDbPath, openDatabase } from '../db/index.js';
import { createOddsApiClient } from '../tennis/ingest/odds-api.js';
import { captureClosingOdds } from '../tennis/closing-odds.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
for (const file of ['.env.local', '.env']) {
  loadDotenv({ path: resolve(PROJECT_ROOT, file), override: false });
}

const apiKey = process.env.ODDS_API_KEY;
if (!apiKey) {
  console.error('ODDS_API_KEY missing');
  process.exit(2);
}

const before = Number(process.argv.find((a) => a.startsWith('--before='))?.split('=')[1] ?? 5);
const after = Number(process.argv.find((a) => a.startsWith('--after='))?.split('=')[1] ?? 30);

const db = openDatabase({ dbPath: defaultDbPath() });
const client = createOddsApiClient({ apiKey });

console.log(`Snapshot window: [-${before}min, +${after}min] around match scheduled_at`);
const result = await captureClosingOdds(db, client, {
  windowMinutesBefore: before,
  windowMinutesAfter: after
});

for (const line of result.logs) console.log(line);
console.log('');
console.log(
  `Done: ${result.candidates} candidate(s), ${result.captured} captured, ${result.skipped} skipped, ${result.errors.length} error(s)`
);
process.exit(result.errors.length > 0 ? 4 : 0);
