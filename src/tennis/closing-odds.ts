/**
 * Closing-odds capture — finds unsettled bets whose match is starting soon (or
 * just started) and snapshots the placeable-book odds at that moment, writing
 * to tennis_bets.closing_odds. Powers CLV calculation post-settle.
 *
 * "Closing odds" = the last public market price right before kickoff. Used to
 * measure CLV (Closing Line Value), the variance-free indicator that your
 * timing/model beat the market regardless of individual bet results.
 *
 * Strategy:
 *  - Window: match scheduled_at in [now - 5min, now + 30min] (covers late
 *    starts) AND result IS NULL AND closing_odds IS NULL.
 *  - For each candidate, fetch the latest event slice from Odds API and pull
 *    the selection's odds at the same book the bet was placed on.
 *  - Idempotent: rows already filled are skipped.
 */

import type { Database } from '../db/database.js';
import { bestPlaceableOddsForEvent, eventToOddsByBook, type OddsApiClient } from './ingest/odds-api.js';
import type { TennisBook } from '../types/tennis.js';

export interface ClosingOddsResult {
  candidates: number;
  captured: number;
  skipped: number;
  errors: Array<{ betId: string; message: string }>;
  logs: string[];
}

interface PendingBet {
  bet_id: string;
  match_id: string;
  selection: string;
  book: string;
  decimal_odds: number;
  scheduled_at: string;
  player1_id: string;
  player2_id: string;
}

export async function captureClosingOdds(
  db: Database,
  client: OddsApiClient,
  options: { windowMinutesBefore?: number; windowMinutesAfter?: number } = {}
): Promise<ClosingOddsResult> {
  const before = options.windowMinutesBefore ?? 5;
  const after = options.windowMinutesAfter ?? 30;
  const now = Date.now();
  const windowStart = new Date(now - before * 60_000).toISOString();
  const windowEnd = new Date(now + after * 60_000).toISOString();

  const candidates = db
    .prepare(
      `SELECT b.bet_id, b.match_id, b.selection, b.book, b.decimal_odds,
              m.scheduled_at, m.player1_id, m.player2_id
       FROM tennis_bets b
       JOIN tennis_matches m ON m.match_id = b.match_id
       WHERE b.result IS NULL
         AND b.closing_odds IS NULL
         AND m.scheduled_at BETWEEN ? AND ?`
    )
    .all(windowStart, windowEnd) as PendingBet[];

  const result: ClosingOddsResult = {
    candidates: candidates.length,
    captured: 0,
    skipped: 0,
    errors: [],
    logs: [`closing-odds: ${candidates.length} candidate bet(s) in window [${windowStart} .. ${windowEnd}]`]
  };

  if (candidates.length === 0) return result;

  const events = await client.fetchAllEvents();

  for (const bet of candidates) {
    const event = events.find((e) => {
      const matched =
        (lower(e.home_team).includes(lower(bet.selection.split('_')[0])) ||
          lower(e.home_team).includes(lower(bet.player1_id.split('_')[0]))) &&
        Math.abs(new Date(e.commence_time).getTime() - new Date(bet.scheduled_at).getTime()) <
          2 * 3600_000;
      return matched;
    });

    if (!event) {
      result.skipped++;
      result.logs.push(`  ${bet.bet_id}: no matching live event in API response`);
      continue;
    }

    try {
      const byBook = eventToOddsByBook(event, bet.selection);
      const bookKey = bet.book as TennisBook;
      const playerOdds = byBook[bookKey];
      const closingOdds = playerOdds ?? bestPlaceableOddsForEvent(event, bet.selection)?.odds;
      if (!closingOdds || closingOdds <= 1) {
        result.skipped++;
        result.logs.push(`  ${bet.bet_id}: no odds for selection at book ${bet.book}`);
        continue;
      }
      db.prepare(`UPDATE tennis_bets SET closing_odds=? WHERE bet_id=?`).run(closingOdds, bet.bet_id);
      result.captured++;
      const clv = ((bet.decimal_odds - closingOdds) / closingOdds) * 100;
      result.logs.push(
        `  ${bet.bet_id}: closing=${closingOdds.toFixed(2)} (placed @${bet.decimal_odds.toFixed(2)}) -> CLV ${clv >= 0 ? '+' : ''}${clv.toFixed(1)}%`
      );
    } catch (err) {
      result.errors.push({ betId: bet.bet_id, message: (err as Error).message });
      result.logs.push(`  ${bet.bet_id}: error ${(err as Error).message}`);
    }
  }

  return result;
}

function lower(s: string): string {
  return s.toLowerCase();
}
