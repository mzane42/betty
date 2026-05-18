import { defaultDbPath, openDatabase } from '../db/index.js';
import { backfillEquity } from '../equity/equity-calculator.js';

const dbPath = defaultDbPath();
const db = openDatabase({ dbPath });

console.log('Database:', dbPath);
console.log('Computing equity for showdown hands (hero + villain cards known)…');

const limit = process.env.EQUITY_LIMIT ? Number(process.env.EQUITY_LIMIT) : undefined;
if (limit) console.log(`Limit: ${limit} hands`);

const start = Date.now();
const { processed, updated } = backfillEquity(db, {
  limit,
  onProgress: (done, total) => {
    const pct = ((done / total) * 100).toFixed(1);
    process.stdout.write(`\r  ${done}/${total} (${pct}%)`);
  }
});

console.log(`\nDone in ${((Date.now() - start) / 1000).toFixed(1)}s`);
console.log(`Processed: ${processed}`);
console.log(`Updated:   ${updated}`);
