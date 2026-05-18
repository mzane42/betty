import type { Database } from '../db/database.js';
import type {
  BankrollPoint,
  BankrollSummary,
  MonthlyBankroll,
  RoiByFormat,
  RoiByStake,
  YearlyBankroll
} from '../types/bankroll.js';

export function getBankrollSummary(db: Database, heroAccount: string): BankrollSummary {
  const totals = db
    .prepare(
      `SELECT
        COALESCE(SUM(hero_winnings), 0) - COALESCE(SUM(buy_in + rake), 0) as net,
        COUNT(*) as tournaments,
        COALESCE(SUM(buy_in + rake), 0) as buy_ins,
        COALESCE(SUM(hero_winnings), 0) as winnings
      FROM tournaments WHERE hero_account = ?`
    )
    .get(heroAccount) as {
    net: number;
    tournaments: number;
    buy_ins: number;
    winnings: number;
  };

  const hands = db
    .prepare(`SELECT COUNT(*) as n FROM hands WHERE hero_account = ?`)
    .get(heroAccount) as { n: number };

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  const yearRow = db
    .prepare(
      `SELECT COALESCE(SUM(hero_winnings),0) - COALESCE(SUM(buy_in + rake),0) as net
       FROM tournaments WHERE hero_account = ? AND strftime('%Y', start_time) = ?`
    )
    .get(heroAccount, String(currentYear)) as { net: number };

  const monthRow = db
    .prepare(
      `SELECT COALESCE(SUM(hero_winnings),0) - COALESCE(SUM(buy_in + rake),0) as net
       FROM tournaments WHERE hero_account = ?
       AND strftime('%Y', start_time) = ?
       AND CAST(strftime('%m', start_time) as INTEGER) = ?`
    )
    .get(heroAccount, String(currentYear), currentMonth) as { net: number };

  const bestMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', start_time) as month,
              COALESCE(SUM(hero_winnings),0) - COALESCE(SUM(buy_in + rake),0) as net
       FROM tournaments WHERE hero_account = ? AND start_time IS NOT NULL
       GROUP BY month ORDER BY net DESC LIMIT 1`
    )
    .get(heroAccount) as { month: string; net: number } | undefined;

  const worstMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', start_time) as month,
              COALESCE(SUM(hero_winnings),0) - COALESCE(SUM(buy_in + rake),0) as net
       FROM tournaments WHERE hero_account = ? AND start_time IS NOT NULL
       GROUP BY month ORDER BY net ASC LIMIT 1`
    )
    .get(heroAccount) as { month: string; net: number } | undefined;

  const bestYear = db
    .prepare(
      `SELECT CAST(strftime('%Y', start_time) AS INTEGER) as year,
              COALESCE(SUM(hero_winnings),0) - COALESCE(SUM(buy_in + rake),0) as net
       FROM tournaments WHERE hero_account = ? AND start_time IS NOT NULL
       GROUP BY year ORDER BY net DESC LIMIT 1`
    )
    .get(heroAccount) as { year: number; net: number } | undefined;

  const worstYear = db
    .prepare(
      `SELECT CAST(strftime('%Y', start_time) AS INTEGER) as year,
              COALESCE(SUM(hero_winnings),0) - COALESCE(SUM(buy_in + rake),0) as net
       FROM tournaments WHERE hero_account = ? AND start_time IS NOT NULL
       GROUP BY year ORDER BY net ASC LIMIT 1`
    )
    .get(heroAccount) as { year: number; net: number } | undefined;

  return {
    allTimeNet: totals.net,
    currentYearNet: yearRow.net,
    currentMonthNet: monthRow.net,
    totalBuyIns: totals.buy_ins,
    totalWinnings: totals.winnings,
    tournamentsPlayed: totals.tournaments,
    handsPlayed: hands.n,
    bestMonth: bestMonth ?? null,
    worstMonth: worstMonth ?? null,
    bestYear: bestYear ?? null,
    worstYear: worstYear ?? null
  };
}

export function getYearlyBankroll(db: Database, heroAccount: string): YearlyBankroll[] {
  const rows = db
    .prepare(
      `SELECT
        CAST(strftime('%Y', start_time) AS INTEGER) as year,
        COUNT(*) as tournaments_played,
        COALESCE(SUM(buy_in + rake), 0) as buy_ins,
        COALESCE(SUM(hero_winnings), 0) as winnings,
        COALESCE(SUM(hero_winnings), 0) - COALESCE(SUM(buy_in + rake), 0) as net
      FROM tournaments
      WHERE hero_account = ? AND start_time IS NOT NULL
      GROUP BY year
      ORDER BY year ASC`
    )
    .all(heroAccount) as {
    year: number;
    tournaments_played: number;
    buy_ins: number;
    winnings: number;
    net: number;
  }[];

  const handsPerYear = db
    .prepare(
      `SELECT CAST(strftime('%Y', played_at) AS INTEGER) as year, COUNT(*) as hands
       FROM hands WHERE hero_account = ? GROUP BY year`
    )
    .all(heroAccount) as { year: number; hands: number }[];
  const handsByYear = new Map(handsPerYear.map((r) => [r.year, r.hands]));

  return rows.map((r) => ({
    year: r.year,
    net: r.net,
    buyIns: r.buy_ins,
    winnings: r.winnings,
    tournamentsPlayed: r.tournaments_played,
    handsPlayed: handsByYear.get(r.year) ?? 0
  }));
}

export function getMonthlyBankroll(db: Database, heroAccount: string): MonthlyBankroll[] {
  const rows = db
    .prepare(
      `SELECT
        CAST(strftime('%Y', start_time) AS INTEGER) as year,
        CAST(strftime('%m', start_time) AS INTEGER) as month,
        COUNT(*) as tournaments_played,
        COALESCE(SUM(buy_in + rake), 0) as buy_ins,
        COALESCE(SUM(hero_winnings), 0) as winnings,
        COALESCE(SUM(hero_winnings), 0) - COALESCE(SUM(buy_in + rake), 0) as net
      FROM tournaments
      WHERE hero_account = ? AND start_time IS NOT NULL
      GROUP BY year, month
      ORDER BY year ASC, month ASC`
    )
    .all(heroAccount) as {
    year: number;
    month: number;
    tournaments_played: number;
    buy_ins: number;
    winnings: number;
    net: number;
  }[];

  return rows.map((r) => ({
    year: r.year,
    month: r.month,
    net: r.net,
    buyIns: r.buy_ins,
    winnings: r.winnings,
    tournamentsPlayed: r.tournaments_played
  }));
}

export function getRoiByFormat(db: Database, heroAccount: string): RoiByFormat[] {
  const rows = db
    .prepare(
      `SELECT
        CASE
          WHEN name LIKE '%Expresso%' THEN 'Expresso'
          WHEN name LIKE '%Hit&Run%' THEN 'Hit&Run'
          WHEN name LIKE '%Campus%' THEN 'Campus League'
          WHEN name LIKE '%Starting Block%' THEN 'Starting Block'
          WHEN name LIKE '%Freeroll%' THEN 'Freeroll'
          WHEN name = 'CashGame' THEN 'Cash'
          ELSE 'Other'
        END as format,
        COUNT(*) as tournaments_played,
        COALESCE(SUM(buy_in + rake), 0) as buy_ins,
        COALESCE(SUM(hero_winnings), 0) as winnings
      FROM tournaments
      WHERE hero_account = ?
      GROUP BY format
      ORDER BY (winnings - buy_ins) DESC`
    )
    .all(heroAccount) as {
    format: string;
    tournaments_played: number;
    buy_ins: number;
    winnings: number;
  }[];

  return rows.map((r) => ({
    format: r.format,
    tournamentsPlayed: r.tournaments_played,
    totalBuyIns: r.buy_ins,
    totalWinnings: r.winnings,
    net: r.winnings - r.buy_ins,
    roi: r.buy_ins > 0 ? ((r.winnings - r.buy_ins) / r.buy_ins) * 100 : 0
  }));
}

export function getRoiByStake(db: Database, heroAccount: string): RoiByStake[] {
  const rows = db
    .prepare(
      `SELECT
        ROUND(buy_in + rake, 2) as bracket,
        COUNT(*) as tournaments_played,
        COALESCE(SUM(buy_in + rake), 0) as buy_ins,
        COALESCE(SUM(hero_winnings), 0) as winnings
      FROM tournaments
      WHERE hero_account = ? AND (buy_in + rake) > 0
      GROUP BY bracket
      ORDER BY bracket ASC`
    )
    .all(heroAccount) as {
    bracket: number;
    tournaments_played: number;
    buy_ins: number;
    winnings: number;
  }[];

  return rows.map((r) => ({
    buyInRange: `${r.bracket.toFixed(2)}€`,
    minBuyIn: r.bracket,
    maxBuyIn: r.bracket,
    tournamentsPlayed: r.tournaments_played,
    totalBuyIns: r.buy_ins,
    totalWinnings: r.winnings,
    net: r.winnings - r.buy_ins,
    roi: r.buy_ins > 0 ? ((r.winnings - r.buy_ins) / r.buy_ins) * 100 : 0
  }));
}

export function getBankrollChart(db: Database, heroAccount: string): BankrollPoint[] {
  const rows = db
    .prepare(
      `SELECT
        DATE(start_time) as date,
        SUM((COALESCE(hero_winnings, 0)) - (buy_in + rake)) as session_net
      FROM tournaments
      WHERE hero_account = ? AND start_time IS NOT NULL
      GROUP BY date
      ORDER BY date ASC`
    )
    .all(heroAccount) as { date: string; session_net: number }[];

  let cumulative = 0;
  return rows.map((r) => {
    cumulative += r.session_net;
    return { date: r.date, cumulativeNet: cumulative, sessionNet: r.session_net };
  });
}
