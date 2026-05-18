import type { Database } from '../db/database.js';

export interface Leak {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  cost: number;
  costUnit: 'eur' | 'chips' | 'bb';
  recommendation: string;
}

/**
 * Identify systematic weaknesses from hero's hand history.
 * All chip-based analyses are normalized to BB to be comparable across blind levels.
 */
export function findLeaks(db: Database, heroAccount: string): Leak[] {
  const leaks: Leak[] = [];

  leaks.push(...detectFormatLeaks(db, heroAccount));
  leaks.push(...detectPositionLeaks(db, heroAccount));
  leaks.push(...detectShovingLeaks(db, heroAccount));
  leaks.push(...detectBigLossesByStackDepth(db, heroAccount));

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
  // Normalize chip net to BB by dividing by hand's big_blind
  const rows = db
    .prepare(
      `SELECT hero_position as pos,
        COUNT(*) as n,
        COALESCE(SUM((hero_won - hero_invested) * 1.0 / NULLIF(big_blind, 0)), 0) as net_bb
      FROM hands
      WHERE hero_account = ? AND hero_position IS NOT NULL AND big_blind > 0
      GROUP BY pos`
    )
    .all(heroAccount) as { pos: string; n: number; net_bb: number }[];

  const leaks: Leak[] = [];
  for (const r of rows) {
    if (r.n < 100) continue;
    const netBb = r.net_bb ?? 0;
    const bbPerHand = netBb / r.n;
    if (r.pos === 'BB' && bbPerHand < -0.4) {
      leaks.push({
        id: `position-bb`,
        title: `Big Blind defense leak`,
        severity: bbPerHand < -0.6 ? 'high' : 'medium',
        description: `Perte de ${netBb.toFixed(0)} BB en BB sur ${r.n} mains (${bbPerHand.toFixed(2)} BB/main). Référence: un joueur correct perd ~0.3-0.4 BB/main en BB.`,
        cost: Math.abs(netBb),
        costUnit: 'bb',
        recommendation:
          bbPerHand < -0.6
            ? 'Tu défends trop large OU tu folds trop face aux vols. Apprends ta BB defense range et joue check-raise sur les flops favorables.'
            : "La BB perd toujours un peu, mais ton ratio est trop haut. Tighter ta défense face aux open-raises larges."
      });
    }
    if (r.pos === 'SB' && bbPerHand < -0.5) {
      leaks.push({
        id: `position-sb`,
        title: `Small Blind leak`,
        severity: bbPerHand < -0.8 ? 'high' : 'medium',
        description: `Perte de ${netBb.toFixed(0)} BB en SB sur ${r.n} mains (${bbPerHand.toFixed(2)} BB/main). Référence: ~0.4-0.5 BB/main pour un joueur winner.`,
        cost: Math.abs(netBb),
        costUnit: 'bb',
        recommendation:
          'SB = pire position. Soit shove/raise, soit fold. Jamais limper. Defend très tight face aux raises adverses.'
      });
    }
    if ((r.pos === 'BTN' || r.pos === 'CO') && bbPerHand < 0) {
      leaks.push({
        id: `position-${r.pos.toLowerCase()}`,
        title: `${r.pos} losing position`,
        severity: 'medium',
        description: `${r.pos} devrait être profitable mais tu perds ${netBb.toFixed(0)} BB sur ${r.n} mains (${bbPerHand.toFixed(2)} BB/main).`,
        cost: Math.abs(netBb),
        costUnit: 'bb',
        recommendation: `Bouton/CO = positions winning normalement. Open-raise plus large, vole les blindes.`
      });
    }
  }
  return leaks;
}

function detectShovingLeaks(db: Database, heroAccount: string): Leak[] {
  const row = db
    .prepare(
      `SELECT COUNT(*) as n,
       COALESCE(SUM((hero_won - hero_invested) * 1.0 / NULLIF(big_blind, 0)), 0) as net_bb
       FROM hands
       WHERE hero_account = ? AND big_blind > 0
       AND hand_id IN (
         SELECT DISTINCT hand_id FROM actions
         WHERE player_name = ? AND is_all_in = 1 AND street = 'PRE-FLOP'
       )`
    )
    .get(heroAccount, heroAccount) as { n: number; net_bb: number };

  if (row.n < 30) return [];
  const netBb = row.net_bb ?? 0;
  const bbPerShove = netBb / Math.max(row.n, 1);
  if (bbPerShove < -3) {
    return [
      {
        id: 'allin-preflop',
        title: 'All-ins pré-flop non rentables',
        severity: 'high',
        description: `${row.n} all-ins pré-flop pour ${netBb.toFixed(0)} BB net (${bbPerShove.toFixed(1)} BB/shove). Un push profitable devrait être >+0 BB en moyenne.`,
        cost: Math.abs(netBb),
        costUnit: 'bb',
        recommendation:
          'Ta range de shove est trop large OU ta range de call all-in trop loose. Resserre les spots: 10-15 BB seulement, premium hands. Évite de call AK/AQ contre des shoves serrés.'
      }
    ];
  }
  return [];
}

/**
 * Detect losses by stack depth (in BB). Find where the user bleeds most relative to stack size.
 * Buckets hands by stack-in-BB at start of hand, and reports the worst-performing bucket.
 */
function detectBigLossesByStackDepth(db: Database, heroAccount: string): Leak[] {
  const rows = db
    .prepare(
      `SELECT
        CASE
          WHEN hero_stack_bb < 10 THEN 'short (<10 BB)'
          WHEN hero_stack_bb < 20 THEN 'medium (10-20 BB)'
          WHEN hero_stack_bb < 40 THEN 'deep (20-40 BB)'
          ELSE 'very deep (40+ BB)'
        END as bucket,
        COUNT(*) as n,
        COALESCE(SUM(net_bb), 0) as total_net_bb,
        COALESCE(SUM(invested_bb), 0) as total_invested_bb
      FROM (
        SELECT
          hp.stack_start * 1.0 / NULLIF(h.big_blind, 0) as hero_stack_bb,
          (h.hero_won - h.hero_invested) * 1.0 / NULLIF(h.big_blind, 0) as net_bb,
          h.hero_invested * 1.0 / NULLIF(h.big_blind, 0) as invested_bb
        FROM hands h
        JOIN hand_players hp ON hp.hand_id = h.hand_id AND hp.is_hero = 1
        WHERE h.hero_account = ? AND h.big_blind > 0
      )
      WHERE hero_stack_bb IS NOT NULL
      GROUP BY bucket
      HAVING n >= 100`
    )
    .all(heroAccount) as { bucket: string; n: number; total_net_bb: number; total_invested_bb: number }[];

  const leaks: Leak[] = [];
  for (const r of rows) {
    const net = r.total_net_bb ?? 0;
    const bbPerHand = net / r.n;
    if (bbPerHand < -1) {
      leaks.push({
        id: `stack-bucket-${r.bucket.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
        title: `Stack ${r.bucket}: ${bbPerHand.toFixed(2)} BB/main`,
        severity: bbPerHand < -2 ? 'high' : 'medium',
        description: `Sur ${r.n} mains avec stack ${r.bucket}, tu perds ${net.toFixed(0)} BB (${bbPerHand.toFixed(2)} BB/main).`,
        cost: Math.abs(net),
        costUnit: 'bb',
        recommendation: stackBucketAdvice(r.bucket)
      });
    }
  }
  return leaks;
}

function stackBucketAdvice(bucket: string): string {
  if (bucket.startsWith('short')) {
    return 'Stack <10 BB = push/fold pur. Shove premium (paires, As, broadways) au bouton/CO. Fold tout le reste. Pas de call.';
  }
  if (bucket.startsWith('medium')) {
    return '10-20 BB = zone shove ou fold. Évite de call les open-raises. 3-bet shove avec ta range premium, fold le reste.';
  }
  if (bucket.startsWith('deep')) {
    return '20-40 BB = standard play. Open-raise 2-2.5x, défends large en BB en position. Évite les calls hors position.';
  }
  return 'Stack profond 40+ BB = poker post-flop. Joue plus de mains spéculatives en position, set mining, implied odds.';
}
