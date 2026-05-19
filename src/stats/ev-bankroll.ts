import type { Database } from '../db/database.js';

export interface EvBankrollPoint {
  date: string;
  actual_net: number;
  ev_net: number;
  cumulative_actual: number;
  cumulative_ev: number;
}

interface RawRow {
  date: string;
  hand_id: string;
  hero_won: number;
  hero_invested: number;
  total_pot: number;
  big_blind: number;
  stack_start: number;
  eq_pre: number | null;
  eq_flop: number | null;
  eq_turn: number | null;
  eq_river: number | null;
}

/**
 * Cumulative actual vs equity-fair bankroll. For each hand where hero committed
 * a significant portion of stack and equity is known, we compute the
 * "fair" net = total_pot * equity - hero_invested. Cumulative over time = the
 * graph a perfect (variance-free) version of the same play would have produced.
 *
 * Hands where hero folded with little invested keep actual=actual_net, ev=actual_net.
 */
export function getEvBankroll(db: Database, heroAccount: string): EvBankrollPoint[] {
  const rows = db
    .prepare(
      `SELECT
        DATE(t.start_time) as date,
        h.hand_id, h.hero_won, h.hero_invested, h.total_pot, h.big_blind,
        hp.stack_start,
        h.hero_equity_preflop as eq_pre,
        h.hero_equity_flop as eq_flop,
        h.hero_equity_turn as eq_turn,
        h.hero_equity_river as eq_river
       FROM hands h
       JOIN tournaments t ON h.tournament_id = t.tournament_id
       JOIN hand_players hp ON hp.hand_id = h.hand_id AND hp.is_hero = 1
       WHERE h.hero_account = ? AND t.start_time IS NOT NULL
       ORDER BY t.start_time ASC, h.played_at ASC`
    )
    .all(heroAccount) as RawRow[];

  const byDate = new Map<string, { actual: number; ev: number }>();

  for (const r of rows) {
    const actualNet = r.hero_won - r.hero_invested;
    let evNet = actualNet;

    const equity = pickCommitEquity(r);
    const commitRatio = r.stack_start > 0 ? r.hero_invested / r.stack_start : 0;

    if (equity != null && commitRatio >= 0.5 && r.total_pot > 0) {
      // Fair payout if equity were realized exactly
      evNet = (r.total_pot * equity) / 100 - r.hero_invested;
    }

    const bucket = byDate.get(r.date) ?? { actual: 0, ev: 0 };
    bucket.actual += actualNet;
    bucket.ev += evNet;
    byDate.set(r.date, bucket);
  }

  // Order by date and accumulate. Net is in chips — convert to € is downstream concern.
  const dates = [...byDate.keys()].sort();
  let cumA = 0;
  let cumE = 0;
  const points: EvBankrollPoint[] = [];
  for (const d of dates) {
    const b = byDate.get(d)!;
    cumA += b.actual;
    cumE += b.ev;
    points.push({
      date: d,
      actual_net: b.actual,
      ev_net: b.ev,
      cumulative_actual: cumA,
      cumulative_ev: cumE
    });
  }
  return points;
}

/**
 * For luck-adjusted EV, pick the equity at the latest street where hero was
 * still informed (not the resolved showdown values 0/100). We want the
 * "what was hero's edge when chips went in" number.
 */
function pickCommitEquity(r: RawRow): number | null {
  // If river equity is 0 or 100, that's the resolved outcome — skip it for variance calc.
  const usable = (v: number | null): boolean => v != null && v > 0.5 && v < 99.5;
  if (usable(r.eq_turn)) return r.eq_turn;
  if (usable(r.eq_flop)) return r.eq_flop;
  if (usable(r.eq_pre)) return r.eq_pre;
  return null;
}
