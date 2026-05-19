import type { Database } from '../db/database.js';
import { btnShoveVerdict, sbShoveVerdict, bbCallVerdict, handCode, type NashVerdict } from './nash-3max.js';

export interface NashTag {
  hand_id: string;
  hand_code: string;
  position: string;
  stack_bb: number;
  action: 'shove' | 'call' | 'fold';
  nash_verdict: NashVerdict;
  off_nash: boolean;
  cost_bb: number; // hero net in BB (signed)
}

export interface NashStats {
  total: number;
  inRange: number;
  marginal: number;
  outOfRange: number;
  totalCostBb: number; // sum of net for off-Nash decisions only
}

/**
 * Scan every hand <12 BB where hero either shoved pre-flop or called an all-in pre-flop.
 * Returns Nash compliance per hand.
 */
export function tagNashCompliance(db: Database, heroAccount: string): NashTag[] {
  // Hands where hero shoved pre-flop
  const heroShoves = db
    .prepare(
      `SELECT DISTINCT h.hand_id, h.hero_cards, h.hero_position, h.big_blind, hp.stack_start,
        (h.hero_won - h.hero_invested) as hero_net
       FROM hands h
       JOIN hand_players hp ON hp.hand_id = h.hand_id AND hp.is_hero = 1
       WHERE h.hero_account = ? AND h.big_blind > 0
         AND h.hero_cards IS NOT NULL
         AND h.hand_id IN (
           SELECT hand_id FROM actions
           WHERE player_name = ? AND is_all_in = 1 AND street = 'PRE-FLOP'
             AND action_type IN ('raises', 'bets', 'shoves', 'all-in')
         )`
    )
    .all(heroAccount, heroAccount) as Array<{
    hand_id: string;
    hero_cards: string;
    hero_position: string | null;
    big_blind: number;
    stack_start: number;
    hero_net: number;
  }>;

  const tags: NashTag[] = [];

  for (const row of heroShoves) {
    const cards = JSON.parse(row.hero_cards) as string[];
    const code = handCode(cards);
    if (!code || !row.hero_position) continue;
    const stackBb = row.stack_start / row.big_blind;
    if (stackBb > 15) continue;

    let verdict: NashVerdict;
    if (row.hero_position === 'SB') verdict = sbShoveVerdict(code, stackBb);
    else if (row.hero_position === 'BTN') verdict = btnShoveVerdict(code, stackBb);
    else continue; // not in 3-max push/fold zone for BB shoves

    tags.push({
      hand_id: row.hand_id,
      hand_code: code,
      position: row.hero_position,
      stack_bb: Math.round(stackBb * 10) / 10,
      action: 'shove',
      nash_verdict: verdict,
      off_nash: verdict === 'out',
      cost_bb: row.hero_net / row.big_blind
    });
  }

  // Hands where hero called an all-in pre-flop (not himself the shover)
  const heroCalls = db
    .prepare(
      `SELECT DISTINCT h.hand_id, h.hero_cards, h.hero_position, h.big_blind, hp.stack_start,
        (h.hero_won - h.hero_invested) as hero_net
       FROM hands h
       JOIN hand_players hp ON hp.hand_id = h.hand_id AND hp.is_hero = 1
       WHERE h.hero_account = ? AND h.big_blind > 0
         AND h.hero_cards IS NOT NULL
         AND h.hand_id IN (
           SELECT hand_id FROM actions
           WHERE player_name = ? AND action_type = 'calls' AND is_all_in = 1 AND street = 'PRE-FLOP'
         )`
    )
    .all(heroAccount, heroAccount) as Array<{
    hand_id: string;
    hero_cards: string;
    hero_position: string | null;
    big_blind: number;
    stack_start: number;
    hero_net: number;
  }>;

  for (const row of heroCalls) {
    const cards = JSON.parse(row.hero_cards) as string[];
    const code = handCode(cards);
    if (!code) continue;
    const stackBb = row.stack_start / row.big_blind;
    if (stackBb > 20) continue;
    const verdict = bbCallVerdict(code, stackBb);

    tags.push({
      hand_id: row.hand_id,
      hand_code: code,
      position: row.hero_position ?? '?',
      stack_bb: Math.round(stackBb * 10) / 10,
      action: 'call',
      nash_verdict: verdict,
      off_nash: verdict === 'out',
      cost_bb: row.hero_net / row.big_blind
    });
  }

  return tags;
}

export function nashStats(tags: NashTag[]): NashStats {
  const total = tags.length;
  let inRange = 0;
  let marginal = 0;
  let outOfRange = 0;
  let totalCostBb = 0;
  for (const t of tags) {
    if (t.nash_verdict === 'in') inRange++;
    else if (t.nash_verdict === 'marginal') marginal++;
    else {
      outOfRange++;
      totalCostBb += t.cost_bb;
    }
  }
  return { total, inRange, marginal, outOfRange, totalCostBb };
}
