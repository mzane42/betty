/**
 * Fractional Kelly stake sizing — bounded variant.
 *
 * Base Kelly:    f* = (p * (b + 1) - 1) / b   where b = odds - 1
 * Fractional:    f  = KELLY_FRACTION * f*
 * Bounded:       max(min(f, CAP), 0) — clamps to [0, CAP]; sub-FLOOR rounds up to FLOOR
 *                                       only when positive Kelly exists.
 *
 * Returns `0` when edge ≤ 0 (model says no bet).
 */

export interface KellyConfig {
  fraction: number; // e.g. 0.25 for quarter Kelly
  cap: number; // max bankroll fraction per bet, e.g. 0.02
  floor: number; // min bankroll fraction when positive, e.g. 0.005
}

export const DEFAULT_KELLY: KellyConfig = {
  fraction: 0.25,
  cap: 0.02,
  floor: 0.005
};

export function kellyStakeFraction(
  modelProb: number,
  decimalOdds: number,
  config: KellyConfig = DEFAULT_KELLY
): number {
  if (!Number.isFinite(modelProb) || !Number.isFinite(decimalOdds)) return 0;
  if (modelProb <= 0 || modelProb >= 1) return 0;
  if (decimalOdds <= 1) return 0;

  const b = decimalOdds - 1;
  const fullKelly = (modelProb * (b + 1) - 1) / b;
  if (fullKelly <= 0) return 0;

  const fractional = config.fraction * fullKelly;
  if (fractional >= config.cap) return config.cap;
  if (fractional < config.floor) return config.floor;
  return fractional;
}

/** Stake EUR amount = bankroll * kellyStakeFraction(). */
export function kellyStakeEur(
  bankrollEur: number,
  modelProb: number,
  decimalOdds: number,
  config: KellyConfig = DEFAULT_KELLY
): number {
  const f = kellyStakeFraction(modelProb, decimalOdds, config);
  return Math.round(bankrollEur * f * 100) / 100;
}

/** Edge as a percentage of the bookmaker's implied probability. */
export function edgePct(modelProb: number, decimalOdds: number): number {
  if (decimalOdds <= 1) return 0;
  const impliedProb = 1 / decimalOdds;
  return (modelProb - impliedProb) / impliedProb;
}
