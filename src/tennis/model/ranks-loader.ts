/**
 * ATP / WTA singles ranks loader — Sackmann's currentish CSVs.
 *
 * Sources (free, MIT licensed):
 *   ATP: https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_rankings_current.csv
 *   WTA: https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_rankings_current.csv
 *
 * Sackmann updates these CSVs every Monday after the weekly rankings publish.
 * Schema: ranking_date,rank,player,points
 *   player = Sackmann numeric player_id (needs join against atp_players.csv
 *   for name → our slug ID).
 *
 * Player files:
 *   atp_players.csv columns: player_id,name_first,name_last,hand,dob,ioc,height
 *   wta_players.csv same shape
 *
 * Output: writes into the tennis_players table (rank, rank_points,
 * rank_tour, rank_updated_at). New players inserted if missing.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Database } from '../../db/database.js';

const CACHE_DIR = join(homedir(), '.poker-coach', 'cache', 'sackmann-ranks');

const SOURCES = {
  atp: {
    rankings: 'https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_rankings_current.csv',
    players: 'https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_players.csv'
  },
  wta: {
    rankings: 'https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_rankings_current.csv',
    players: 'https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_players.csv'
  }
} as const;

interface PlayerInfo {
  numericId: string;
  firstName: string;
  lastName: string;
  hand: string;
  dob: string;
  ioc: string;
}

interface RankRow {
  rankingDate: string;
  rank: number;
  numericPlayerId: string;
  points: number;
}

async function fetchAndCache(url: string, filename: string, force = false): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const localPath = join(CACHE_DIR, filename);
  if (!force && existsSync(localPath)) {
    return readFileSync(localPath, 'utf-8');
  }
  // eslint-disable-next-line no-console
  console.log(`[ranks-loader] fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url} failed ${res.status}`);
  }
  const text = await res.text();
  writeFileSync(localPath, text, 'utf-8');
  return text;
}

function parsePlayersCsv(csv: string): Map<string, PlayerInfo> {
  const lines = csv.split(/\r?\n/);
  const header = lines[0].split(',');
  const idx = (n: string): number => header.indexOf(n);
  const cols = {
    player_id: idx('player_id'),
    name_first: idx('name_first'),
    name_last: idx('name_last'),
    hand: idx('hand'),
    dob: idx('dob'),
    ioc: idx('ioc')
  };
  const map = new Map<string, PlayerInfo>();
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(',');
    if (!fields[cols.player_id]) continue;
    map.set(fields[cols.player_id], {
      numericId: fields[cols.player_id],
      firstName: fields[cols.name_first] ?? '',
      lastName: fields[cols.name_last] ?? '',
      hand: fields[cols.hand] ?? '',
      dob: fields[cols.dob] ?? '',
      ioc: fields[cols.ioc] ?? ''
    });
  }
  return map;
}

function parseRankingsCsv(csv: string): RankRow[] {
  const lines = csv.split(/\r?\n/);
  const header = lines[0].split(',');
  const idx = (n: string): number => header.indexOf(n);
  const cols = {
    ranking_date: idx('ranking_date'),
    rank: idx('rank'),
    player: idx('player'),
    points: idx('points')
  };
  // Use the most recent ranking_date in the file (Sackmann sometimes ships
  // multiple weeks in the "current" file).
  const allRows: RankRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(',');
    if (!fields[cols.player]) continue;
    const r = parseInt(fields[cols.rank], 10);
    const p = parseInt(fields[cols.points], 10);
    if (!Number.isFinite(r)) continue;
    allRows.push({
      rankingDate: fields[cols.ranking_date] ?? '',
      rank: r,
      numericPlayerId: fields[cols.player],
      points: Number.isFinite(p) ? p : 0
    });
  }
  if (allRows.length === 0) return [];
  // Keep only most recent ranking_date
  const latest = allRows.reduce((max, row) =>
    row.rankingDate > max ? row.rankingDate : max,
    allRows[0].rankingDate
  );
  return allRows.filter((r) => r.rankingDate === latest);
}

/**
 * Same slug convention as everywhere else in the app:
 * "First Last" → "last_f"; stable across name variants.
 */
function slugFromName(first: string, last: string): string {
  const cleanFirst = first.trim().toLowerCase();
  const cleanLast = last.trim().toLowerCase().replace(/\s+/g, '');
  if (!cleanLast) return '';
  if (!cleanFirst) return cleanLast;
  return `${cleanLast}_${cleanFirst[0]}`.replace(/[^a-z0-9_]/g, '');
}

function normalizeDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export interface LoadRanksOptions {
  tours?: Array<'atp' | 'wta'>;
  force?: boolean;
}

export interface LoadRanksResult {
  rowsWritten: number;
  rankingDateAtp: string | null;
  rankingDateWta: string | null;
  errors: string[];
}

export async function loadRanksIntoDb(
  db: Database,
  options: LoadRanksOptions = {}
): Promise<LoadRanksResult> {
  const tours = options.tours ?? ['atp', 'wta'];
  const result: LoadRanksResult = {
    rowsWritten: 0,
    rankingDateAtp: null,
    rankingDateWta: null,
    errors: []
  };

  const upsert = db.prepare(
    `INSERT INTO tennis_players
       (player_id, name, country, hand, height_cm, birth_date,
        rank, rank_points, rank_tour, rank_updated_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET
       name=COALESCE(NULLIF(excluded.name, ''), tennis_players.name),
       country=COALESCE(NULLIF(excluded.country, ''), tennis_players.country),
       hand=COALESCE(NULLIF(excluded.hand, ''), tennis_players.hand),
       birth_date=COALESCE(NULLIF(excluded.birth_date, ''), tennis_players.birth_date),
       rank=excluded.rank,
       rank_points=excluded.rank_points,
       rank_tour=excluded.rank_tour,
       rank_updated_at=excluded.rank_updated_at,
       updated_at=excluded.updated_at`
  );

  for (const tour of tours) {
    try {
      const playersCsv = await fetchAndCache(
        SOURCES[tour].players,
        `${tour}_players.csv`,
        options.force
      );
      const rankingsCsv = await fetchAndCache(
        SOURCES[tour].rankings,
        `${tour}_rankings_current.csv`,
        options.force
      );

      const players = parsePlayersCsv(playersCsv);
      const ranks = parseRankingsCsv(rankingsCsv);
      if (ranks.length === 0) {
        result.errors.push(`${tour}: no rank rows`);
        continue;
      }
      const rankingDate = normalizeDate(ranks[0].rankingDate);
      if (tour === 'atp') result.rankingDateAtp = rankingDate;
      else result.rankingDateWta = rankingDate;

      const nowIso = new Date().toISOString();
      const tx = db.transaction((rows: RankRow[]) => {
        for (const row of rows) {
          const player = players.get(row.numericPlayerId);
          if (!player) continue;
          const slug = slugFromName(player.firstName, player.lastName);
          if (!slug) continue;
          const fullName = `${player.firstName} ${player.lastName}`.trim();
          upsert.run(
            slug,
            fullName,
            player.ioc || null,
            (player.hand as 'L' | 'R') || null,
            null,
            player.dob ? normalizeDate(player.dob) : null,
            row.rank,
            row.points,
            tour,
            rankingDate,
            nowIso
          );
          result.rowsWritten++;
        }
      });
      tx(ranks);
    } catch (err) {
      result.errors.push(`${tour}: ${(err as Error).message}`);
    }
  }

  return result;
}
