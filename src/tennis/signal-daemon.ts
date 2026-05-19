/**
 * Signal daemon — schedules the daily and pre-match work.
 *
 * Cron schedule (Europe/Paris):
 *   - 03:00 T-24h batch     → scrape next-day slate, snapshot opening odds
 *   - 08:00 T-6h batch      → refresh odds, ingest Reddit, score picks, push STRONG
 *   - 11:00 T-1h batch      → final refresh + withdrawal check
 *   - every 30 min          → line-movement poll for upcoming matches
 *   - 21:00 daily digest    → Telegram summary
 *
 * Uses `node-cron` via dynamic import so its absence in bun.lock is a graceful
 * no-op rather than a boot failure. The actual scraper (OddsHarvester
 * fork) is pluggable via the `Scrapers` interface; ship-day uses the noop
 * implementation that returns an empty slate. Real scraper goes in
 * `src/tennis/ingest/scraper.ts` next.
 */

import type { Database } from '../db/database.js';
import { captureClosingOdds } from './closing-odds.js';
import { createOddsApiClient } from './ingest/odds-api.js';
import { ingestTipsterCount } from './ingest/reddit.js';
import { lineMovementPct } from './ingest/line-movement.js';
import { pushTelegramMessage } from './telegram-bot.js';
import {
  listUpcomingMatches,
  insertOddsSnapshots,
  appendSignal,
  logIngestError,
  getTennisBankrollSummary
} from '../db/repositories/tennis-repository.js';
// Reserved for the auto-scoring path once the real scraper supplies a full
// match context (ranks, h2h, last 5). For now, picks are generated from the UI.
// import { generatePick } from './pick-generator.js';
import type { OddsSnapshot, TennisBook, TennisMatch } from '../types/tennis.js';

const TIMEZONE = 'Europe/Paris';
const TOURNAMENT = 'roland_garros_2026';

export interface Scrapers {
  /**
   * Fetch the next-day match slate from the bookmaker source. Returns
   * matches with their opening odds across all listed books. Implementations
   * MUST be idempotent: same match returned again on subsequent calls.
   */
  fetchSlate(forDateIso: string): Promise<
    Array<{
      match: TennisMatch;
      oddsByBook: Partial<Record<TennisBook, { selection: string; odds: number }[]>>;
    }>
  >;

  /** Refresh odds for a specific match across all books. */
  refreshOdds(matchId: string): Promise<OddsSnapshot[]>;
}

/** Default no-op scraper — used until a real scraper is plugged in. */
export const NOOP_SCRAPERS: Scrapers = {
  async fetchSlate() {
    return [];
  },
  async refreshOdds() {
    return [];
  }
};

export interface DaemonOptions {
  scrapers?: Scrapers;
  tournament?: string;
}

export interface DaemonHandle {
  enabled: boolean;
  reason?: string;
  stop(): void;
  /** Manual run of one job (useful for dev menu + tests). */
  runOnce(job: 'T-24h' | 'T-6h' | 'T-1h' | 'line-poll' | 'daily-digest'): Promise<void>;
}

export async function startSignalDaemon(
  getDb: () => Database,
  options: DaemonOptions = {}
): Promise<DaemonHandle> {
  const scrapers = options.scrapers ?? NOOP_SCRAPERS;
  const tournament = options.tournament ?? TOURNAMENT;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cron: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cron = (await import('node-cron' as any)) as any;
  } catch (err) {
    return {
      enabled: false,
      reason: `node-cron not installed: ${(err as Error).message}. Run: bun add node-cron`,
      stop() {},
      runOnce: async (job) => runOnce(getDb(), scrapers, tournament, job)
    };
  }

  const tasks = [
    cron.schedule('0 3 * * *', () => void runOnce(getDb(), scrapers, tournament, 'T-24h'), {
      timezone: TIMEZONE
    }),
    cron.schedule('0 8 * * *', () => void runOnce(getDb(), scrapers, tournament, 'T-6h'), {
      timezone: TIMEZONE
    }),
    cron.schedule('0 11 * * *', () => void runOnce(getDb(), scrapers, tournament, 'T-1h'), {
      timezone: TIMEZONE
    }),
    cron.schedule('*/30 * * * *', () => void runOnce(getDb(), scrapers, tournament, 'line-poll'), {
      timezone: TIMEZONE
    }),
    cron.schedule('0 21 * * *', () => void runOnce(getDb(), scrapers, tournament, 'daily-digest'), {
      timezone: TIMEZONE
    })
  ];

  // eslint-disable-next-line no-console
  console.log('[signal-daemon] started, 5 cron jobs scheduled');

  return {
    enabled: true,
    stop() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const t of tasks) (t as any).stop();
    },
    runOnce: (job) => runOnce(getDb(), scrapers, tournament, job)
  };
}

async function runOnce(
  db: Database,
  scrapers: Scrapers,
  tournament: string,
  job: 'T-24h' | 'T-6h' | 'T-1h' | 'line-poll' | 'daily-digest'
): Promise<void> {
  const startedAt = Date.now();
  // eslint-disable-next-line no-console
  console.log(`[signal-daemon] job=${job} started`);
  try {
    switch (job) {
      case 'T-24h':
        await runScrapeSlate(db, scrapers, tournament, 1);
        break;
      case 'T-6h':
        await runScrapeSlate(db, scrapers, tournament, 0);
        await runScoreUpcoming(db, scrapers, tournament);
        break;
      case 'T-1h':
        await runRefreshOdds(db, scrapers, tournament, 2);
        await runWithdrawalCheck(db, tournament);
        break;
      case 'line-poll':
        await runRefreshOdds(db, scrapers, tournament, 2);
        await runClosingOddsCapture(db);
        break;
      case 'daily-digest':
        await runDailyDigest(db, tournament);
        break;
    }
    // eslint-disable-next-line no-console
    console.log(`[signal-daemon] job=${job} done in ${Date.now() - startedAt}ms`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[signal-daemon] job=${job} failed:`, (err as Error).message);
    logIngestError(db, `daemon:${job}`, null, (err as Error).message, null);
  }
}

async function runScrapeSlate(
  _db: Database,
  scrapers: Scrapers,
  _tournament: string,
  dayOffset: number
): Promise<void> {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + dayOffset);
  const dateIso = date.toISOString().slice(0, 10);
  const slate = await scrapers.fetchSlate(dateIso);
  // eslint-disable-next-line no-console
  console.log(`[signal-daemon] slate ${dateIso}: ${slate.length} matches`);
  // TODO: persist via upsertMatch + upsertPlayer + insertOddsSnapshots once
  // the real scraper returns shaped data. The interface is in place; no-op
  // for now.
}

async function runRefreshOdds(
  db: Database,
  scrapers: Scrapers,
  tournament: string,
  hoursWindow: number
): Promise<void> {
  const now = Date.now();
  const windowMs = hoursWindow * 3600_000;
  const upcoming = listUpcomingMatches(db, tournament).filter((m) => {
    const t = new Date(m.scheduledAt).getTime();
    return t - now <= windowMs && t - now > 0;
  });
  for (const match of upcoming) {
    try {
      const snapshots = await scrapers.refreshOdds(match.matchId);
      if (snapshots.length > 0) insertOddsSnapshots(db, snapshots);
      const moved = lineMovementPct(db, match.matchId, match.player1Id, 'winamax');
      if (moved !== null) {
        appendSignal(db, {
          matchId: match.matchId,
          source: 'line_movement',
          signalKind: 'line_movement_pct',
          payloadJson: JSON.stringify({ pct: moved, book: 'winamax' }),
          capturedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      logIngestError(
        db,
        'refresh-odds',
        match.matchId,
        (err as Error).message,
        null
      );
    }
  }
}

async function runScoreUpcoming(
  db: Database,
  scrapers: Scrapers,
  _tournament: string
): Promise<void> {
  // If the scrapers exposes the OddsApiClient surface (fetchAllEvents),
  // we run the autonomous auto-scorer. Otherwise this is a no-op.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maybeClient = scrapers as any;
  if (typeof maybeClient.fetchAllEvents !== 'function') {
    console.log('[signal-daemon] score-upcoming: scrapers lacks fetchAllEvents, skipping');
    return;
  }
  const { runAutoScore } = await import('./auto-scorer.js');
  const result = await runAutoScore(db, maybeClient, {
    enableReddit: true,
    windowHours: 36
  });
  console.log(
    `[signal-daemon] auto-score: ${result.eventsConsidered} events → ` +
      `${result.strongPicks} STRONG, ${result.playPicks} PLAY, ${result.skippedPicks} SKIP, ` +
      `${result.errors.length} errors`
  );

  // After scoring, run the curator pass on today's PLAY+STRONG list.
  const { runCurator } = await import('./curator.js');
  const curated = await runCurator(db, { pushTelegram: true });
  console.log(`[signal-daemon] curator: ${curated.selected_picks.length} selected`);
}

async function runClosingOddsCapture(db: Database): Promise<void> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.log('[signal-daemon] closing-odds: ODDS_API_KEY missing, skipped');
    return;
  }
  const client = createOddsApiClient({ apiKey });
  const res = await captureClosingOdds(db, client);
  for (const line of res.logs) console.log(`[signal-daemon] ${line}`);
  if (res.captured > 0) {
    console.log(`[signal-daemon] closing-odds: captured ${res.captured} CLV snapshot(s)`);
  }
}

async function runWithdrawalCheck(db: Database, tournament: string): Promise<void> {
  // Stub: real implementation queries the source for player status. Until
  // wired up, this is a no-op that logs intent.
  const upcoming = listUpcomingMatches(db, tournament);
  // eslint-disable-next-line no-console
  console.log(
    `[signal-daemon] withdrawal-check for ${upcoming.length} upcoming matches (no source wired)`
  );
}

async function runDailyDigest(db: Database, tournament: string): Promise<void> {
  const summary = getTennisBankrollSummary(db, tournament);
  const today = new Date().toLocaleDateString('fr-FR');
  const text = [
    `📊 Tennis daily ${today}`,
    `Net all-time: ${summary.allTimeNet.toFixed(2)}€ | ROI ${summary.roi.toFixed(1)}%`,
    `Bets: ${summary.betsWon}W-${summary.betsLost}L-${summary.betsVoid}V` +
      ` (${summary.betsPending} en cours)`,
    `Win rate: ${(summary.winRate * 100).toFixed(1)}% | CLV moyen ${summary.avgClvPct.toFixed(2)}%`
  ].join('\n');
  await pushTelegramMessage(text).catch(() => undefined);
}

/**
 * Optional: enrich a known match with Reddit tipster counts.
 * Called by the auto-scorer once it's wired. For now usable from CLI / dev menu.
 */
export async function enrichWithReddit(
  db: Database,
  matchId: string,
  player1Surname: string,
  player2Surname: string
): Promise<void> {
  try {
    const count = await ingestTipsterCount(player1Surname, player2Surname);
    appendSignal(db, {
      matchId,
      source: 'tipster_consensus',
      signalKind: 'reddit_aligned_count',
      payloadJson: JSON.stringify(count),
      capturedAt: new Date().toISOString()
    });
  } catch (err) {
    logIngestError(db, 'reddit', matchId, (err as Error).message, null);
  }
}
