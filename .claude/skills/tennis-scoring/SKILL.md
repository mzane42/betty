---
name: tennis-scoring
description: Use when modifying verdict logic, Kelly sizing, signal weighting, or edge thresholds. Defines cross-info scorer contract.
---

# Tennis Cross-Info Scorer

Owner: `src/tennis/cross-info-scorer.ts`.

## Signal weights (MVP constants)

```ts
const SIGNAL_WEIGHTS = {
  model: 0.40,            // clay-Elo + H2H + form + fatigue
  pinnacle_novig: 0.25,
  betfair_volume: 0.15,
  tipster_consensus: 0.10,
  line_movement: 0.10,
};
```

`tipster_consensus` ne compte que si **≥3 sources indépendantes** s'alignent (Reddit threads + line direction + Betfair volume direction). Sinon poids redistribué proportionnellement.

## Verdict thresholds

```ts
const VERDICT_THRESHOLDS = {
  STRONG: { score: 75, edge: 0.03 },
  PLAY:   { score: 60, edge: 0.03 },
};
```

**Hard floor** (toujours): `score <= 0 || edge <= 0` → `SKIP`. Empêche les picks fantômes quand un signal manque.

```ts
function pickVerdict(score, edge, t) {
  if (score <= 0 || edge <= 0) return 'SKIP';
  if (score >= t.strong.score && edge >= t.strong.edge) return 'STRONG';
  if (score >= t.play.score && edge >= t.play.edge) return 'PLAY';
  return 'SKIP';
}
```

## Kelly sizing

```ts
const KELLY = { fraction: 0.25, cap: 0.02, floor: 0.005 };
// stake_pct = clamp(0.25 * kelly_full, 0.005, 0.02)
```

Cap 2% bankroll, floor 0.5% (en dessous = pas la peine).

## "Best book" rule

`tennis_picks.best_book` ∈ {`winamax`, `betclic`, `unibet`} uniquement (books où l'user peut placer).
Pinnacle + Betfair = **référence seulement** (no-vig → `fair_decimal_odds`, line-movement signal). Jamais écrits comme `best_book`.

## Stop-loss / take-profit

Config `config/risk.json`:
- Daily stop-loss: -3% bankroll → pause picks jusqu'à demain
- Tournament take-profit: +15% → Kelly fraction halved
- Drawdown circuit-breaker: -10% depuis pic → pause 48h + resume manuel
