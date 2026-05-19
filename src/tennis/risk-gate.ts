/**
 * Risk gate — stop-loss / take-profit / drawdown circuit breakers.
 *
 * Called before any pick is shown as "placeable". When a circuit is tripped,
 * picks are still generated (audit trail) but flagged `blocked: true` and the
 * UI / Telegram bot must not surface them as actionable.
 *
 * Config lives in ~/.poker-coach/config/tennis-risk.json (see `defaultRiskConfig`).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Database } from '../db/database.js';
import { listAllBets } from '../db/repositories/tennis-repository.js';
import { getTennisBankrollSummary } from '../db/repositories/tennis-repository.js';

const CONFIG_PATH = join(homedir(), '.poker-coach', 'config', 'tennis-risk.json');

export interface RiskConfig {
  /** Hard bankroll size in EUR used as the % denominator. */
  bankrollEur: number;
  /** Daily stop-loss threshold, e.g. -0.03 for -3% bankroll. */
  dailyStopLossPct: number;
  /** Tournament-level take-profit (Kelly halves above this). */
  tournamentTakeProfitPct: number;
  /** Peak-to-trough drawdown that pauses picks for `circuitBreakerPauseHours`. */
  drawdownCircuitBreakerPct: number;
  /** How long to pause after circuit-breaker trip, in hours. */
  circuitBreakerPauseHours: number;
  /** Manual pause until this ISO timestamp (set by `/stop` Telegram command). */
  pausedUntilIso: string | null;
  /** Tournament identifier the take-profit applies to. */
  activeTournament: string;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  bankrollEur: 200,
  dailyStopLossPct: -0.03,
  tournamentTakeProfitPct: 0.15,
  drawdownCircuitBreakerPct: -0.1,
  circuitBreakerPauseHours: 48,
  pausedUntilIso: null,
  activeTournament: 'roland_garros_2026'
};

export function loadRiskConfig(): RiskConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const obj = JSON.parse(raw) as Partial<RiskConfig>;
    return { ...DEFAULT_RISK_CONFIG, ...obj };
  } catch {
    return { ...DEFAULT_RISK_CONFIG };
  }
}

export function saveRiskConfig(cfg: RiskConfig): void {
  mkdirSync(join(homedir(), '.poker-coach', 'config'), { recursive: true });
  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_RISK_CONFIG, null, 2), 'utf-8');
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

export type RiskGateReason =
  | 'ok'
  | 'manual-pause'
  | 'daily-stop-loss'
  | 'drawdown-circuit-breaker';

export interface RiskGateStatus {
  reason: RiskGateReason;
  blocked: boolean;
  /** Multiplier on the default Kelly fraction (e.g. 0.5 = half-stake mode after take-profit). */
  stakeMultiplier: number;
  /** Human-readable explanation for UI / Telegram. */
  message: string;
  config: RiskConfig;
}

export function evaluateRiskGate(db: Database, now: Date = new Date()): RiskGateStatus {
  const config = loadRiskConfig();

  // 1. Manual pause
  if (config.pausedUntilIso) {
    const until = new Date(config.pausedUntilIso);
    if (until.getTime() > now.getTime()) {
      return {
        reason: 'manual-pause',
        blocked: true,
        stakeMultiplier: 0,
        message: `Picks en pause manuelle jusqu'à ${until.toLocaleString('fr-FR')}.`,
        config
      };
    }
  }

  // 2. Daily stop-loss (today's resolved bets P&L vs bankroll)
  const todayIso = now.toISOString().slice(0, 10);
  const allBets = listAllBets(db);
  const todayNet = allBets
    .filter((b) => b.result != null && b.placedAt.startsWith(todayIso))
    .reduce((s, b) => s + (b.pnlEur ?? 0), 0);
  const todayPct = todayNet / config.bankrollEur;
  if (todayPct <= config.dailyStopLossPct) {
    return {
      reason: 'daily-stop-loss',
      blocked: true,
      stakeMultiplier: 0,
      message: `Stop-loss journalier atteint (${(todayPct * 100).toFixed(1)}% bankroll). Picks en pause jusqu'à demain.`,
      config
    };
  }

  // 3. Drawdown circuit breaker (peak-to-trough on cumulative tennis P&L)
  const cumByDay = computeCumulativeByDay(allBets);
  if (cumByDay.length > 0) {
    let peak = 0;
    let trough = 0;
    for (const point of cumByDay) {
      if (point.cumulative > peak) peak = point.cumulative;
      const drawdown = (point.cumulative - peak) / config.bankrollEur;
      if (drawdown < trough) trough = drawdown;
    }
    if (trough <= config.drawdownCircuitBreakerPct) {
      return {
        reason: 'drawdown-circuit-breaker',
        blocked: true,
        stakeMultiplier: 0,
        message: `Circuit breaker drawdown (${(trough * 100).toFixed(1)}% vs peak). Pause obligatoire ${config.circuitBreakerPauseHours}h.`,
        config
      };
    }
  }

  // 4. Take-profit → half-stake mode
  const tournamentSummary = getTennisBankrollSummary(db, config.activeTournament);
  const tournamentPct = tournamentSummary.allTimeNet / config.bankrollEur;
  if (tournamentPct >= config.tournamentTakeProfitPct) {
    return {
      reason: 'ok',
      blocked: false,
      stakeMultiplier: 0.5,
      message: `Take-profit atteint (+${(tournamentPct * 100).toFixed(1)}% bankroll). Mode demi-mise activé.`,
      config
    };
  }

  return {
    reason: 'ok',
    blocked: false,
    stakeMultiplier: 1.0,
    message: 'Pas de blocage. Mises Kelly normales.',
    config
  };
}

function computeCumulativeByDay(
  bets: Array<{ placedAt: string; pnlEur: number | null; result: string | null }>
): Array<{ date: string; cumulative: number }> {
  const decided = bets.filter((b) => b.result != null);
  decided.sort((a, b) => a.placedAt.localeCompare(b.placedAt));
  const byDay = new Map<string, number>();
  for (const b of decided) {
    const day = b.placedAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + (b.pnlEur ?? 0));
  }
  const days = Array.from(byDay.keys()).sort();
  let running = 0;
  return days.map((d) => {
    running += byDay.get(d) ?? 0;
    return { date: d, cumulative: running };
  });
}

/** Manual pause: set pausedUntilIso to now + hours. Called from `/stop` Telegram command. */
export function manualPause(hours: number): RiskConfig {
  const cfg = loadRiskConfig();
  const until = new Date(Date.now() + hours * 3600_000).toISOString();
  cfg.pausedUntilIso = until;
  saveRiskConfig(cfg);
  return cfg;
}

/** Manual resume: clear pausedUntilIso. */
export function manualResume(): RiskConfig {
  const cfg = loadRiskConfig();
  cfg.pausedUntilIso = null;
  saveRiskConfig(cfg);
  return cfg;
}
