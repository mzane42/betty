import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KELLY,
  edgePct,
  kellyStakeFraction,
  kellyStakeEur
} from '../../src/tennis/kelly.js';

describe('kellyStakeFraction', () => {
  it('returns 0 when edge is negative (model prob lower than implied)', () => {
    // book offers 1.50 → implied 66.7%. Model says 50% → edge negative.
    expect(kellyStakeFraction(0.5, 1.5)).toBe(0);
  });

  it('returns 0 when modelProb is at or below 0', () => {
    expect(kellyStakeFraction(0, 2.0)).toBe(0);
    expect(kellyStakeFraction(-0.1, 2.0)).toBe(0);
  });

  it('returns 0 when modelProb is at or above 1', () => {
    expect(kellyStakeFraction(1, 2.0)).toBe(0);
    expect(kellyStakeFraction(1.1, 2.0)).toBe(0);
  });

  it('returns 0 for invalid odds', () => {
    expect(kellyStakeFraction(0.6, 1)).toBe(0);
    expect(kellyStakeFraction(0.6, 0.5)).toBe(0);
    expect(kellyStakeFraction(0.6, Number.NaN)).toBe(0);
  });

  it('caps at config.cap when fractional Kelly is huge', () => {
    // model 80%, odds 2.5 → strong edge. Should hit cap.
    const f = kellyStakeFraction(0.8, 2.5);
    expect(f).toBe(DEFAULT_KELLY.cap);
  });

  it('floors to config.floor for tiny positive edge', () => {
    // model 51%, odds 2.0 → implied 50%, tiny edge.
    // Full Kelly ≈ 0.02. Quarter Kelly ≈ 0.005. Floor = 0.005.
    const f = kellyStakeFraction(0.505, 2.0);
    expect(f).toBe(DEFAULT_KELLY.floor);
  });

  it('lands between floor and cap for moderate edge', () => {
    // model 60%, odds 2.0 → implied 50%, 20% edge over implied.
    // Full Kelly: (0.6 * 2 - 1) / 1 = 0.2. Quarter Kelly = 0.05 → capped at 0.02.
    const f = kellyStakeFraction(0.55, 2.0);
    expect(f).toBeGreaterThanOrEqual(DEFAULT_KELLY.floor);
    expect(f).toBeLessThanOrEqual(DEFAULT_KELLY.cap);
  });

  it('honors custom config', () => {
    const half = kellyStakeFraction(0.55, 2.0, { fraction: 0.5, cap: 0.05, floor: 0.01 });
    expect(half).toBeGreaterThan(0.01);
    expect(half).toBeLessThanOrEqual(0.05);
  });
});

describe('kellyStakeEur', () => {
  it('returns euros = bankroll * fraction, rounded to 2dp', () => {
    // 1000 EUR bankroll, model 60% on 2.0 odds → quarter Kelly clamped to cap 2% = 20 EUR.
    expect(kellyStakeEur(1000, 0.6, 2.0)).toBe(20);
  });

  it('returns 0 for no-edge bets', () => {
    expect(kellyStakeEur(1000, 0.5, 2.0)).toBe(0);
  });
});

describe('edgePct', () => {
  it('returns 0 for non-favorable odds', () => {
    expect(edgePct(0.5, 1.0)).toBe(0);
  });

  it('returns positive % when model prob exceeds implied book prob', () => {
    // book 2.0 → implied 50%. Model 60%.
    // edge = (0.6 - 0.5) / 0.5 = 0.2.
    expect(edgePct(0.6, 2.0)).toBeCloseTo(0.2, 5);
  });

  it('returns negative when model is less confident than book', () => {
    expect(edgePct(0.4, 2.0)).toBeCloseTo(-0.2, 5);
  });
});
