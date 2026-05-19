/**
 * tennis-settle — settle a tennis bet and fire post-match Claude review.
 *
 * Usage:
 *   bun run tennis-settle <bet_id> <won|lost|void> [closing_odds]
 *
 * Replicates what `tennis:bets:settle` IPC handler does (without Electron).
 * Writes result + pnl + closing_odds, then invokes reviewTennisPostMatch and
 * persists JSON to tennis_bets.post_match_review_json.
 */

import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defaultDbPath, openDatabase } from '../db/index.js';
import { getBet, getPick, setPostMatchReview, settleBet } from '../db/repositories/tennis-repository.js';
import { reviewTennisPostMatch } from '../tennis/claude-tennis-reviewer.js';
import type { BetResult } from '../types/tennis.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
for (const file of ['.env.local', '.env']) {
  loadDotenv({ path: resolve(PROJECT_ROOT, file), override: false });
}

const [, , betId, result, closingOddsArg] = process.argv;
if (!betId || !['won', 'lost', 'void'].includes(result)) {
  console.error('Usage: bun run tennis-settle <bet_id> <won|lost|void> [closing_odds]');
  process.exit(2);
}
const closingOdds = closingOddsArg ? parseFloat(closingOddsArg) : null;

const db = openDatabase({ dbPath: defaultDbPath() });
const bet = getBet(db, betId);
if (!bet) {
  console.error(`Bet ${betId} not found`);
  process.exit(3);
}

const pnl =
  result === 'won' ? bet.stakeEur * (bet.decimalOdds - 1) : result === 'lost' ? -bet.stakeEur : 0;

console.log(`▶ Settling ${betId}`);
console.log(`  ${bet.selection} @${bet.decimalOdds} stake €${bet.stakeEur}`);
console.log(`  result=${result} pnl=${pnl.toFixed(2)}€ closing=${closingOdds ?? 'n/a'}`);

settleBet(db, betId, result as BetResult, pnl, closingOdds);
console.log(`✓ DB updated`);

const match = db
  .prepare(
    `SELECT m.tournament, m.round, m.surface, m.scheduled_at,
            m.player1_id, m.player2_id, m.winner_id, m.score
     FROM tennis_matches m WHERE m.match_id = ?`
  )
  .get(bet.matchId) as
  | {
      tournament: string;
      round: string;
      surface: string;
      scheduled_at: string;
      player1_id: string;
      player2_id: string;
      winner_id: string | null;
      score: string | null;
    }
  | undefined;

if (!match) {
  console.error('Match not found — skipping review');
  process.exit(0);
}

const pick = bet.pickId ? getPick(db, bet.pickId) : null;

console.log(`▶ Invoking Claude post-match review…`);
try {
  const review = await reviewTennisPostMatch({
    pick: {
      selection: pick?.selection ?? bet.selection,
      decimalOdds: pick?.bookDecimalOdds ?? bet.decimalOdds,
      bestBook: pick?.bestBook ?? bet.book,
      edgePct: pick?.edgePct ?? 0,
      kellyStakePct: pick?.kellyStakePct ?? 0,
      verdict: pick?.verdict ?? 'PLAY',
      signalScore: pick?.signalScore ?? 0
    },
    bet: {
      stakeEur: bet.stakeEur,
      decimalOdds: bet.decimalOdds,
      result: result as 'won' | 'lost' | 'void',
      pnlEur: pnl,
      closingOdds
    },
    matchResult: {
      winnerId: match.winner_id,
      score: match.score
    }
  });
  setPostMatchReview(db, betId, JSON.stringify(review));
  console.log(`✓ Review saved`);
  console.log('');
  console.log(`Decision quality: ${review.decisionQuality}`);
  console.log(`Summary: ${review.resultSummary}`);
  console.log(`EV: ${review.evAssessment}`);
  if (review.whatWorked.length) {
    console.log(`✓ What worked:`);
    for (const x of review.whatWorked) console.log(`  - ${x}`);
  }
  if (review.whatFailed.length) {
    console.log(`✗ What failed:`);
    for (const x of review.whatFailed) console.log(`  - ${x}`);
  }
  if (review.lessons.length) {
    console.log(`💡 Lessons:`);
    for (const x of review.lessons) console.log(`  - ${x}`);
  }
} catch (err) {
  console.error(`⚠ Review failed: ${(err as Error).message}`);
  process.exit(4);
}

process.exit(0);
