import type { Database } from '../db/database.js';

export interface GameRecommendation {
  format: string;
  stake: string;
  tournamentsPlayed: number;
  roi: number;
  netResult: number;
  confidence: 'high' | 'medium' | 'low';
  recommendation: 'play more' | 'keep playing' | 'avoid' | 'investigate';
}

/**
 * Recommend game formats/stakes based on hero's historical ROI per format/stake bucket.
 */
export function recommendGames(db: Database, heroAccount: string): GameRecommendation[] {
  const rows = db
    .prepare(
      `SELECT
        CASE
          WHEN name LIKE '%Expresso%' THEN 'Expresso'
          WHEN name LIKE '%Hit&Run%' THEN 'Hit&Run'
          WHEN name LIKE '%Campus%' THEN 'Campus League'
          WHEN name LIKE '%Starting Block%' THEN 'Starting Block'
          WHEN name LIKE '%Freeroll%' THEN 'Freeroll'
          ELSE 'Other'
        END as format,
        ROUND(buy_in + rake, 2) as stake,
        COUNT(*) as n,
        SUM(buy_in + rake) as paid,
        SUM(COALESCE(hero_winnings, 0)) as won
      FROM tournaments
      WHERE hero_account = ?
      GROUP BY format, stake
      ORDER BY n DESC`
    )
    .all(heroAccount) as { format: string; stake: number; n: number; paid: number; won: number }[];

  const recs: GameRecommendation[] = [];
  for (const r of rows) {
    if (r.n < 10) continue;
    const net = r.won - r.paid;
    const roi = r.paid > 0 ? (net / r.paid) * 100 : 0;
    const confidence: GameRecommendation['confidence'] =
      r.n >= 200 ? 'high' : r.n >= 50 ? 'medium' : 'low';
    let recommendation: GameRecommendation['recommendation'];
    if (roi > 5) recommendation = 'play more';
    else if (roi > -5) recommendation = 'keep playing';
    else if (roi < -20 && confidence === 'high') recommendation = 'avoid';
    else recommendation = 'investigate';

    recs.push({
      format: r.format,
      stake: `${r.stake.toFixed(2)}€`,
      tournamentsPlayed: r.n,
      roi,
      netResult: net,
      confidence,
      recommendation
    });
  }

  // Sort: high confidence + good ROI first
  recs.sort((a, b) => b.roi - a.roi);
  return recs;
}
