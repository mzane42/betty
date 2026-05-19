/**
 * Cross-Info Scorer — composes weighted signals into a 0-100 score + verdict.
 *
 * Inputs are normalized signals (each 0..1). Weights are constants for MVP.
 * Tipster consensus only contributes when ≥3 sources align; otherwise the
 * weight is redistributed proportionally across the other active signals.
 *
 * Output verdict gates on both `score` and `edge_pct`:
 *   STRONG: score ≥ 75 AND edge ≥ 0.03
 *   PLAY:   score ≥ 60 AND edge ≥ 0.03
 *   SKIP:   otherwise
 */

import type { CrossInfoInput, CrossInfoResult, PickVerdict, SignalSource } from '../types/tennis.js';
import { edgePct } from './kelly.js';

export interface SignalWeights {
  model: number;
  pinnacle_novig: number;
  betfair_volume: number;
  tipster_consensus: number;
  line_movement: number;
}

export interface VerdictThresholds {
  strong: { score: number; edge: number };
  play: { score: number; edge: number };
}

export const DEFAULT_WEIGHTS: SignalWeights = {
  model: 0.4,
  pinnacle_novig: 0.25,
  betfair_volume: 0.15,
  tipster_consensus: 0.1,
  line_movement: 0.1
};

export const DEFAULT_THRESHOLDS: VerdictThresholds = {
  strong: { score: 75, edge: 0.03 },
  play: { score: 60, edge: 0.03 }
};

export interface ScoreOptions {
  /** Decimal odds of the picked selection in the best placeable book. */
  decimalOdds: number;
  weights?: SignalWeights;
  thresholds?: VerdictThresholds;
}

export function scoreSignals(input: CrossInfoInput, opts: ScoreOptions): CrossInfoResult {
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;

  // 1. Normalize each signal to [0, 1]. Missing signals contribute nothing
  //    AND have their weight redistributed across remaining active signals.
  const components: Partial<Record<SignalSource, number>> = {};
  const activeWeights: Partial<Record<SignalSource, number>> = {};

  // Model: maps the model probability directly. Edge over implied book prob
  // would be redundant (also captured by pinnacle_novig). Use model prob as
  // a confidence proxy: ≥0.6 → 1.0, ≤0.5 → 0.0, linear in between.
  components.model = clamp01((input.modelProb - 0.5) / 0.1);
  activeWeights.model = weights.model;

  // Pinnacle no-vig: aligned if pinnacle prob > implied book prob of our pick.
  // Strength = (pinnacle - implied) normalized by 0.05 (5pp diff = 1.0).
  if (input.pinnacleProb !== null) {
    const impliedBook = 1 / opts.decimalOdds;
    const diff = input.pinnacleProb - impliedBook;
    components.pinnacle_novig = clamp01(diff / 0.05);
    activeWeights.pinnacle_novig = weights.pinnacle_novig;
  }

  // Betfair Exchange directional volume: positive = backing our selection.
  // Normalize by 1.0 (heavy directional volume = 1.0).
  if (input.betfairVolume !== null) {
    components.betfair_volume = clamp01(input.betfairVolume);
    activeWeights.betfair_volume = weights.betfair_volume;
  }

  // Tipster consensus: only fires with ≥3 aligned sources (single-tipster noise muted).
  if (input.tipsterAlignedCount >= 3) {
    components.tipster_consensus = clamp01((input.tipsterAlignedCount - 2) / 4);
    activeWeights.tipster_consensus = weights.tipster_consensus;
  }

  // Line movement: positive = book shortened on our pick = sharps confirm.
  // Normalize by 0.1 (10% line move = 1.0).
  if (input.lineMovementPct !== null) {
    components.line_movement = clamp01(input.lineMovementPct / 0.1);
    activeWeights.line_movement = weights.line_movement;
  }

  // 2. Redistribute missing weight proportionally across active signals.
  const totalActiveWeight = Object.values(activeWeights).reduce((a, b) => a + b, 0);
  const weightContributions: Record<SignalSource, number> = {
    model: 0,
    pinnacle_novig: 0,
    betfair_volume: 0,
    tipster_consensus: 0,
    line_movement: 0
  };

  if (totalActiveWeight <= 0) {
    return {
      score: 0,
      verdict: 'SKIP',
      weightContributions,
      rationale: ['No active signals.']
    };
  }

  let weightedSum = 0;
  for (const [src, w] of Object.entries(activeWeights) as Array<[SignalSource, number]>) {
    const normalizedWeight = w / totalActiveWeight; // sums to 1
    const contribution = (components[src] ?? 0) * normalizedWeight;
    weightContributions[src] = contribution;
    weightedSum += contribution;
  }

  const score = Math.round(weightedSum * 100);

  // 3. Compute edge from the model vs book odds.
  const edge = edgePct(input.modelProb, opts.decimalOdds);
  const verdict = pickVerdict(score, edge, thresholds);

  const rationale = buildRationale(components, input, edge, score);

  return { score, verdict, weightContributions, rationale };
}

function pickVerdict(score: number, edge: number, t: VerdictThresholds): PickVerdict {
  if (score >= t.strong.score && edge >= t.strong.edge) return 'STRONG';
  if (score >= t.play.score && edge >= t.play.edge) return 'PLAY';
  return 'SKIP';
}

function buildRationale(
  components: Partial<Record<SignalSource, number>>,
  input: CrossInfoInput,
  edge: number,
  score: number
): string[] {
  const lines: string[] = [];
  lines.push(`Score: ${score}/100, edge: ${(edge * 100).toFixed(1)}%`);
  if (components.model !== undefined) {
    lines.push(`Model prob: ${(input.modelProb * 100).toFixed(1)}%`);
  }
  if (components.pinnacle_novig !== undefined && input.pinnacleProb !== null) {
    lines.push(`Pinnacle no-vig: ${(input.pinnacleProb * 100).toFixed(1)}%`);
  }
  if (components.betfair_volume !== undefined) {
    lines.push(`Betfair directional volume: ${input.betfairVolume!.toFixed(2)}`);
  }
  if (components.tipster_consensus !== undefined) {
    lines.push(`Tipsters aligned: ${input.tipsterAlignedCount}`);
  }
  if (components.line_movement !== undefined && input.lineMovementPct !== null) {
    lines.push(`Line movement: ${(input.lineMovementPct * 100).toFixed(1)}%`);
  }
  return lines;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
