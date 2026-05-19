import type { Database } from '../db/database.js';

export interface TimeBucket {
  bucket: 'morning' | 'afternoon' | 'evening' | 'night';
  tournaments: number;
  net: number;
  roi: number;
}

export interface TiltMetric {
  /** Average ROI of the *first* tournament in multi-tournament sessions. */
  firstAvgRoi: number;
  /** Average ROI of the *last* tournament in multi-tournament sessions. */
  lastAvgRoi: number;
  /** Difference: negative means late-session degradation. */
  delta: number;
  multiSessionCount: number;
}

export interface TimeAnalysis {
  buckets: TimeBucket[];
  tilt: TiltMetric;
}

const BUCKETS: Array<{ name: TimeBucket['bucket']; hours: number[] }> = [
  { name: 'morning', hours: [6, 7, 8, 9, 10, 11] },
  { name: 'afternoon', hours: [12, 13, 14, 15, 16, 17] },
  { name: 'evening', hours: [18, 19, 20, 21, 22, 23] },
  { name: 'night', hours: [0, 1, 2, 3, 4, 5] }
];

interface TournamentRow {
  start_time: string;
  buy_in: number;
  rake: number;
  hero_winnings: number | null;
}

export function analyzeTimeOfDay(db: Database, heroAccount: string): TimeAnalysis {
  const rows = db
    .prepare(
      `SELECT start_time, buy_in, rake, hero_winnings
       FROM tournaments
       WHERE hero_account = ? AND start_time IS NOT NULL`
    )
    .all(heroAccount) as TournamentRow[];

  const byBucket: Map<TimeBucket['bucket'], { n: number; net: number; paid: number }> = new Map();
  for (const b of BUCKETS) byBucket.set(b.name, { n: 0, net: 0, paid: 0 });

  for (const r of rows) {
    const hour = new Date(r.start_time).getHours();
    const b = BUCKETS.find((x) => x.hours.includes(hour));
    if (!b) continue;
    const cost = r.buy_in + r.rake;
    const won = r.hero_winnings ?? 0;
    const bucket = byBucket.get(b.name)!;
    bucket.n++;
    bucket.net += won - cost;
    bucket.paid += cost;
  }

  const buckets: TimeBucket[] = [...byBucket.entries()].map(([bucket, data]) => ({
    bucket,
    tournaments: data.n,
    net: data.net,
    roi: data.paid > 0 ? (data.net / data.paid) * 100 : 0
  }));

  // Late-session tilt: per session date, compare first vs last tournament ROI
  const byDate = new Map<string, TournamentRow[]>();
  for (const r of rows) {
    const date = r.start_time.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(r);
  }

  let firstSum = 0;
  let firstPaid = 0;
  let lastSum = 0;
  let lastPaid = 0;
  let multiCount = 0;
  for (const [, tournaments] of byDate) {
    if (tournaments.length < 2) continue;
    multiCount++;
    const sorted = tournaments.slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    firstSum += (first.hero_winnings ?? 0) - first.buy_in - first.rake;
    firstPaid += first.buy_in + first.rake;
    lastSum += (last.hero_winnings ?? 0) - last.buy_in - last.rake;
    lastPaid += last.buy_in + last.rake;
  }
  const firstAvgRoi = firstPaid > 0 ? (firstSum / firstPaid) * 100 : 0;
  const lastAvgRoi = lastPaid > 0 ? (lastSum / lastPaid) * 100 : 0;

  return {
    buckets,
    tilt: {
      firstAvgRoi,
      lastAvgRoi,
      delta: lastAvgRoi - firstAvgRoi,
      multiSessionCount: multiCount
    }
  };
}
