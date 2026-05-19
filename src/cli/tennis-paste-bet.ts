/**
 * tennis-paste-bet — paste an Unibet/Winamax/Betclic bet ticket as raw text,
 * Claude parses it, fuzzy-matches players against DB, inserts the bet row.
 *
 * Usage:
 *   pbpaste | bun run tennis-paste-bet
 *   bun run tennis-paste-bet "K.Mladenovic - Xiyu.Wang ... Mise 2,00 EUR ..."
 *
 * Output: bet_id, parsed fields, summary.
 *
 * Terminal-driven UAT — no Pick manuel form, no clicking.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { defaultDbPath, openDatabase } from '../db/index.js';
import { invokeClaude } from '../reviewer/claude-reviewer.js';
import { insertBet } from '../db/repositories/tennis-repository.js';
import type { TennisBet, TennisBook } from '../types/tennis.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
for (const file of ['.env.local', '.env']) {
  loadDotenv({ path: resolve(PROJECT_ROOT, file), override: false });
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROMPT_PATH = resolve(__dirname, '..', '..', 'prompts', 'tennis-paste-bet-parser.md');

async function readStdin(): Promise<string> {
  return new Promise((done) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => done(data));
  });
}

const argText = process.argv.slice(2).join(' ').trim();
let rawText: string;
if (argText.length > 0) {
  rawText = argText;
} else if (!process.stdin.isTTY) {
  rawText = (await readStdin()).trim();
} else {
  console.error('Usage: bun run tennis-paste-bet "<ticket text>" OR pbpaste | bun run tennis-paste-bet');
  process.exit(2);
}

if (!rawText) {
  console.error('Empty input');
  process.exit(2);
}

const systemPrompt = readFileSync(PROMPT_PATH, 'utf-8');
console.log('Parsing ticket via Claude...');
const raw = await invokeClaude({ systemPrompt, userPrompt: rawText });
const parsed = extractJson(raw);

if ('error' in parsed) {
  console.error(`Claude said: ${(parsed as { error: string }).error}`);
  console.error(`Raw response: ${raw.slice(0, 300)}`);
  process.exit(3);
}

const ticket = parsed as {
  selection: string | null;
  opponent: string | null;
  decimal_odds: number | null;
  stake_eur: number | null;
  market: string | null;
  book: string | null;
  is_live: boolean | null;
  potential_winnings_eur: number | null;
  raw_match_label: string | null;
};

console.log('Parsed:');
for (const [k, v] of Object.entries(ticket)) console.log(`  ${k}: ${JSON.stringify(v)}`);

if (!ticket.selection || !ticket.opponent || !ticket.decimal_odds || !ticket.stake_eur) {
  console.error('Missing required fields (selection/opponent/odds/stake). Aborting.');
  process.exit(4);
}

const db = openDatabase({ dbPath: defaultDbPath() });

const selId = fuzzyFindPlayerId(db, ticket.selection);
const oppId = fuzzyFindPlayerId(db, ticket.opponent);

console.log(`Selection match: ${ticket.selection} -> ${selId ?? '(no DB match)'}`);
console.log(`Opponent match: ${ticket.opponent} -> ${oppId ?? '(no DB match)'}`);

if (!selId || !oppId) {
  console.error('Players not found in DB. Run `bun run tennis-scan` first to ingest today/tomorrow slate.');
  process.exit(5);
}

const matchRow = findMatch(db, selId, oppId);
if (!matchRow) {
  console.error(`No tennis_matches row for ${selId} vs ${oppId}. Run \`bun run tennis-scan\` to refresh.`);
  process.exit(6);
}
console.log(`Match: ${matchRow.match_id} (${matchRow.tournament}, ${matchRow.scheduled_at})`);

const book = (ticket.book ?? 'unibet') as TennisBook;
const betId = `bet_${Date.now()}_${randomBytes(4).toString('hex')}`;
const bet: TennisBet = {
  betId,
  pickId: null,
  matchId: matchRow.match_id,
  selection: selId,
  book,
  decimalOdds: ticket.decimal_odds,
  stakeEur: ticket.stake_eur,
  placedAt: new Date().toISOString(),
  result: null,
  pnlEur: null,
  closingOdds: null,
  postMatchReviewJson: null
};
insertBet(db, bet);

const potential = ticket.potential_winnings_eur ?? ticket.stake_eur * ticket.decimal_odds;
console.log('');
console.log(`OK: bet inserted -> ${betId}`);
console.log(`  ${selId} @${ticket.decimal_odds} stake EUR ${ticket.stake_eur} potential EUR ${potential.toFixed(2)}`);
console.log('');
console.log(`Settle later: bun run tennis-settle ${betId} <won|lost|void> [closing_odds]`);

process.exit(0);

function extractJson(s: string): Record<string, unknown> {
  const trimmed = s.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fenced = /```json\s*\n([\s\S]*?)\n```/m.exec(trimmed);
    if (fenced) return JSON.parse(fenced[1]) as Record<string, unknown>;
    const open = trimmed.indexOf('{');
    const close = trimmed.lastIndexOf('}');
    if (open >= 0 && close > open) {
      return JSON.parse(trimmed.slice(open, close + 1)) as Record<string, unknown>;
    }
  }
  throw new Error(`Claude response not JSON: ${trimmed.slice(0, 300)}`);
}

function fuzzyFindPlayerId(db: ReturnType<typeof openDatabase>, displayName: string): string | null {
  const cleaned = displayName
    .replace(/\./g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = cleaned.split(' ').filter((t) => t.length > 1);
  const surname = tokens[tokens.length - 1];
  const firstInitial = tokens.length > 1 ? tokens[0][0].toUpperCase() : null;

  const candidates = db
    .prepare(`SELECT player_id, name FROM tennis_players WHERE name LIKE ? COLLATE NOCASE`)
    .all(`%${surname}%`) as Array<{ player_id: string; name: string }>;

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].player_id;

  if (firstInitial) {
    const initialMatch = candidates.find((c) => c.name.toUpperCase().startsWith(firstInitial));
    if (initialMatch) return initialMatch.player_id;
  }
  return candidates[0].player_id;
}

function findMatch(
  db: ReturnType<typeof openDatabase>,
  p1: string,
  p2: string
): { match_id: string; tournament: string; scheduled_at: string } | null {
  const row = db
    .prepare(
      `SELECT match_id, tournament, scheduled_at FROM tennis_matches
       WHERE (player1_id=? AND player2_id=?) OR (player1_id=? AND player2_id=?)
       ORDER BY scheduled_at DESC LIMIT 1`
    )
    .get(p1, p2, p2, p1) as
    | { match_id: string; tournament: string; scheduled_at: string }
    | undefined;
  return row ?? null;
}
