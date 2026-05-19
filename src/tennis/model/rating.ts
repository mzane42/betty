/**
 * Player rating + win-probability model.
 *
 * Two implementations:
 *   1. clayElo()        — preferred, reads cached clay-Elo ratings if available.
 *   2. rankBasedProb()  — fallback when Elo cache is empty. Uses ATP/WTA rank.
 *
 * For the Roland Garros 2026 MVP we ship the rank-based fallback so the pipeline
 * runs end-to-end even before the Sackmann ingest job has been executed.
 * The Sackmann CSV → Elo job lives in `src/cli/tennis-load-elo.ts` and writes
 * to ~/.poker-coach/cache/clay-elo.json.
 *
 * Win-prob formula (logistic, ATP rank-based):
 *   p1_wins = 1 / (1 + 10^((rank1_log - rank2_log) / SCALE))
 *   where rank_log = log10(rank).  SCALE tuned empirically to ~0.85 for clay.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CLAY_ELO_CACHE_PATH = join(homedir(), '.poker-coach', 'cache', 'clay-elo.json');
const RANK_LOG_SCALE = 0.85;

export interface ClayEloEntry {
  rating: number;
  matchesPlayed: number;
  lastMatchDate: string;
}

let cachedClayElo: Map<string, ClayEloEntry> | null = null;
let cacheLoadedAt = 0;

function loadClayEloCache(force = false): Map<string, ClayEloEntry> {
  const now = Date.now();
  // Refresh cache view at most once per 60s
  if (!force && cachedClayElo && now - cacheLoadedAt < 60_000) {
    return cachedClayElo;
  }
  try {
    const raw = readFileSync(CLAY_ELO_CACHE_PATH, 'utf-8');
    const obj = JSON.parse(raw) as Record<string, ClayEloEntry>;
    cachedClayElo = new Map(Object.entries(obj));
  } catch {
    cachedClayElo = new Map();
  }
  cacheLoadedAt = now;
  return cachedClayElo;
}

/** Returns clay-Elo rating or null if the player has no cached rating. */
export function clayElo(playerId: string): number | null {
  const entry = loadClayEloCache().get(playerId);
  return entry?.rating ?? null;
}

/** Returns clay-Elo entry (rating + sample size) or null. */
export function clayEloEntry(playerId: string): ClayEloEntry | null {
  return loadClayEloCache().get(playerId) ?? null;
}

/** Force-reload the cache (call after the Sackmann ingest job writes new data). */
export function invalidateClayEloCache(): void {
  cachedClayElo = null;
  cacheLoadedAt = 0;
}

/**
 * Elo-based win probability for player1 over player2.
 * Standard logistic: p1 = 1 / (1 + 10^((R2 - R1) / 400)).
 */
export function eloWinProb(rating1: number, rating2: number): number {
  return 1 / (1 + Math.pow(10, (rating2 - rating1) / 400));
}

/**
 * Rank-based fallback win probability when Elo unavailable.
 * Uses log-rank because rank gaps are non-linear in skill (rank 5 vs 50 ≠ rank 100 vs 145).
 */
export function rankBasedProb(rank1: number | null, rank2: number | null): number {
  if (rank1 == null && rank2 == null) return 0.5;
  if (rank1 == null) return 0.3; // unranked vs ranked → underdog
  if (rank2 == null) return 0.7;
  const safe1 = Math.max(1, rank1);
  const safe2 = Math.max(1, rank2);
  const log1 = Math.log10(safe1);
  const log2 = Math.log10(safe2);
  return 1 / (1 + Math.pow(10, (log1 - log2) / RANK_LOG_SCALE));
}

export interface MatchProbInput {
  player1Id: string;
  player2Id: string;
  rank1?: number | null;
  rank2?: number | null;
}

export interface MatchProbResult {
  p1Win: number;
  p2Win: number;
  source: 'clay-elo' | 'rank-fallback' | 'priors-only';
  /** Number of clay matches the rating is based on. 0 means heavy fallback. */
  sampleSizeP1: number;
  sampleSizeP2: number;
}

/**
 * Compute match win probability with intelligent source selection:
 *   - Both players have ≥ MIN_SAMPLE clay matches → use clay-Elo
 *   - At least one has rank → rank fallback
 *   - Neither → return 50/50
 */
export function matchProb(input: MatchProbInput): MatchProbResult {
  const MIN_SAMPLE = 15;
  const e1 = clayEloEntry(input.player1Id);
  const e2 = clayEloEntry(input.player2Id);

  if (
    e1 &&
    e2 &&
    e1.matchesPlayed >= MIN_SAMPLE &&
    e2.matchesPlayed >= MIN_SAMPLE
  ) {
    const p = eloWinProb(e1.rating, e2.rating);
    return {
      p1Win: p,
      p2Win: 1 - p,
      source: 'clay-elo',
      sampleSizeP1: e1.matchesPlayed,
      sampleSizeP2: e2.matchesPlayed
    };
  }

  if (input.rank1 != null || input.rank2 != null) {
    const p = rankBasedProb(input.rank1 ?? null, input.rank2 ?? null);
    return {
      p1Win: p,
      p2Win: 1 - p,
      source: 'rank-fallback',
      sampleSizeP1: e1?.matchesPlayed ?? 0,
      sampleSizeP2: e2?.matchesPlayed ?? 0
    };
  }

  return {
    p1Win: 0.5,
    p2Win: 0.5,
    source: 'priors-only',
    sampleSizeP1: 0,
    sampleSizeP2: 0
  };
}
