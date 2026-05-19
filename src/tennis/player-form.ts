/**
 * Player-form HUD — lazy-loaded recent form per player, sourced from Sackmann
 * tennis_atp + tennis_wta CSVs. Powers the curator pick row + audit table HUDs.
 *
 * Returns last-5 results overall + clay W% + days-since-last-match. Stays
 * thin: a real "form" model lives in clay-elo.json (the per-player ratings);
 * this module just exposes recent activity for UI display.
 *
 * Designed for one-shot per-pick lookups. First call hydrates an in-memory
 * index from the cached CSVs (~20MB across 3 years × 2 tours); subsequent
 * calls hit RAM.
 */

import { fetchSackmannYear, parseSackmannCsv, type SackmannMatchRow } from './model/sackmann-loader.js';

export interface PlayerFormResult {
  playerName: string;
  matchesPlayed: number;
  last5: Array<{
    date: string;
    surface: string;
    result: 'W' | 'L';
    opponentName: string;
    round: string;
  }>;
  clayWinPct: number;
  clayMatches: number;
  daysSinceLast: number | null;
  lastMatchDate: string | null;
}

let cachedIndex: Map<string, SackmannMatchRow[]> | null = null;
let lastBuildAt = 0;
const REBUILD_TTL_MS = 24 * 3600_000;

export async function getPlayerForm(playerName: string): Promise<PlayerFormResult> {
  const idx = await ensureIndex();
  const key = normalizeName(playerName);
  const rows = idx.get(key) ?? [];

  if (rows.length === 0) {
    return emptyForm(playerName);
  }

  // Rows from index are pre-sorted descending by date.
  const last5 = rows.slice(0, 5).map((r) => ({
    date: formatDate(r.tourneyDate),
    surface: r.surface,
    result: (r.winnerName === playerName || normalizeName(r.winnerName) === key
      ? 'W'
      : 'L') as 'W' | 'L',
    opponentName:
      r.winnerName === playerName || normalizeName(r.winnerName) === key
        ? r.loserName
        : r.winnerName,
    round: r.round
  }));

  const clayRows = rows.filter((r) => r.surface.toLowerCase() === 'clay');
  const clayWins = clayRows.filter(
    (r) => r.winnerName === playerName || normalizeName(r.winnerName) === key
  ).length;
  const clayWinPct = clayRows.length === 0 ? 0 : (clayWins / clayRows.length) * 100;

  const lastDate = parseDate(rows[0].tourneyDate);
  const daysSinceLast =
    lastDate === null ? null : Math.max(0, Math.floor((Date.now() - lastDate.getTime()) / 86400_000));

  return {
    playerName,
    matchesPlayed: rows.length,
    last5,
    clayWinPct,
    clayMatches: clayRows.length,
    daysSinceLast,
    lastMatchDate: lastDate ? lastDate.toISOString().slice(0, 10) : null
  };
}

async function ensureIndex(): Promise<Map<string, SackmannMatchRow[]>> {
  const fresh = cachedIndex && Date.now() - lastBuildAt < REBUILD_TTL_MS;
  if (fresh && cachedIndex) return cachedIndex;
  cachedIndex = await buildIndex();
  lastBuildAt = Date.now();
  return cachedIndex;
}

async function buildIndex(): Promise<Map<string, SackmannMatchRow[]>> {
  const thisYear = new Date().getUTCFullYear();
  const years = [thisYear, thisYear - 1, thisYear - 2];
  const tours: Array<'atp' | 'wta'> = ['atp', 'wta'];

  const all: SackmannMatchRow[] = [];
  for (const tour of tours) {
    for (const year of years) {
      try {
        const csv = await fetchSackmannYear(tour, year);
        all.push(...parseSackmannCsv(csv));
      } catch (err) {
        // Year may not exist yet (e.g. early in season). Skip.
        console.warn(`[player-form] sackmann ${tour} ${year} unavailable: ${(err as Error).message}`);
      }
    }
  }

  all.sort((a, b) => (b.tourneyDate ?? '').localeCompare(a.tourneyDate ?? ''));

  const idx = new Map<string, SackmannMatchRow[]>();
  for (const row of all) {
    for (const name of [row.winnerName, row.loserName]) {
      if (!name) continue;
      const key = normalizeName(name);
      const list = idx.get(key) ?? [];
      list.push(row);
      idx.set(key, list);
    }
  }
  return idx;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(raw: string): Date | null {
  if (!raw || raw.length < 8) return null;
  const yyyy = raw.slice(0, 4);
  const mm = raw.slice(4, 6);
  const dd = raw.slice(6, 8);
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(raw: string): string {
  const d = parseDate(raw);
  return d ? d.toISOString().slice(0, 10) : raw;
}

function emptyForm(playerName: string): PlayerFormResult {
  return {
    playerName,
    matchesPlayed: 0,
    last5: [],
    clayWinPct: 0,
    clayMatches: 0,
    daysSinceLast: null,
    lastMatchDate: null
  };
}
