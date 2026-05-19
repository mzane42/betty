import { describe, expect, it } from 'vitest';
import { computeNoVig, pinnacleProbForSelection } from '../../src/tennis/ingest/pinnacle.js';

describe('computeNoVig', () => {
  it('removes vig proportionally so probabilities sum to 1', () => {
    // Pinnacle 1.40 / 3.00 → implied 71.43% + 33.33% = 104.76% (vig ≈ 4.76%)
    const result = computeNoVig({ oddsA: 1.4, oddsB: 3.0 });
    expect(result.fairProbA + result.fairProbB).toBeCloseTo(1, 5);
    expect(result.vigPct).toBeGreaterThan(0);
    expect(result.fairProbA).toBeCloseTo(0.7143 / 1.0476, 3);
  });

  it('handles a coin-flip with zero vig', () => {
    const result = computeNoVig({ oddsA: 2.0, oddsB: 2.0 });
    expect(result.fairProbA).toBeCloseTo(0.5, 5);
    expect(result.fairProbB).toBeCloseTo(0.5, 5);
    expect(result.vigPct).toBeCloseTo(0, 5);
  });

  it('throws on invalid odds', () => {
    expect(() => computeNoVig({ oddsA: 1, oddsB: 2 })).toThrow();
    expect(() => computeNoVig({ oddsA: 0.5, oddsB: 2 })).toThrow();
  });
});

describe('pinnacleProbForSelection', () => {
  it('returns null when either side missing', () => {
    expect(pinnacleProbForSelection('A', null, 2.0)).toBeNull();
    expect(pinnacleProbForSelection('A', 2.0, null)).toBeNull();
    expect(pinnacleProbForSelection('A', null, null)).toBeNull();
  });

  it('returns null when odds are at or below 1', () => {
    expect(pinnacleProbForSelection('A', 1.0, 2.0)).toBeNull();
    expect(pinnacleProbForSelection('B', 2.0, 0.5)).toBeNull();
  });

  it('returns the correct side after no-vig adjustment', () => {
    const probA = pinnacleProbForSelection('A', 1.4, 3.0);
    const probB = pinnacleProbForSelection('B', 1.4, 3.0);
    expect(probA).not.toBeNull();
    expect(probB).not.toBeNull();
    expect((probA ?? 0) + (probB ?? 0)).toBeCloseTo(1, 5);
    expect(probA).toBeGreaterThan(probB ?? 0);
  });
});
