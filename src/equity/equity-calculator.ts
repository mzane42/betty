import { createRequire } from 'node:module';
import type { Database } from '../db/database.js';

interface PokerOddsResult {
  hand: string[];
  count: number;
  wins: number;
  ties: number;
  favourite: boolean;
}

interface PokerOdds {
  calculateEquity(
    hands: string[][],
    board: string[],
    iterations?: number,
    exhaustive?: boolean
  ): PokerOddsResult[];
}

const require_ = createRequire(import.meta.url);
const pokerOdds: PokerOdds = require_('poker-odds');

export interface EquityResult {
  preflop: number | null;
  flop: number | null;
  turn: number | null;
  river: number | null;
}

/**
 * Compute hero equity vs villain(s) at each street. Returns null when board insufficient.
 * Pre-flop & river use exhaustive when possible. Flop/turn use 20k Monte Carlo.
 */
export function computeEquity(heroCards: string[], villainCards: string[][], board: string[]): EquityResult {
  if (heroCards.length !== 2) return { preflop: null, flop: null, turn: null, river: null };
  const villains = villainCards.filter((v) => v.length === 2);
  if (villains.length === 0) return { preflop: null, flop: null, turn: null, river: null };

  const hands = [heroCards, ...villains];
  return {
    preflop: equityAt(hands, []),
    flop: board.length >= 3 ? equityAt(hands, board.slice(0, 3)) : null,
    turn: board.length >= 4 ? equityAt(hands, board.slice(0, 4)) : null,
    river: board.length >= 5 ? equityAt(hands, board.slice(0, 5)) : null
  };
}

function equityAt(hands: string[][], board: string[]): number | null {
  try {
    const exhaustive = board.length >= 4;
    const iterations = exhaustive ? undefined : 20000;
    const results = pokerOdds.calculateEquity(hands, board, iterations, exhaustive);
    const hero = results[0];
    if (!hero || hero.count === 0) return null;
    return ((hero.wins + hero.ties / 2) / hero.count) * 100;
  } catch (err) {
    console.error('[equity] failed', err);
    return null;
  }
}

interface HandRow {
  hand_id: string;
  hero_cards: string;
  board: string | null;
}

interface PlayerRow {
  hand_id: string;
  cards: string;
}

/**
 * Backfill equity for all showdown hands where both hero + at least one villain card known.
 */
export function backfillEquity(db: Database, opts: { onProgress?: (done: number, total: number) => void; limit?: number } = {}): { processed: number; updated: number } {
  const hands = db
    .prepare(
      `SELECT h.hand_id, h.hero_cards, h.board
       FROM hands h
       WHERE h.hero_cards IS NOT NULL
         AND h.equity_computed_at IS NULL
         AND EXISTS (
           SELECT 1 FROM hand_players hp WHERE hp.hand_id = h.hand_id AND hp.is_hero = 0 AND hp.cards IS NOT NULL
         )
       ${opts.limit ? 'LIMIT ' + Number(opts.limit) : ''}`
    )
    .all() as HandRow[];

  const villainStmt = db.prepare(
    `SELECT hand_id, cards FROM hand_players WHERE hand_id = ? AND is_hero = 0 AND cards IS NOT NULL`
  );
  const updateStmt = db.prepare(
    `UPDATE hands SET
       hero_equity_preflop = ?,
       hero_equity_flop = ?,
       hero_equity_turn = ?,
       hero_equity_river = ?,
       equity_computed_at = ?
     WHERE hand_id = ?`
  );

  let updated = 0;
  const now = new Date().toISOString();
  hands.forEach((h, i) => {
    const villains = (villainStmt.all(h.hand_id) as PlayerRow[]).map((p) => JSON.parse(p.cards) as string[]);
    if (villains.length === 0) return;
    const hero = JSON.parse(h.hero_cards) as string[];
    const board = h.board ? (JSON.parse(h.board) as string[]) : [];
    const eq = computeEquity(hero, villains, board);
    updateStmt.run(eq.preflop, eq.flop, eq.turn, eq.river, now, h.hand_id);
    updated++;
    if (opts.onProgress && (i + 1) % 50 === 0) opts.onProgress(i + 1, hands.length);
  });

  return { processed: hands.length, updated };
}
