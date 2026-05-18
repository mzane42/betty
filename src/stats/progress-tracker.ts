import type { Database } from '../db/database.js';

export interface ProgressPoint {
  period: string;
  tournamentsPlayed: number;
  net: number;
  roi: number;
  itm: number; // in-the-money %
}

/**
 * Track hero's progress over time. Returns one row per quarter (or month if not enough data).
 */
export function getProgress(db: Database, heroAccount: string, granularity: 'quarter' | 'month' = 'quarter'): ProgressPoint[] {
  const periodExpr =
    granularity === 'quarter'
      ? `strftime('%Y', start_time) || '-Q' || CAST((CAST(strftime('%m', start_time) AS INTEGER) - 1) / 3 + 1 AS TEXT)`
      : `strftime('%Y-%m', start_time)`;

  const rows = db
    .prepare(
      `SELECT
        ${periodExpr} as period,
        COUNT(*) as n,
        SUM(buy_in + rake) as paid,
        SUM(COALESCE(hero_winnings, 0)) as won,
        SUM(CASE WHEN COALESCE(hero_winnings, 0) > 0 THEN 1 ELSE 0 END) as itm_count
      FROM tournaments
      WHERE hero_account = ? AND start_time IS NOT NULL
      GROUP BY period
      ORDER BY period ASC`
    )
    .all(heroAccount) as { period: string; n: number; paid: number; won: number; itm_count: number }[];

  return rows.map((r) => {
    const net = r.won - r.paid;
    return {
      period: r.period,
      tournamentsPlayed: r.n,
      net,
      roi: r.paid > 0 ? (net / r.paid) * 100 : 0,
      itm: r.n > 0 ? (r.itm_count / r.n) * 100 : 0
    };
  });
}
