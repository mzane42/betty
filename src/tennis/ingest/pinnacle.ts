/**
 * Pinnacle no-vig computation.
 *
 * Pinnacle posts the sharpest 2-way prices in tennis. The "no-vig fair odds" is
 * the implied probability with the bookmaker's margin (vig) removed:
 *
 *     implied_a = 1 / odds_a
 *     implied_b = 1 / odds_b
 *     vig       = implied_a + implied_b - 1
 *     fair_a    = implied_a / (1 + vig)   // sums to 1.0
 *     fair_b    = implied_b / (1 + vig)
 *
 * Caller supplies Pinnacle odds for both selections in a match. We don't fetch
 * Pinnacle directly — the scraper (oddsportal or commercial API) provides them.
 */

export interface NoVigInput {
  oddsA: number;
  oddsB: number;
}

export interface NoVigOutput {
  fairProbA: number;
  fairProbB: number;
  vigPct: number;
}

export function computeNoVig(input: NoVigInput): NoVigOutput {
  if (input.oddsA <= 1 || input.oddsB <= 1) {
    throw new Error(`Invalid Pinnacle odds: ${input.oddsA}, ${input.oddsB}`);
  }
  const impliedA = 1 / input.oddsA;
  const impliedB = 1 / input.oddsB;
  const total = impliedA + impliedB;
  const vig = total - 1;
  return {
    fairProbA: impliedA / total,
    fairProbB: impliedB / total,
    vigPct: vig
  };
}

/**
 * Estimate Pinnacle no-vig prob for our `selection` given the raw odds map.
 * Returns null if Pinnacle data missing.
 */
export function pinnacleProbForSelection(
  selection: 'A' | 'B',
  pinnacleOddsA: number | null,
  pinnacleOddsB: number | null
): number | null {
  if (pinnacleOddsA == null || pinnacleOddsB == null) return null;
  if (pinnacleOddsA <= 1 || pinnacleOddsB <= 1) return null;
  const nv = computeNoVig({ oddsA: pinnacleOddsA, oddsB: pinnacleOddsB });
  return selection === 'A' ? nv.fairProbA : nv.fairProbB;
}
