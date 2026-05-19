import { describe, expect, it } from 'vitest';
import { scoreSignals } from '../../src/tennis/cross-info-scorer.js';
import type { CrossInfoInput } from '../../src/types/tennis.js';

const base: CrossInfoInput = {
  modelProb: 0.55,
  pinnacleProb: null,
  betfairVolume: null,
  tipsterAlignedCount: 0,
  lineMovementPct: null
};

describe('scoreSignals', () => {
  it('returns SKIP when only model is present and edge below threshold', () => {
    // Book 1.95 → implied 51.3%. Model 55% → edge ≈ 7%, above threshold.
    // Score from model alone (55% → 0.5 component, but full weight 1.0
    // after redistribution) ≈ 50 → below PLAY threshold (60).
    const res = scoreSignals(base, { decimalOdds: 1.95 });
    expect(res.verdict).toBe('SKIP');
    expect(res.score).toBeLessThan(60);
  });

  it('returns PLAY when score crosses 60 and edge ≥ 3%', () => {
    // Model 60% + Pinnacle 58% on 2.0 odds (implied 50%).
    const input: CrossInfoInput = {
      modelProb: 0.6,
      pinnacleProb: 0.58,
      betfairVolume: null,
      tipsterAlignedCount: 0,
      lineMovementPct: null
    };
    const res = scoreSignals(input, { decimalOdds: 2.0 });
    expect(res.verdict).not.toBe('SKIP');
    expect(res.score).toBeGreaterThanOrEqual(60);
  });

  it('returns STRONG when all signals align strongly', () => {
    const input: CrossInfoInput = {
      modelProb: 0.65,
      pinnacleProb: 0.62,
      betfairVolume: 0.8,
      tipsterAlignedCount: 4,
      lineMovementPct: 0.08
    };
    const res = scoreSignals(input, { decimalOdds: 2.0 });
    expect(res.verdict).toBe('STRONG');
    expect(res.score).toBeGreaterThanOrEqual(75);
  });

  it('ignores single-tipster noise (count<3)', () => {
    const withOne: CrossInfoInput = { ...base, tipsterAlignedCount: 1 };
    const baseRes = scoreSignals(base, { decimalOdds: 2.0 });
    const withOneRes = scoreSignals(withOne, { decimalOdds: 2.0 });
    expect(withOneRes.score).toBe(baseRes.score);
    expect(withOneRes.weightContributions.tipster_consensus).toBe(0);
  });

  it('counts tipster consensus only at threshold of 3', () => {
    const withThree: CrossInfoInput = { ...base, tipsterAlignedCount: 3 };
    const res = scoreSignals(withThree, { decimalOdds: 2.0 });
    expect(res.weightContributions.tipster_consensus).toBeGreaterThan(0);
  });

  it('redistributes missing signal weights across active ones', () => {
    // Only model present → its normalized weight should be 1.0 (40/40).
    // Total contribution = component value (0.5) * 1.0 = 0.5 → score 50.
    const res = scoreSignals(base, { decimalOdds: 2.0 });
    expect(res.score).toBe(50);
    expect(res.weightContributions.model).toBeCloseTo(0.5, 5);
    expect(res.weightContributions.pinnacle_novig).toBe(0);
  });

  it('penalizes negative pinnacle disagreement', () => {
    // Pinnacle thinks pick is WORSE than the book implies → component = 0.
    const input: CrossInfoInput = {
      modelProb: 0.55,
      pinnacleProb: 0.4,
      betfairVolume: null,
      tipsterAlignedCount: 0,
      lineMovementPct: null
    };
    const res = scoreSignals(input, { decimalOdds: 2.0 });
    expect(res.weightContributions.pinnacle_novig).toBe(0);
  });

  it('returns SKIP when edge below threshold even with high score', () => {
    // High score but tiny edge — should still SKIP because edge gate is 3%.
    const input: CrossInfoInput = {
      modelProb: 0.5051, // ~tiny edge over book at 2.0 → ~0.1%
      pinnacleProb: 0.5051,
      betfairVolume: 0.9,
      tipsterAlignedCount: 5,
      lineMovementPct: 0.09
    };
    const res = scoreSignals(input, { decimalOdds: 2.0 });
    expect(res.verdict).toBe('SKIP');
  });

  it('returns SKIP with no active signals at all', () => {
    const res = scoreSignals(
      { ...base, modelProb: 0.5 },
      { decimalOdds: 2.0 }
    );
    expect(res.score).toBe(0);
    expect(res.verdict).toBe('SKIP');
  });

  it('hard-floor: score=0 forces SKIP even if thresholds allow it', () => {
    const res = scoreSignals(
      { ...base, modelProb: 0.5 },
      { decimalOdds: 5.0, thresholds: { strong: { score: 0, edge: 0 }, play: { score: 0, edge: 0 } } }
    );
    expect(res.verdict).toBe('SKIP');
  });

  it('hard-floor: non-positive edge forces SKIP even with high score', () => {
    const input: CrossInfoInput = {
      modelProb: 0.5,
      pinnacleProb: 0.5,
      betfairVolume: 1,
      tipsterAlignedCount: 5,
      lineMovementPct: 0.1
    };
    const res = scoreSignals(input, { decimalOdds: 2.0 }); // edge=0 exactly
    expect(res.verdict).toBe('SKIP');
  });

  it('rationale lines describe active signals', () => {
    const input: CrossInfoInput = {
      modelProb: 0.6,
      pinnacleProb: 0.58,
      betfairVolume: 0.5,
      tipsterAlignedCount: 4,
      lineMovementPct: 0.05
    };
    const res = scoreSignals(input, { decimalOdds: 2.0 });
    expect(res.rationale.some((l) => l.startsWith('Score:'))).toBe(true);
    expect(res.rationale.some((l) => l.startsWith('Model prob'))).toBe(true);
    expect(res.rationale.some((l) => l.startsWith('Tipsters aligned'))).toBe(true);
  });
});
