/**
 * tennis-telegram-test — send a one-shot test message to whitelisted user(s)
 * via raw Telegram Bot API (skips polling / event loop entirely).
 *
 * Usage:
 *   bun run tennis-telegram-test                # generic ping
 *   bun run tennis-telegram-test "custom text"  # custom message
 *   bun run tennis-telegram-test --strong       # simulate STRONG pick push
 *   bun run tennis-telegram-test --digest       # simulate daily digest
 */

import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
for (const file of ['.env.local', '.env']) {
  loadDotenv({ path: resolve(PROJECT_ROOT, file), override: false });
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const ids = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN missing');
  process.exit(2);
}
if (ids.length === 0) {
  console.error('TELEGRAM_ALLOWED_USER_IDS missing or empty');
  process.exit(2);
}

const args = process.argv.slice(2);

if (args.includes('--getupdates')) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const json = (await res.json()) as {
    ok: boolean;
    result?: Array<{
      message?: {
        chat?: { id: number; type: string; first_name?: string; username?: string };
        from?: { id: number; first_name?: string; username?: string };
        text?: string;
      };
    }>;
    description?: string;
  };
  if (!json.ok) {
    console.error(`getUpdates failed: ${json.description}`);
    process.exit(4);
  }
  if (!json.result || json.result.length === 0) {
    console.log('No updates. Send a message to the bot in Telegram, then retry.');
    process.exit(0);
  }
  for (const u of json.result) {
    const m = u.message;
    if (!m) continue;
    console.log(
      `chat_id=${m.chat?.id} type=${m.chat?.type} from=${m.from?.first_name ?? m.from?.username ?? m.from?.id} text="${m.text ?? ''}"`
    );
  }
  console.log('');
  console.log('Use chat_id above as TELEGRAM_ALLOWED_USER_IDS in .env.local.');
  process.exit(0);
}

if (args.includes('--getme')) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const json = (await res.json()) as {
    ok: boolean;
    result?: { username: string; first_name: string; id: number };
    description?: string;
  };
  if (json.ok && json.result) {
    console.log(`Bot username: @${json.result.username}`);
    console.log(`Bot name: ${json.result.first_name}`);
    console.log(`Bot id: ${json.result.id}`);
    console.log(`Direct link: https://t.me/${json.result.username}`);
    console.log('');
    console.log('NEXT: open that link, click START in Telegram, then re-run this CLI.');
  } else {
    console.error(`getMe failed: ${json.description}`);
    process.exit(4);
  }
  process.exit(0);
}

let text: string;
if (args.includes('--strong')) {
  text = [
    '🎾 <b>STRONG pick</b> — Roland Garros 2026',
    '',
    '<b>Zhang Shuai</b> vs Parry — Strasbourg',
    'Cote Unibet: <b>2.15</b> · Modèle: 61.3%',
    'Edge: +31.8% · Score: 100/100 · Kelly: 2.00%',
    '',
    'Mise suggérée: 4€ (sur bankroll 200€)',
    '',
    'Place via Unibet puis <code>/placed pick_xxx 4</code> ici.'
  ].join('\n');
} else if (args.includes('--digest')) {
  text = [
    '📊 <b>Digest tennis — 19/05/2026</b>',
    '',
    'Bets placés: 1 (€2 staked)',
    'P&amp;L jour: -€2.00 (1 lost)',
    'Net all-time: -€2.00',
    '',
    'Demain — 1 STRONG + 15 PLAY identifiés.',
    'Top: Zhang @2.15 (Strasbourg, 13h30 Paris).'
  ].join('\n');
} else if (args.length > 0 && !args[0].startsWith('--')) {
  text = args.join(' ');
} else {
  text = '🤖 Test Telegram — bot opérationnel ✅';
}

console.log(`▶ Sending to ${ids.length} chat(s)…`);
console.log(`Text:\n${text}`);
console.log('');

for (const chatId of ids) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    })
  });
  const json = (await res.json()) as { ok: boolean; description?: string; result?: { message_id: number } };
  if (json.ok) {
    console.log(`✓ chat ${chatId}: message_id=${json.result?.message_id}`);
  } else {
    console.error(`✗ chat ${chatId}: ${json.description}`);
    process.exit(4);
  }
}

console.log('✓ Done — check Telegram');
process.exit(0);
