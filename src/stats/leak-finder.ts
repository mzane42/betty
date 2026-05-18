import type { Database } from '../db/database.js';

export interface Leak {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  cost: number;
  costUnit: 'eur' | 'chips';
  recommendation: string;
}

/**
 * Identify systematic weaknesses from hero's hand history.
 */
export function findLeaks(db: Database, heroAccount: string): Leak[] {
  const leaks: Leak[] = [];

  leaks.push(...detectFormatLeaks(db, heroAccount));
  leaks.push(...detectPositionLeaks(db, heroAccount));
  leaks.push(...detectShovingLeaks(db, heroAccount));
  leaks.push(...detectAllInLoss(db, heroAccount));

  // Sort by severity, then cost
  const sevOrder = { high: 0, medium: 1, low: 2 };
  leaks.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || b.cost - a.cost);
  return leaks;
}

function detectFormatLeaks(db: Database, heroAccount: string): Leak[] {
  const rows = db
    .prepare(
      `SELECT
        CASE
          WHEN name LIKE '%Expresso%' THEN 'Expresso'
          WHEN name LIKE '%Hit&Run%' THEN 'Hit&Run'
          ELSE 'Other'
        END as format,
        COUNT(*) as n,
        COALESCE(SUM(buy_in + rake),0) as paid,
        COALESCE(SUM(hero_winnings),0) as won
      FROM tournaments
      WHERE hero_account = ? AND name != 'CashGame'
      GROUP BY format
      HAVING n >= 30`
    )
    .all(heroAccount) as { format: string; n: number; paid: number; won: number }[];

  const leaks: Leak[] = [];
  for (const r of rows) {
    const net = r.won - r.paid;
    const roi = r.paid > 0 ? (net / r.paid) * 100 : 0;
    if (roi < -10) {
      leaks.push({
        id: `format-${r.format.toLowerCase()}`,
        title: `${r.format}: ROI ${roi.toFixed(1)}%`,
        severity: roi < -25 ? 'high' : 'medium',
        description: `Played ${r.n} ${r.format} tournaments for ${net.toFixed(2)}€ net (${roi.toFixed(1)}% ROI).`,
        cost: Math.abs(net),
        costUnit: 'eur',
        recommendation:
          roi < -25
            ? `Stop playing ${r.format} or take coaching. Current ROI is unsustainable.`
            : `Review ${r.format} strategy. Consider moving down in buy-in or taking a break.`
      });
    }
  }
  return leaks;
}

function detectPositionLeaks(db: Database, heroAccount: string): Leak[] {
  const rows = db
    .prepare(
      `SELECT hero_position as pos,
        COUNT(*) as n,
        COALESCE(SUM(hero_won - hero_invested), 0) as net
      FROM hands
      WHERE hero_account = ? AND hero_position IS NOT NULL
      GROUP BY pos`
    )
    .all(heroAccount) as { pos: string; n: number; net: number }[];

  const leaks: Leak[] = [];
  for (const r of rows) {
    if (r.n < 100) continue;
    const net = r.net ?? 0;
    const netPerHand = net / r.n;
    if (r.pos === 'BB' && netPerHand < -10) {
      leaks.push({
        id: `position-bb`,
        title: `Big Blind defense leak`,
        severity: 'medium',
        description: `Losing ${net.toFixed(0)} chips total from BB over ${r.n} hands (${netPerHand.toFixed(1)}/hand).`,
        cost: Math.abs(net),
        costUnit: 'chips',
        recommendation: 'BB always loses some, but check if you defend too wide or fold to steals too much.'
      });
    }
    if (r.pos === 'SB' && netPerHand < -15) {
      leaks.push({
        id: `position-sb`,
        title: `Small Blind leak`,
        severity: 'high',
        description: `Losing ${net.toFixed(0)} chips total from SB over ${r.n} hands.`,
        cost: Math.abs(net),
        costUnit: 'chips',
        recommendation: 'SB is the worst position. Tighten up. Avoid limping. Steal more, defend less.'
      });
    }
  }
  return leaks;
}

function detectShovingLeaks(db: Database, heroAccount: string): Leak[] {
  // Heroes' all-in losses on preflop
  const row = db
    .prepare(
      `SELECT COUNT(*) as n, COALESCE(SUM(hero_won - hero_invested), 0) as net
       FROM hands h
       WHERE h.hero_account = ? AND EXISTS (
         SELECT 1 FROM actions a
         WHERE a.hand_id = h.hand_id AND a.player_name = ?
         AND a.is_all_in = 1 AND a.street = 'PRE-FLOP'
       )`
    )
    .get(heroAccount, heroAccount) as { n: number; net: number };

  if (row.n < 30) return [];
  const net = row.net ?? 0;
  const winRate = net / Math.max(row.n, 1);
  if (winRate < -50) {
    return [
      {
        id: 'allin-preflop',
        title: 'Pre-flop all-in pattern is unprofitable',
        severity: 'high',
        description: `Went all-in pre-flop ${row.n} times, net ${net.toFixed(0)} chips.`,
        cost: Math.abs(net),
        costUnit: 'chips',
        recommendation:
          'Your shove range is likely too wide or your call range is too loose. Tighten up shoving spots, especially in early/mid stages.'
      }
    ];
  }
  return [];
}

function detectAllInLoss(db: Database, heroAccount: string): Leak[] {
  const rows = db
    .prepare(
      `SELECT COUNT(*) as n, COALESCE(SUM(hero_won - hero_invested), 0) as net
       FROM hands
       WHERE hero_account = ?
       AND hero_invested > 0
       AND hero_won = 0
       AND hero_invested > 500`
    )
    .get(heroAccount) as { n: number; net: number };

  if (rows.n < 50) return [];
  const net = rows.net ?? 0;

  return [
    {
      id: 'big-pots-lost',
      title: 'Lost too many big pots',
      severity: 'medium',
      description: `${rows.n} hands where you invested 500+ chips and won nothing. Total cost: ${net.toFixed(0)} chips.`,
      cost: Math.abs(net),
      costUnit: 'chips',
      recommendation:
        'Review losing all-ins. Pattern often: calling all-ins too wide with marginal holdings (AK suited, AJ).'
    }
  ];
}
