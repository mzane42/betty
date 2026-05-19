/**
 * daemon — entry point headless pour container VPS.
 *
 * Lance signal-daemon (node-cron tennis) + telegram-bot dans process unique.
 * Pas d'Electron. Pas d'UI. Vit dans Docker, sur OVH VPS, 24/7.
 *
 * Run: bun run src/cli/daemon.ts
 * Env requis: POKER_DB_PATH, ODDS_API_KEY, TELEGRAM_BOT_TOKEN,
 *             TELEGRAM_ALLOWED_USER_IDS, ANTHROPIC_API_KEY
 */

import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defaultDbPath, openDatabase } from '../db/index.js';
import { startSignalDaemon } from '../tennis/signal-daemon.js';
import { startTelegramBot } from '../tennis/telegram-bot.js';

const CWD = process.cwd();
for (const file of ['.env.local', '.env']) {
  loadDotenv({ path: resolve(CWD, file), override: false });
}

const dbPath = process.env.POKER_DB_PATH ?? defaultDbPath();
console.log(`[daemon] db=${dbPath}`);

const db = openDatabase({ dbPath });

const daemon = await startSignalDaemon(() => db);
console.log(`[daemon] signal-daemon enabled=${daemon.enabled}${daemon.reason ? ` reason=${daemon.reason}` : ''}`);

const tg = await startTelegramBot(() => db);
console.log(`[daemon] telegram-bot enabled=${tg.enabled}${tg.reason ? ` reason=${tg.reason}` : ''}`);

const shutdown = (signal: string) => {
  console.log(`[daemon] ${signal} received — shutting down`);
  try { daemon.stop(); } catch (e) { console.error(e); }
  try { db.close(); } catch (e) { console.error(e); }
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('[daemon] ready — keep-alive loop');
setInterval(() => undefined, 60_000);
