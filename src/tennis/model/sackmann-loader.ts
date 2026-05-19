/**
 * Sackmann tennis_atp / tennis_wta CSV loader.
 *
 * Fetches public match-history CSVs from JeffSackmann/tennis_atp and tennis_wta on
 * GitHub raw, parses them, and computes clay-Elo for every player.
 *
 * Cache layout under ~/.poker-coach/cache/sackmann/:
 *   atp_matches_2024.csv
 *   atp_matches_2025.csv
 *   atp_matches_2026.csv
 *   wta_matches_2024.csv
 *   ...
 *
 * Output: ~/.poker-coach/cache/clay-elo.json
 *   { "alcaraz_c": { rating: 2150, matchesPlayed: 87, lastMatchDate: "2026-05-15" }, ... }
 *
 * Player ID convention: lowercase first letter of first name + underscore + lowercase
 * last name (e.g. "Carlos Alcaraz" → "c_alcaraz"). We keep both Sackmann's numeric
 * player_id and the human-readable id; the human-readable form is what the UI uses.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CACHE_DIR = join(homedir(), '.poker-coach', 'cache', 'sackmann');
const CLAY_ELO_PATH = join(homedir(), '.poker-coach', 'cache', 'clay-elo.json');

const ATP_BASE = 'https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master';
const WTA_BASE = 'https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master';

const ELO_K_CLAY = 24;
const INITIAL_RATING = 1500;

export interface SackmannMatchRow {
  tourneyDate: string;
  surface: string;
  winnerId: string;
  winnerName: string;
  winnerHand: string;
  winnerHt: string;
  winnerIoc: string;
  loserId: string;
  loserName: string;
  loserHand: string;
  loserHt: string;
  loserIoc: string;
  round: string;
  bestOf: string;
  winnerRank: string;
  loserRank: string;
}

export async function fetchSackmannYear(
  tour: 'atp' | 'wta',
  year: number,
  force = false
): Promise<string> {
  ensureCacheDir();
  const filename = `${tour}_matches_${year}.csv`;
  const localPath = join(CACHE_DIR, filename);
  if (!force && existsSync(localPath)) {
    return readFileSync(localPath, 'utf-8');
  }
  const base = tour === 'atp' ? ATP_BASE : WTA_BASE;
  const url = `${base}/${filename}`;
  // eslint-disable-next-line no-console
  console.log(`[sackmann] fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Sackmann fetch failed ${res.status}: ${url}`);
  }
  const text = await res.text();
  writeFileSync(localPath, text, 'utf-8');
  return text;
}

function ensureCacheDir(): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(join(homedir(), '.poker-coach', 'cache'), { recursive: true });
}

export function parseSackmannCsv(csv: string): SackmannMatchRow[] {
  const lines = csv.split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(',');
  const idx = (name: string): number => header.indexOf(name);
  const cols = {
    tourneyDate: idx('tourney_date'),
    surface: idx('surface'),
    winnerId: idx('winner_id'),
    winnerName: idx('winner_name'),
    winnerHand: idx('winner_hand'),
    winnerHt: idx('winner_ht'),
    winnerIoc: idx('winner_ioc'),
    loserId: idx('loser_id'),
    loserName: idx('loser_name'),
    loserHand: idx('loser_hand'),
    loserHt: idx('loser_ht'),
    loserIoc: idx('loser_ioc'),
    round: idx('round'),
    bestOf: idx('best_of'),
    winnerRank: idx('winner_rank'),
    loserRank: idx('loser_rank')
  };

  const rows: SackmannMatchRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const fields = splitCsvLine(line);
    rows.push({
      tourneyDate: fields[cols.tourneyDate] ?? '',
      surface: fields[cols.surface] ?? '',
      winnerId: fields[cols.winnerId] ?? '',
      winnerName: fields[cols.winnerName] ?? '',
      winnerHand: fields[cols.winnerHand] ?? '',
      winnerHt: fields[cols.winnerHt] ?? '',
      winnerIoc: fields[cols.winnerIoc] ?? '',
      loserId: fields[cols.loserId] ?? '',
      loserName: fields[cols.loserName] ?? '',
      loserHand: fields[cols.loserHand] ?? '',
      loserHt: fields[cols.loserHt] ?? '',
      loserIoc: fields[cols.loserIoc] ?? '',
      round: fields[cols.round] ?? '',
      bestOf: fields[cols.bestOf] ?? '',
      winnerRank: fields[cols.winnerRank] ?? '',
      loserRank: fields[cols.loserRank] ?? ''
    });
  }
  return rows;
}

/**
 * Minimal CSV split — Sackmann data has no embedded commas/quotes inside fields.
 * If that ever changes we'll need a real CSV parser.
 */
function splitCsvLine(line: string): string[] {
  return line.split(',');
}

export interface ClayEloOutput {
  [playerId: string]: {
    rating: number;
    matchesPlayed: number;
    lastMatchDate: string;
    name?: string;
    ioc?: string;
  };
}

/** Build clay-Elo from all rows across years/tours. Rows must be roughly chronological;
 *  we sort by tourney_date before processing. */
export function computeClayElo(rows: SackmannMatchRow[]): ClayEloOutput {
  const clay = rows.filter((r) => r.surface === 'Clay');
  // Stable sort by tourney_date (YYYYMMDD strings sort correctly)
  clay.sort((a, b) => a.tourneyDate.localeCompare(b.tourneyDate));

  const ratings = new Map<string, number>();
  const counts = new Map<string, number>();
  const lastDates = new Map<string, string>();
  const names = new Map<string, string>();
  const iocs = new Map<string, string>();

  const get = (id: string): number => ratings.get(id) ?? INITIAL_RATING;
  const tick = (id: string, name: string, ioc: string, date: string): void => {
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (date) lastDates.set(id, normalizeDate(date));
    if (name && !names.has(id)) names.set(id, name);
    if (ioc && !iocs.has(id)) iocs.set(id, ioc);
  };

  for (const r of clay) {
    const winnerId = normalizeId(r.winnerId, r.winnerName);
    const loserId = normalizeId(r.loserId, r.loserName);
    if (!winnerId || !loserId) continue;

    const rw = get(winnerId);
    const rl = get(loserId);
    const expectedWinner = 1 / (1 + Math.pow(10, (rl - rw) / 400));
    ratings.set(winnerId, rw + ELO_K_CLAY * (1 - expectedWinner));
    ratings.set(loserId, rl + ELO_K_CLAY * (0 - (1 - expectedWinner)));

    tick(winnerId, r.winnerName, r.winnerIoc, r.tourneyDate);
    tick(loserId, r.loserName, r.loserIoc, r.tourneyDate);
  }

  const out: ClayEloOutput = {};
  for (const [id, rating] of ratings.entries()) {
    out[id] = {
      rating: Math.round(rating * 10) / 10,
      matchesPlayed: counts.get(id) ?? 0,
      lastMatchDate: lastDates.get(id) ?? '',
      name: names.get(id),
      ioc: iocs.get(id)
    };
  }
  return out;
}

/**
 * Normalize Sackmann's `<First> <Last>` into a stable ID like "alcaraz_c".
 * We prefer this over numeric IDs because the rest of the app uses human-readable
 * IDs in URLs / UI. The Sackmann numeric ID (`_numericId`) is kept in the signature
 * for future use (e.g., joining against other Sackmann tables) but isn't needed today.
 */
function normalizeId(_numericId: string, name: string): string {
  if (!name) return '';
  const parts = name.trim().toLowerCase().split(/\s+/);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const firstInitial = parts[0][0];
  // Strip non-alphanumeric chars
  return `${last}_${firstInitial}`.replace(/[^a-z0-9_]/g, '');
}

function normalizeDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export function writeClayEloCache(out: ClayEloOutput): string {
  ensureCacheDir();
  writeFileSync(CLAY_ELO_PATH, JSON.stringify(out, null, 2), 'utf-8');
  return CLAY_ELO_PATH;
}

export interface BuildClayEloOptions {
  years?: number[];
  tours?: Array<'atp' | 'wta'>;
  force?: boolean;
}

/** End-to-end: fetch years × tours, parse, compute, write. */
export async function buildClayElo(opts: BuildClayEloOptions = {}): Promise<{
  outputPath: string;
  playerCount: number;
  rowsProcessed: number;
}> {
  const currentYear = new Date().getUTCFullYear();
  const years = opts.years ?? [currentYear - 1, currentYear];
  const tours = opts.tours ?? ['atp', 'wta'];

  const allRows: SackmannMatchRow[] = [];
  for (const tour of tours) {
    for (const year of years) {
      try {
        const csv = await fetchSackmannYear(tour, year, opts.force);
        allRows.push(...parseSackmannCsv(csv));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[sackmann] skipping ${tour} ${year}:`, (err as Error).message);
      }
    }
  }

  const elo = computeClayElo(allRows);
  const path = writeClayEloCache(elo);
  return {
    outputPath: path,
    playerCount: Object.keys(elo).length,
    rowsProcessed: allRows.length
  };
}
