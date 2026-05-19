/**
 * Tennis Claude reviewer — reuses the existing reviewer/claude-reviewer invocation
 * helper so spawn/env hygiene stays in one place. Loads the FR tennis prompts and
 * parses the JSON-strict responses.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { invokeClaude } from '../reviewer/claude-reviewer.js';
import type { ClaudeTennisReview, PickVerdict } from '../types/tennis.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export interface TennisReviewMatchContext {
  match: {
    tournament: string;
    round: string;
    surface: string;
    scheduledAt: string;
    player1: { id: string; name: string; rank?: number; clayElo?: number };
    player2: { id: string; name: string; rank?: number; clayElo?: number };
  };
  selection: string;
  modelProb: number;
  fairDecimalOdds: number;
  bookDecimalOdds: number;
  bestBook: string;
  edgePct: number;
  kellyStakePct: number;
  signalScore: number;
  verdictPreReview: PickVerdict;
  signals: {
    pinnacleNoVigProb: number | null;
    betfairDirectionalVolume: number | null;
    tipstersAligned: number;
    lineMovementPct: number | null;
  };
  context: {
    h2h: string | null;
    last5ClayP1: string[];
    last5ClayP2: string[];
    daysSinceLastMatchP1: number | null;
    daysSinceLastMatchP2: number | null;
  };
}

export interface TennisPostMatchContext {
  pick: {
    selection: string;
    decimalOdds: number;
    bestBook: string;
    edgePct: number;
    kellyStakePct: number;
    verdict: PickVerdict;
    signalScore: number;
  };
  bet: {
    stakeEur: number;
    decimalOdds: number;
    result: 'won' | 'lost' | 'void';
    pnlEur: number;
    closingOdds: number | null;
  };
  matchResult: {
    winnerId: string | null;
    score: string | null;
  };
}

export interface TennisPostMatchReview {
  decisionQuality: 'good' | 'okay' | 'mistake';
  resultSummary: string;
  evAssessment: string;
  whatWorked: string[];
  whatFailed: string[];
  lessons: string[];
  rawResponse: string;
}

export async function reviewTennisMatch(
  ctx: TennisReviewMatchContext,
  options: { timeoutMs?: number; model?: string } = {}
): Promise<ClaudeTennisReview> {
  const systemPrompt = readPrompt('tennis-match-review.md');
  const userPrompt = renderContextForClaude(ctx);
  const raw = await invokeClaude({
    systemPrompt,
    userPrompt,
    timeoutMs: options.timeoutMs,
    model: options.model
  });
  return parseTennisReview(raw);
}

export async function reviewTennisPostMatch(
  ctx: TennisPostMatchContext,
  options: { timeoutMs?: number; model?: string } = {}
): Promise<TennisPostMatchReview> {
  const systemPrompt = readPrompt('tennis-post-match.md');
  const userPrompt = JSON.stringify(ctx, null, 2);
  const raw = await invokeClaude({
    systemPrompt,
    userPrompt,
    timeoutMs: options.timeoutMs,
    model: options.model
  });
  return parsePostMatchReview(raw);
}

function readPrompt(name: string): string {
  const candidates = [
    join(__dirname, '../../prompts', name),
    join(__dirname, '../../../prompts', name),
    join(process.cwd(), 'prompts', name)
  ];
  for (const c of candidates) {
    try {
      return readFileSync(c, 'utf-8');
    } catch {
      // try next
    }
  }
  throw new Error(`Prompt file not found: ${name}`);
}

function renderContextForClaude(ctx: TennisReviewMatchContext): string {
  const payload = {
    match: {
      tournament: ctx.match.tournament,
      round: ctx.match.round,
      surface: ctx.match.surface,
      scheduled_at: ctx.match.scheduledAt,
      player1: ctx.match.player1,
      player2: ctx.match.player2
    },
    selection: ctx.selection,
    model_prob: ctx.modelProb,
    fair_decimal_odds: ctx.fairDecimalOdds,
    book_decimal_odds: ctx.bookDecimalOdds,
    best_book: ctx.bestBook,
    edge_pct: ctx.edgePct,
    kelly_stake_pct: ctx.kellyStakePct,
    signal_score: ctx.signalScore,
    verdict_pre_review: ctx.verdictPreReview,
    signals: {
      pinnacle_novig_prob: ctx.signals.pinnacleNoVigProb,
      betfair_directional_volume: ctx.signals.betfairDirectionalVolume,
      tipsters_aligned: ctx.signals.tipstersAligned,
      line_movement_pct: ctx.signals.lineMovementPct
    },
    context: {
      h2h: ctx.context.h2h,
      last_5_clay_p1: ctx.context.last5ClayP1,
      last_5_clay_p2: ctx.context.last5ClayP2,
      days_since_last_match_p1: ctx.context.daysSinceLastMatchP1,
      days_since_last_match_p2: ctx.context.daysSinceLastMatchP2
    }
  };
  return JSON.stringify(payload, null, 2);
}

function parseTennisReview(raw: string): ClaudeTennisReview {
  const json = extractJson(raw);
  return {
    pickVerdict: (json.pick_verdict as PickVerdict) ?? 'SKIP',
    summary: String(json.summary ?? ''),
    rationale: ensureStringArray(json.rationale),
    cautions: ensureStringArray(json.cautions),
    glossary: Array.isArray(json.glossary)
      ? (json.glossary as Array<{ term: string; def: string }>)
      : undefined,
    rawResponse: raw
  };
}

function parsePostMatchReview(raw: string): TennisPostMatchReview {
  const json = extractJson(raw);
  return {
    decisionQuality: (json.decision_quality as 'good' | 'okay' | 'mistake') ?? 'okay',
    resultSummary: String(json.result_summary ?? ''),
    evAssessment: String(json.ev_assessment ?? ''),
    whatWorked: ensureStringArray(json.what_worked),
    whatFailed: ensureStringArray(json.what_failed),
    lessons: ensureStringArray(json.lessons),
    rawResponse: raw
  };
}

function extractJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fenced = /```json\s*\n([\s\S]*?)\n```/m.exec(trimmed);
    if (fenced) {
      return JSON.parse(fenced[1]) as Record<string, unknown>;
    }
    const open = trimmed.indexOf('{');
    const close = trimmed.lastIndexOf('}');
    if (open >= 0 && close > open) {
      return JSON.parse(trimmed.slice(open, close + 1)) as Record<string, unknown>;
    }
  }
  throw new Error(
    `Claude response did not contain valid JSON. First 500 chars: ${trimmed.slice(0, 500)}`
  );
}

function ensureStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  return [];
}
