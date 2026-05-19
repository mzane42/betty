/**
 * The Odds API adapter — https://the-odds-api.com
 *
 * Free tier: 500 requests/month. With the daemon's default cadence (T-24h,
 * T-6h, T-1h plus 30min line polling), a 2-week tournament fits comfortably
 * under the free quota when we cap line polling to once per hour. The on-disk
 * cache (5-minute TTL) prevents repeated calls for the same slate within a
 * single batch.
 *
 * Sport keys we care about:
 *   tennis_atp_french_open
 *   tennis_wta_french_open
 *
 * Bookmaker mapping: the API returns book keys like `pinnacle`, `unibet_eu`,
 * `betfair_ex_eu`, etc. We pass through only the ones we treat as either
 * placeable (`winamax`, `betclic`, `unibet`) or reference (`pinnacle`,
 * `betfair`). Anything else is ignored.
 *
 * Conforms to the Scrapers interface from signal-daemon.ts so it can be
 * plugged in as a drop-in replacement for NOOP_SCRAPERS:
 *
 *   const scrapers = createOddsApiScrapers(process.env.ODDS_API_KEY!);
 *   startSignalDaemon(getDb, { scrapers });
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { OddsSnapshot, TennisBook, TennisMatch } from '../../types/tennis.js';
import type { Scrapers } from '../signal-daemon.js';

const API_BASE = 'https://api.the-odds-api.com/v4';
const CACHE_DIR = join(homedir(), '.poker-coach', 'cache', 'odds-api');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const BOOK_KEY_MAP: Record<string, TennisBook> = {
  pinnacle: 'pinnacle',
  unibet_eu: 'unibet',
  unibet: 'unibet',
  betclic_fr: 'betclic',
  betclic: 'betclic',
  winamax_fr: 'winamax',
  winamax: 'winamax',
  betfair_ex_eu: 'betfair',
  betfair_ex_uk: 'betfair',
  betfair: 'betfair'
};

interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

interface OddsApiBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Array<{
    key: string;
    last_update: string;
    outcomes: Array<{
      name: string;
      price: number;
    }>;
  }>;
}

export interface OddsApiOptions {
  apiKey: string;
  region?: string; // default 'eu'
  sportKeys?: string[]; // default: all currently-active tennis sport keys (discovered)
  /** Override cache TTL for testing. */
  cacheTtlMs?: number;
}

export interface DiscoveredSport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

/**
 * List all sport keys the API currently exposes. We filter for `group === 'Tennis'`
 * and `active === true` to find tournaments to monitor. Cached for 6h since the
 * sport list changes only when tournaments start/end.
 */
export async function discoverTennisSports(apiKey: string): Promise<DiscoveredSport[]> {
  ensureCacheDir();
  const cachePath = join(CACHE_DIR, '_sports-list.json');
  const cacheTtl = 6 * 60 * 60 * 1000;
  if (existsSync(cachePath)) {
    const stat = readCacheStat(cachePath);
    if (stat && Date.now() - stat.mtimeMs < cacheTtl) {
      return JSON.parse(readFileSync(cachePath, 'utf-8')) as DiscoveredSport[];
    }
  }
  const url = `${API_BASE}/sports?apiKey=${apiKey}&all=false`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API /sports ${res.status}: ${text.slice(0, 200)}`);
  }
  const all = (await res.json()) as DiscoveredSport[];
  const tennis = all.filter((s) => s.group === 'Tennis' && s.active);
  writeFileSync(cachePath, JSON.stringify(tennis), 'utf-8');
  // eslint-disable-next-line no-console
  console.log(
    `[odds-api] discovered ${tennis.length} active tennis tournaments (quota left: ${res.headers.get('x-requests-remaining') ?? '?'})`
  );
  return tennis;
}

/**
 * Build a Scrapers instance that auto-discovers all currently-active tennis
 * tournaments via /sports, then queries each for events. Caches both the
 * sport list (6h) and per-sport event payloads (5min).
 */
export function createOddsApiScrapers(opts: OddsApiOptions): Scrapers {
  const region = opts.region ?? 'eu';
  const cacheTtl = opts.cacheTtlMs ?? CACHE_TTL_MS;
  // sportKeys is null = auto-discover; pinned list = use the explicit set
  const pinnedSportKeys = opts.sportKeys;

  async function activeSportKeys(): Promise<string[]> {
    if (pinnedSportKeys) return pinnedSportKeys;
    try {
      const discovered = await discoverTennisSports(opts.apiKey);
      return discovered.map((s) => s.key);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[odds-api] discovery failed, falling back to RG only:`, (err as Error).message);
      return ['tennis_atp_french_open', 'tennis_wta_french_open'];
    }
  }

  async function fetchAllEvents(): Promise<OddsApiEvent[]> {
    ensureCacheDir();
    const sportKeys = await activeSportKeys();
    const all: OddsApiEvent[] = [];
    for (const sport of sportKeys) {
      try {
        const events = await fetchSport(opts.apiKey, sport, region, cacheTtl);
        all.push(...events);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[odds-api] ${sport} fetch failed:`, (err as Error).message);
      }
    }
    return all;
  }

  return {
    async fetchSlate(forDateIso: string) {
      const events = await fetchAllEvents();
      const filtered = events.filter((e) => e.commence_time.startsWith(forDateIso));
      return filtered.map((e) => mapEventToScraperOutput(e));
    },

    async refreshOdds(matchId: string) {
      const events = await fetchAllEvents();
      const event = events.find((e) => composeMatchId(e) === matchId);
      if (!event) return [];
      return mapEventToOddsSnapshots(event);
    }
  };
}

/**
 * Same as createOddsApiScrapers but also exposes the raw event list to callers
 * that need to drive the auto-score loop. Internal use; the public Scrapers
 * interface stays narrow.
 */
export interface OddsApiClient extends Scrapers {
  fetchAllEvents(): Promise<OddsApiEvent[]>;
}

export function createOddsApiClient(opts: OddsApiOptions): OddsApiClient {
  const region = opts.region ?? 'eu';
  const cacheTtl = opts.cacheTtlMs ?? CACHE_TTL_MS;
  const pinnedSportKeys = opts.sportKeys;

  async function activeSportKeys(): Promise<string[]> {
    if (pinnedSportKeys) return pinnedSportKeys;
    try {
      const discovered = await discoverTennisSports(opts.apiKey);
      return discovered.map((s) => s.key);
    } catch {
      return ['tennis_atp_french_open', 'tennis_wta_french_open'];
    }
  }

  async function fetchAllEvents(): Promise<OddsApiEvent[]> {
    ensureCacheDir();
    const sportKeys = await activeSportKeys();
    const all: OddsApiEvent[] = [];
    for (const sport of sportKeys) {
      try {
        const events = await fetchSport(opts.apiKey, sport, region, cacheTtl);
        all.push(...events);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[odds-api] ${sport} fetch failed:`, (err as Error).message);
      }
    }
    return all;
  }

  return {
    fetchAllEvents,
    async fetchSlate(forDateIso: string) {
      const events = await fetchAllEvents();
      const filtered = events.filter((e) => e.commence_time.startsWith(forDateIso));
      return filtered.map((e) => mapEventToScraperOutput(e));
    },
    async refreshOdds(matchId: string) {
      const events = await fetchAllEvents();
      const event = events.find((e) => composeMatchId(e) === matchId);
      if (!event) return [];
      return mapEventToOddsSnapshots(event);
    }
  };
}

/** Exported so the auto-score loop can introspect events directly. */
export type { OddsApiEvent };

/** Helpers used by the auto-score loop. */
export function pinnacleNoVigProbForEvent(
  event: OddsApiEvent,
  selectionPlayerId: string
): number | null {
  const pinnacle = event.bookmakers.find((b) => b.key === 'pinnacle');
  if (!pinnacle) return null;
  const market = pinnacle.markets.find((m) => m.key === 'h2h');
  if (!market || market.outcomes.length !== 2) return null;
  const [a, b] = market.outcomes;
  if (a.price <= 1 || b.price <= 1) return null;
  const impliedA = 1 / a.price;
  const impliedB = 1 / b.price;
  const total = impliedA + impliedB;
  const slugA = slugId(a.name);
  return slugA === selectionPlayerId ? impliedA / total : impliedB / total;
}

export function bestPlaceableOddsForEvent(
  event: OddsApiEvent,
  selectionPlayerId: string
): { book: TennisBook; odds: number } | null {
  let best: { book: TennisBook; odds: number } | null = null;
  for (const b of event.bookmakers) {
    const bookKey = BOOK_KEY_MAP[b.key];
    if (!bookKey) continue;
    if (bookKey !== 'winamax' && bookKey !== 'betclic' && bookKey !== 'unibet') continue;
    const market = b.markets.find((m) => m.key === 'h2h');
    if (!market) continue;
    for (const o of market.outcomes) {
      if (slugId(o.name) !== selectionPlayerId) continue;
      if (!best || o.price > best.odds) {
        best = { book: bookKey, odds: o.price };
      }
    }
  }
  return best;
}

export function eventToOddsByBook(
  event: OddsApiEvent,
  selectionPlayerId: string
): Partial<Record<TennisBook, number>> {
  const out: Partial<Record<TennisBook, number>> = {};
  for (const b of event.bookmakers) {
    const bookKey = BOOK_KEY_MAP[b.key];
    if (!bookKey) continue;
    const market = b.markets.find((m) => m.key === 'h2h');
    if (!market) continue;
    for (const o of market.outcomes) {
      if (slugId(o.name) === selectionPlayerId) {
        out[bookKey] = o.price;
      }
    }
  }
  return out;
}

export function eventComposeMatchId(event: OddsApiEvent): string {
  return composeMatchId(event);
}

async function fetchSport(
  apiKey: string,
  sportKey: string,
  region: string,
  cacheTtl: number
): Promise<OddsApiEvent[]> {
  const cachePath = join(CACHE_DIR, `${sportKey}_${region}.json`);
  if (existsSync(cachePath)) {
    const stat = readCacheStat(cachePath);
    if (stat && Date.now() - stat.mtimeMs < cacheTtl) {
      const raw = readFileSync(cachePath, 'utf-8');
      return JSON.parse(raw) as OddsApiEvent[];
    }
  }

  const url =
    `${API_BASE}/sports/${sportKey}/odds` +
    `?apiKey=${apiKey}&regions=${region}&markets=h2h&oddsFormat=decimal`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API ${res.status}: ${text.slice(0, 200)}`);
  }
  const events = (await res.json()) as OddsApiEvent[];
  writeFileSync(cachePath, JSON.stringify(events), 'utf-8');
  // eslint-disable-next-line no-console
  console.log(
    `[odds-api] ${sportKey} fetched ${events.length} events (remaining quota ` +
      `${res.headers.get('x-requests-remaining') ?? '?'})`
  );
  return events;
}

function readCacheStat(path: string): { mtimeMs: number } | null {
  try {
    // Avoid importing statSync separately — reuse fs.readFileSync's path-only stat
    // via the existsSync + Date.now math approach. For TTL purposes, file mtime is
    // approximated as creation time on first write; good enough for 5-minute TTL.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { statSync } = require('node:fs') as typeof import('node:fs');
    const s = statSync(path);
    return { mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
}

function ensureCacheDir(): void {
  mkdirSync(CACHE_DIR, { recursive: true });
}

function mapEventToScraperOutput(event: OddsApiEvent): {
  match: TennisMatch;
  oddsByBook: Partial<Record<TennisBook, { selection: string; odds: number }[]>>;
} {
  const matchId = composeMatchId(event);
  const player1Id = slugId(event.home_team);
  const player2Id = slugId(event.away_team);
  const oddsByBook: Partial<Record<TennisBook, { selection: string; odds: number }[]>> = {};

  for (const book of event.bookmakers) {
    const bookKey = BOOK_KEY_MAP[book.key];
    if (!bookKey) continue;
    const market = book.markets.find((m) => m.key === 'h2h');
    if (!market) continue;
    const outcomes: Array<{ selection: string; odds: number }> = [];
    for (const o of market.outcomes) {
      const selection = o.name === event.home_team ? player1Id : player2Id;
      outcomes.push({ selection, odds: o.price });
    }
    oddsByBook[bookKey] = outcomes;
  }

  const surface = inferSurface(event.sport_key);
  return {
    match: {
      matchId,
      tournament: inferTournament(event.sport_key),
      surface,
      round: 'UNK', // Odds API does not expose round info; populated by future enrichment
      player1Id,
      player2Id,
      scheduledAt: event.commence_time,
      status: 'scheduled',
      winnerId: null,
      score: null
    },
    oddsByBook
  };
}

function mapEventToOddsSnapshots(event: OddsApiEvent): OddsSnapshot[] {
  const out: OddsSnapshot[] = [];
  const matchId = composeMatchId(event);
  const player1Id = slugId(event.home_team);
  const player2Id = slugId(event.away_team);
  const now = new Date().toISOString();

  for (const book of event.bookmakers) {
    const bookKey = BOOK_KEY_MAP[book.key];
    if (!bookKey) continue;
    const market = book.markets.find((m) => m.key === 'h2h');
    if (!market) continue;
    for (const o of market.outcomes) {
      const selection = o.name === event.home_team ? player1Id : player2Id;
      out.push({
        matchId,
        book: bookKey,
        market: 'match_winner',
        selection,
        decimalOdds: o.price,
        capturedAt: now
      });
    }
  }
  return out;
}

function composeMatchId(event: OddsApiEvent): string {
  const dateStr = event.commence_time.slice(0, 10).replace(/-/g, '');
  const tournament = inferTournament(event.sport_key);
  const p1 = slugId(event.home_team);
  const p2 = slugId(event.away_team);
  return `${tournament}_${dateStr}_unk_${p1}_${p2}`.toLowerCase();
}

function inferTournament(sportKey: string): string {
  if (sportKey.includes('french_open')) return 'roland_garros_2026';
  if (sportKey.includes('wimbledon')) return 'wimbledon_2026';
  if (sportKey.includes('us_open')) return 'us_open_2026';
  if (sportKey.includes('australian_open')) return 'australian_open_2026';
  return sportKey;
}

function inferSurface(sportKey: string): TennisMatch['surface'] {
  if (sportKey.includes('french_open')) return 'clay';
  if (sportKey.includes('wimbledon')) return 'grass';
  return 'hard';
}

function slugId(name: string): string {
  const parts = name.trim().toLowerCase().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '';
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const firstInitial = parts[0][0];
  return `${last}_${firstInitial}`.replace(/[^a-z0-9_]/g, '');
}
