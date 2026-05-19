/**
 * tennis-sync-status — one-shot status sync against Odds API.
 *
 * Flips DB rows to withdrawn (no longer in feed) or finished (started >5h ago).
 * Cheap call; safe to run as often as you want.
 */

import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defaultDbPath, openDatabase } from '../db/index.js';
import { createOddsApiClient } from '../tennis/ingest/odds-api.js';
import { syncMatchStatuses } from '../tennis/status-sync.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
for (const file of ['.env.local', '.env']) {
  loadDotenv({ path: resolve(PROJECT_ROOT, file), override: false });
}

const apiKey = process.env.ODDS_API_KEY;
if (!apiKey) {
  console.error('ODDS_API_KEY missing');
  process.exit(2);
}

const db = openDatabase({ dbPath: defaultDbPath() });
const client = createOddsApiClient({ apiKey });
const res = await syncMatchStatuses(db, client);

for (const line of res.logs) console.log(line);
console.log(`Done: scanned=${res.scanned} withdrawn=${res.withdrawn} finished=${res.finished}`);
