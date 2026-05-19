/**
 * Pick generator — end-to-end orchestration:
 *   input match + odds + (optional) signals
 *     → rating model (clay-Elo or rank fallback)
 *     → cross-info scorer + verdict
 *     → fractional Kelly stake
 *     → Claude review (FR, JSON-strict)
 *     → persist `tennis_picks` row
 *
 * Pure-data inputs from the caller. No I/O on data fetch — caller is expected to
 * supply odds + optional signals from the ingest layer (Pinnacle / Betfair / Reddit /
 * line-movement). For manual entry from the UI, signals can be all-null and the model
 * + edge alone drive the verdict.
 */

import { randomBytes } from 'node:crypto';
import type { Database } from '../db/database.js';
import { DEFAULT_KELLY, edgePct, kellyStakeFraction } from './kelly.js';
import { evaluateRiskGate, type RiskGateStatus } from './risk-gate.js';
import { pushTelegramMessage } from './telegram-bot.js';
import {
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  scoreSignals,
  type SignalWeights,
  type VerdictThresholds
} from './cross-info-scorer.js';
import { matchProb } from './model/rating.js';
import {
  insertPick,
  updatePickReview,
  upsertMatch,
  upsertPlayer,
  insertOddsSnapshots
} from '../db/repositories/tennis-repository.js';
import {
  reviewTennisMatch,
  type TennisReviewMatchContext
} from './claude-tennis-reviewer.js';
import {
  PLACEABLE_BOOKS,
  type CrossInfoInput,
  type OddsSnapshot,
  type PickVerdict,
  type TennisBook,
  type TennisMatch,
  type TennisPick,
  type TennisSurface
} from '../types/tennis.js';

export interface GeneratePickInput {
  match: {
    tournament: string;
    surface: TennisSurface;
    round: string;
    scheduledAt: string;
    player1: { id: string; name: string; country?: string; rank?: number };
    player2: { id: string; name: string; country?: string; rank?: number };
  };
  selection: string; // must be player1.id or player2.id
  /** Odds offered across books for the selected player. */
  oddsByBook: Partial<Record<TennisBook, number>>;
  /** Optional cross-info signals. Null means the signal isn't available yet. */
  signals?: {
    pinnacleProb?: number | null;
    betfairVolume?: number | null;
    tipsterAlignedCount?: number;
    lineMovementPct?: number | null;
  };
  /** H2H / form context for Claude prompt — can be omitted, prompt handles missing. */
  context?: {
    h2h?: string | null;
    last5ClayP1?: string[];
    last5ClayP2?: string[];
    daysSinceLastMatchP1?: number | null;
    daysSinceLastMatchP2?: number | null;
  };
  /** Override default weights/thresholds for backtesting. */
  weights?: SignalWeights;
  thresholds?: VerdictThresholds;
  /** Skip Claude review (faster for backtesting). */
  skipClaudeReview?: boolean;
}

export interface GeneratePickResult {
  pick: TennisPick;
  /** False if the verdict is SKIP — pick row is still saved for audit trail. */
  worthPlacing: boolean;
  /**
   * 'clay-elo' | 'rank-fallback' | 'priors-only' | 'pinnacle-fallback'.
   * `pinnacle-fallback` = rating model had no data, model_prob = Pinnacle no-vig.
   */
  modelSource: string;
  /** Risk gate state at the moment the pick was generated. */
  riskGate: RiskGateStatus;
  /** Whether the pick was suppressed by the risk gate (still persisted for audit). */
  blockedByRiskGate: boolean;
}

export async function generatePick(
  db: Database,
  input: GeneratePickInput
): Promise<GeneratePickResult> {
  // 0. Validate before any DB write — fail fast if we can't actually generate a
  //    placeable pick (no Winamax/Betclic/Unibet odds supplied).
  const placeableEntries = (Object.entries(input.oddsByBook) as Array<[TennisBook, number]>)
    .filter(
      ([book, odds]) =>
        PLACEABLE_BOOKS.includes(book) && Number.isFinite(odds) && odds > 1
    );
  if (placeableEntries.length === 0) {
    throw new Error(
      `No placeable-book odds provided (one of: ${PLACEABLE_BOOKS.join('/')} required).`
    );
  }

  // 1. Persist players first (FK target), then the match (FK source). All
  //    inserts are idempotent upserts.
  const matchId = composeMatchId(input.match);
  const nowIso = new Date().toISOString();
  upsertPlayer(db, {
    playerId: input.match.player1.id,
    name: input.match.player1.name,
    country: input.match.player1.country ?? null,
    hand: null,
    heightCm: null,
    birthDate: null,
    updatedAt: nowIso
  });
  upsertPlayer(db, {
    playerId: input.match.player2.id,
    name: input.match.player2.name,
    country: input.match.player2.country ?? null,
    hand: null,
    heightCm: null,
    birthDate: null,
    updatedAt: nowIso
  });
  const matchRow: TennisMatch = {
    matchId,
    tournament: input.match.tournament,
    surface: input.match.surface,
    round: input.match.round,
    player1Id: input.match.player1.id,
    player2Id: input.match.player2.id,
    scheduledAt: input.match.scheduledAt,
    status: 'scheduled',
    winnerId: null,
    score: null
  };
  upsertMatch(db, matchRow);

  // 2. Snapshot the odds we were given.
  const snapshots: OddsSnapshot[] = (
    Object.entries(input.oddsByBook) as Array<[TennisBook, number]>
  )
    .filter(([, odds]) => Number.isFinite(odds) && odds > 1)
    .map(([book, odds]) => ({
      matchId,
      book,
      market: 'match_winner',
      selection: input.selection,
      decimalOdds: odds,
      capturedAt: nowIso
    }));
  if (snapshots.length > 0) insertOddsSnapshots(db, snapshots);

  // 3. Find best placeable book + its odds (we already validated non-empty in step 0).
  const placeable = [...placeableEntries];
  placeable.sort(([, a], [, b]) => b - a); // descending: best (highest) odds first
  const [bestBook, bookDecimalOdds] = placeable[0];

  // 4. Model probability.
  //    Priority: clay-Elo > rank-based > Pinnacle no-vig fallback.
  //    When the rating model has no signal (`priors-only` = 50/50), we use the
  //    Pinnacle no-vig prob as the model prior — that turns the system into a
  //    sharp-book disagreement detector (find books pricing softer than
  //    Pinnacle, which is the proven +EV strategy when you have no other data).
  const isP1Selected = input.selection === input.match.player1.id;
  const probResult = matchProb({
    player1Id: input.match.player1.id,
    player2Id: input.match.player2.id,
    rank1: input.match.player1.rank ?? null,
    rank2: input.match.player2.rank ?? null
  });
  let modelProb = isP1Selected ? probResult.p1Win : probResult.p2Win;
  let modelSourceLabel: string = probResult.source;
  const pinnacleProb = input.signals?.pinnacleProb ?? null;
  if (probResult.source === 'priors-only' && pinnacleProb !== null) {
    modelProb = pinnacleProb;
    modelSourceLabel = 'pinnacle-fallback';
  }
  const fairDecimalOdds = modelProb > 0 ? 1 / modelProb : Number.POSITIVE_INFINITY;
  const edge = edgePct(modelProb, bookDecimalOdds);

  // 5. Cross-info scoring.
  const scoreInput: CrossInfoInput = {
    modelProb,
    pinnacleProb: input.signals?.pinnacleProb ?? null,
    betfairVolume: input.signals?.betfairVolume ?? null,
    tipsterAlignedCount: input.signals?.tipsterAlignedCount ?? 0,
    lineMovementPct: input.signals?.lineMovementPct ?? null
  };
  const scoreResult = scoreSignals(scoreInput, {
    decimalOdds: bookDecimalOdds,
    weights: input.weights ?? DEFAULT_WEIGHTS,
    thresholds: input.thresholds ?? DEFAULT_THRESHOLDS
  });

  // 6. Fractional Kelly stake. Risk gate may scale this down (take-profit mode)
  //    or zero it out (manual pause / stop-loss / drawdown circuit breaker).
  const riskGate = evaluateRiskGate(db);
  const rawKellyStakePct = kellyStakeFraction(modelProb, bookDecimalOdds, DEFAULT_KELLY);
  const kellyStakePct = riskGate.blocked
    ? 0
    : rawKellyStakePct * riskGate.stakeMultiplier;
  const blockedByRiskGate = riskGate.blocked;

  // 7. Persist pick (without review first — review writes later or skipped).
  const pick: TennisPick = {
    pickId: composePickId(),
    matchId,
    selection: input.selection,
    modelProb,
    fairDecimalOdds,
    bookDecimalOdds,
    bestBook,
    edgePct: edge,
    kellyStakePct,
    signalScore: scoreResult.score,
    verdict: scoreResult.verdict,
    claudeReviewJson: null,
    generatedAt: nowIso
  };
  insertPick(db, pick);

  // 8. Claude review (best-effort: failures don't break the pick).
  if (!input.skipClaudeReview && scoreResult.verdict !== 'SKIP') {
    try {
      const ctx: TennisReviewMatchContext = {
        match: {
          tournament: input.match.tournament,
          round: input.match.round,
          surface: input.match.surface,
          scheduledAt: input.match.scheduledAt,
          player1: {
            id: input.match.player1.id,
            name: input.match.player1.name,
            rank: input.match.player1.rank
          },
          player2: {
            id: input.match.player2.id,
            name: input.match.player2.name,
            rank: input.match.player2.rank
          }
        },
        selection: input.selection,
        modelProb,
        fairDecimalOdds,
        bookDecimalOdds,
        bestBook,
        edgePct: edge,
        kellyStakePct,
        signalScore: scoreResult.score,
        verdictPreReview: scoreResult.verdict,
        signals: {
          pinnacleNoVigProb: scoreInput.pinnacleProb,
          betfairDirectionalVolume: scoreInput.betfairVolume,
          tipstersAligned: scoreInput.tipsterAlignedCount,
          lineMovementPct: scoreInput.lineMovementPct
        },
        context: {
          h2h: input.context?.h2h ?? null,
          last5ClayP1: input.context?.last5ClayP1 ?? [],
          last5ClayP2: input.context?.last5ClayP2 ?? [],
          daysSinceLastMatchP1: input.context?.daysSinceLastMatchP1 ?? null,
          daysSinceLastMatchP2: input.context?.daysSinceLastMatchP2 ?? null
        }
      };
      const review = await reviewTennisMatch(ctx);
      const reviewJson = JSON.stringify(review);
      updatePickReview(db, pick.pickId, reviewJson);
      pick.claudeReviewJson = reviewJson;
    } catch (err) {
      console.error('[pick-generator] Claude review failed:', (err as Error).message);
      // Continue — pick exists without review, UI shows "review unavailable" tag.
    }
  }

  // 9. Push Telegram notification on STRONG picks (no-op if bot not configured).
  if (scoreResult.verdict === 'STRONG' && !blockedByRiskGate) {
    const reviewSummary = pick.claudeReviewJson
      ? extractClaudeSummary(pick.claudeReviewJson)
      : null;
    const message = [
      `STRONG pick disponible`,
      `${input.match.player1.name} vs ${input.match.player2.name} (${input.match.round})`,
      `Sélection: ${input.selection} @${bookDecimalOdds.toFixed(2)} (${bestBook})`,
      `Edge ${(edge * 100).toFixed(1)}% | Score ${scoreResult.score}/100 | Kelly ${(kellyStakePct * 100).toFixed(2)}%`,
      reviewSummary ? `\n${reviewSummary}` : '',
      `\n/placed ${pick.pickId} <stake_eur>`
    ]
      .filter(Boolean)
      .join('\n');
    pushTelegramMessage(message).catch((err) => {
      console.error('[pick-generator] telegram push failed:', (err as Error).message);
    });
  }

  return {
    pick,
    worthPlacing: scoreResult.verdict !== 'SKIP' && !blockedByRiskGate,
    modelSource: modelSourceLabel,
    riskGate,
    blockedByRiskGate
  };
}

function extractClaudeSummary(json: string): string | null {
  try {
    const parsed = JSON.parse(json) as { summary?: string };
    return parsed.summary ?? null;
  } catch {
    return null;
  }
}

/**
 * Verdict from inputs only (no DB writes). Useful for live UI preview as the user
 * types in odds before saving the pick.
 */
export function previewVerdict(input: {
  modelProb: number;
  bookDecimalOdds: number;
  signals?: {
    pinnacleProb?: number | null;
    betfairVolume?: number | null;
    tipsterAlignedCount?: number;
    lineMovementPct?: number | null;
  };
}): {
  score: number;
  verdict: PickVerdict;
  edge: number;
  kellyStakePct: number;
  fairDecimalOdds: number;
} {
  const scoreInput: CrossInfoInput = {
    modelProb: input.modelProb,
    pinnacleProb: input.signals?.pinnacleProb ?? null,
    betfairVolume: input.signals?.betfairVolume ?? null,
    tipsterAlignedCount: input.signals?.tipsterAlignedCount ?? 0,
    lineMovementPct: input.signals?.lineMovementPct ?? null
  };
  const score = scoreSignals(scoreInput, { decimalOdds: input.bookDecimalOdds });
  return {
    score: score.score,
    verdict: score.verdict,
    edge: edgePct(input.modelProb, input.bookDecimalOdds),
    kellyStakePct: kellyStakeFraction(input.modelProb, input.bookDecimalOdds),
    fairDecimalOdds: input.modelProb > 0 ? 1 / input.modelProb : Number.POSITIVE_INFINITY
  };
}

function composeMatchId(m: GeneratePickInput['match']): string {
  const dateStr = m.scheduledAt.slice(0, 10).replace(/-/g, '');
  return `${m.tournament}_${dateStr}_${m.round}_${m.player1.id}_${m.player2.id}`.toLowerCase();
}

function composePickId(): string {
  return `pick_${Date.now()}_${randomBytes(4).toString('hex')}`;
}
