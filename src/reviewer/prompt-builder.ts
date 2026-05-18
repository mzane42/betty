import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '../db/database.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

interface ActionRow {
  street: string;
  action_order: number;
  player_name: string;
  action_type: string;
  amount: number;
  is_all_in: number;
}

interface HandPlayerRow {
  player_name: string;
  seat: number;
  position: string;
  stack_start: number;
  is_hero: number;
  cards: string | null;
  won: number;
}

interface HandRow {
  hand_id: string;
  tournament_name: string;
  level: number | null;
  ante: number;
  small_blind: number;
  big_blind: number;
  table_size: number;
  button_seat: number;
  board: string | null;
  total_pot: number;
  played_at: string;
  hero_cards: string | null;
  hero_position: string | null;
  hero_won: number;
  hero_invested: number;
}

/**
 * Render a single hand as a compact human-readable string for Claude to analyze.
 */
export function renderHandForReview(db: Database, handId: string): string {
  const hand = db.prepare('SELECT * FROM hands WHERE hand_id = ?').get(handId) as HandRow | undefined;
  if (!hand) throw new Error(`Hand not found: ${handId}`);

  const players = db
    .prepare('SELECT * FROM hand_players WHERE hand_id = ? ORDER BY seat')
    .all(handId) as HandPlayerRow[];

  const actions = db
    .prepare('SELECT * FROM actions WHERE hand_id = ? ORDER BY action_order ASC')
    .all(handId) as ActionRow[];

  const board = hand.board ? (JSON.parse(hand.board) as string[]) : [];
  const heroCards = hand.hero_cards ? (JSON.parse(hand.hero_cards) as string[]) : null;

  const lines: string[] = [];
  lines.push(`Hand: ${hand.hand_id}`);
  lines.push(`Tournament: ${hand.tournament_name} (level ${hand.level ?? '?'})`);
  lines.push(`Blinds: ${hand.ante > 0 ? hand.ante + '/' : ''}${hand.small_blind}/${hand.big_blind}`);
  lines.push(`Table: ${hand.table_size}-max, button at seat ${hand.button_seat}`);
  lines.push(`Hero position: ${hand.hero_position}`);
  if (heroCards) lines.push(`Hero cards: ${heroCards.join(' ')}`);
  lines.push('');
  lines.push('Players:');
  for (const p of players) {
    const heroMark = p.is_hero ? ' [HERO]' : '';
    const bbStack = hand.big_blind > 0 ? ` (${(p.stack_start / hand.big_blind).toFixed(1)} BB)` : '';
    lines.push(`  Seat ${p.seat} ${p.position}: ${p.player_name} ${p.stack_start}${bbStack}${heroMark}`);
  }
  lines.push('');

  const byStreet = groupActionsByStreet(actions);
  for (const street of ['PRE-FLOP', 'FLOP', 'TURN', 'RIVER'] as const) {
    const acts = byStreet.get(street) ?? [];
    if (acts.length === 0) continue;
    if (street === 'FLOP' && board.length >= 3) lines.push(`*** FLOP *** [${board.slice(0, 3).join(' ')}]`);
    else if (street === 'TURN' && board.length >= 4) lines.push(`*** TURN *** [${board[3]}]`);
    else if (street === 'RIVER' && board.length >= 5) lines.push(`*** RIVER *** [${board[4]}]`);
    else lines.push(`*** ${street} ***`);
    for (const a of acts) {
      const allIn = a.is_all_in ? ' (ALL-IN)' : '';
      lines.push(`  ${a.player_name} ${a.action_type} ${a.amount}${allIn}`);
    }
  }

  lines.push('');
  lines.push(`Pot total: ${hand.total_pot}`);
  lines.push(`Hero invested: ${hand.hero_invested}`);
  lines.push(`Hero won: ${hand.hero_won}`);
  lines.push(`Hero net: ${(hand.hero_won - hand.hero_invested).toFixed(2)}`);

  return lines.join('\n');
}

function groupActionsByStreet(actions: ActionRow[]): Map<string, ActionRow[]> {
  const map = new Map<string, ActionRow[]>();
  for (const a of actions) {
    if (!map.has(a.street)) map.set(a.street, []);
    map.get(a.street)!.push(a);
  }
  return map;
}

export function loadBasePrompt(): string {
  return readPromptFile('review-base.md');
}

export function loadSessionPrompt(): string {
  return readPromptFile('review-session.md');
}

function readPromptFile(name: string): string {
  const candidates = [
    join(__dirname, '../../prompts', name),
    join(__dirname, '../../../prompts', name),
    join(process.cwd(), 'prompts', name)
  ];
  for (const c of candidates) {
    try {
      return readFileSync(c, 'utf-8');
    } catch {
      // try next
    }
  }
  throw new Error(`Prompt file not found: ${name}`);
}

export function renderSessionForReview(db: Database, sessionDate: string, heroAccount: string): string {
  const tournaments = db
    .prepare(
      `SELECT * FROM tournaments WHERE hero_account = ? AND DATE(start_time) = ? ORDER BY start_time ASC`
    )
    .all(heroAccount, sessionDate) as Array<{
    tournament_id: string;
    name: string;
    buy_in: number;
    rake: number;
    hero_finish_position: number;
    hero_winnings: number | null;
    start_time: string;
  }>;

  const lines: string[] = [];
  lines.push(`Session: ${sessionDate}`);
  lines.push(`Hero: ${heroAccount}`);
  lines.push(`Tournaments: ${tournaments.length}`);
  lines.push('');
  let totalNet = 0;
  for (const t of tournaments) {
    const won = t.hero_winnings ?? 0;
    const cost = t.buy_in + t.rake;
    const net = won - cost;
    totalNet += net;
    lines.push(
      `- ${t.name} (${t.start_time}) — buy-in ${cost.toFixed(2)}€, finished ${t.hero_finish_position}, won ${won.toFixed(
        2
      )}€, net ${net.toFixed(2)}€`
    );
  }
  lines.push('');
  lines.push(`Session net: ${totalNet.toFixed(2)}€`);

  // Add aggregated hand stats for the session
  const handStats = db
    .prepare(
      `SELECT COUNT(*) as n, AVG(total_pot) as avg_pot FROM hands h
       JOIN tournaments t ON h.tournament_id = t.tournament_id
       WHERE t.hero_account = ? AND DATE(t.start_time) = ?`
    )
    .get(heroAccount, sessionDate) as { n: number; avg_pot: number };
  lines.push(`Hands played: ${handStats.n}`);
  lines.push(`Avg pot: ${handStats.avg_pot?.toFixed(2) ?? '0'} chips`);

  return lines.join('\n');
}
