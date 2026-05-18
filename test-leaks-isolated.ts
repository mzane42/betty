// Reproduces what the IPC handler does for `analytics:leaks`
import { openDatabase, defaultDbPath } from './src/db/database.js';
import { findLeaks } from './src/stats/leak-finder.js';

const db = openDatabase({ dbPath: defaultDbPath() });
console.log('opened db');
const result = findLeaks(db, 'mzane42');
console.log('result length:', result.length);
for (const leak of result) {
  console.log(JSON.stringify(leak, null, 2));
}
db.close();
