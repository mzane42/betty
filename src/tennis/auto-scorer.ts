/**
 * Auto-scorer — autonomous pick generation across every active tennis tournament.
 *
 * Pipeline per event:
 *   1. Fetch event slate (cached) via Odds API
 *   2. For each event, score BOTH sides (player1 + player2 selection)
 *   3. Compute Pinnacle no-vig prob from the event's own Pinnacle odds (no
 *      separate Pinnacle source needed — the API gives us both sides in the
 *      same payload, making no-vig math fully local)
 *   4. Best placeable book/odds picked from Winamax/Betclic/Unibet entries
 *   5. Line-movement % computed against the prior snapshot (DB-backed)
 *   6. Reddit tipster count if we have a Reddit-enabled environment
 *   7. Pass through pick-generator → persists tennis_picks + Claude review
 *
 * Designed so the daemon's runScoreUpcoming becomes:
 *     await runAutoScore(db, client)
 * and emits zero, one, or many picks per event depending on edge gating.
 *
 * Compliance: no auto-bet. Picks are persisted as suggestions; user still
 * places manually via UI / Telegram.
 */

import type { Database } from '../db/database.js';
import {
  bestPlaceableOddsForEvent,
  eventComposeMatchId,
  eventToOddsByBook,
  pinnacleNoVigProbForEvent,
  type OddsApiClient
} from './ingest/odds-api.js';
import { lineMovementPct } from './ingest/line-movement.js';
import { generatePick, type GeneratePickResult } from './pick-generator.js';
import { ingestTipsterCount } from './ingest/reddit.js';
import { inferSurface } from './surface.js';
import {
  appendSignal,
  getPlayer,
  logIngestError
} from '../db/repositories/tennis-repository.js';

export interface AutoScoreOptions {
  /** Skip the Reddit tipster call for events not yet starting today (saves quota). */
  enableReddit?: boolean;
  /** Skip the Claude review on every pick (useful for backfill / smoke runs). */
  skipClaudeReview?: boolean;
  /** Override how far ahead we look for events (default: 36h). */
  windowHours?: number;
}

export interface AutoScoreResult {
  eventsConsidered: number;
  picksGenerated: number;
  strongPicks: number;
  playPicks: number;
  skippedPicks: number;
  errors: Array<{ matchId: string; message: string }>;
  /** Human-readable per-event progress lines, displayed live in the UI. */
  logs: string[];
}

export async function runAutoScore(
  db: Database,
  client: OddsApiClient,
  options: AutoScoreOptions = {}
): Promise<AutoScoreResult> {
  const windowMs = (options.windowHours ?? 36) * 3600_000;
  const enableReddit = options.enableReddit ?? false;
  const now = Date.now();
  const events = await client.fetchAllEvents();
  const upcoming = events.filter((e) => {
    const t = new Date(e.commence_time).getTime();
    return t - now > 0 && t - now < windowMs;
  });

  const result: AutoScoreResult = {
    eventsConsidered: upcoming.length,
    picksGenerated: 0,
    strongPicks: 0,
    playPicks: 0,
    skippedPicks: 0,
    errors: [],
    logs: []
  };
  const log = (line: string): void => {
    result.logs.push(line);
    // eslint-disable-next-line no-console
    console.log(`[auto-score] ${line}`);
  };
  log(`scan window=${options.windowHours ?? 36}h, ${events.length} total events, ${upcoming.length} upcoming`);
  if (upcoming.length === 0) {
    log('no upcoming events in window — nothing to score');
    return result;
  }

  for (const event of upcoming) {
    const matchLabel = `${event.home_team} vs ${event.away_team} (${event.sport_key.replace(/^tennis_(atp|wta)_/, '')})`;
    try {
      const sides = [
        { name: event.home_team, isHome: true },
        { name: event.away_team, isHome: false }
      ];
      let sidesScored = 0;
      for (const side of sides) {
        const selectionId = slugId(side.name);
        const oppId = slugId(side.isHome ? event.away_team : event.home_team);
        const placeable = bestPlaceableOddsForEvent(event, selectionId);
        if (!placeable) {
          log(`  ${side.name}: skip — no Unibet odds available`);
          continue;
        }
        const oddsByBook = eventToOddsByBook(event, selectionId);
        if (!oddsByBook[placeable.book]) {
          log(`  ${side.name}: skip — odds map missing best book`);
          continue;
        }

        const pinnacleProb = pinnacleNoVigProbForEvent(event, selectionId);
        const matchId = eventComposeMatchId(event);
        const lineMove = lineMovementPct(db, matchId, selectionId, placeable.book);

        // Reddit FETCH happens before generatePick (cheap network call), but
        // appendSignal (FK to tennis_matches) must wait until generatePick has
        // upserted the row. Hold the payload, persist after.
        let tipsterAlignedCount = 0;
        let pendingTipsterSignal: { payload: string; date: string } | null = null;
        if (enableReddit) {
          try {
            const surname = lastWord(side.name);
            const oppSurname = lastWord(
              side.isHome ? event.away_team : event.home_team
            );
            const tipster = await ingestTipsterCount(surname, oppSurname);
            tipsterAlignedCount = Math.max(0, tipster.alignedCount - tipster.fadeCount);
            pendingTipsterSignal = {
              payload: JSON.stringify(tipster),
              date: new Date().toISOString()
            };
          } catch (err) {
            log(`  ${side.name}: reddit ingest failed (${(err as Error).message})`);
          }
        }

        // Pull ranks from DB if we've loaded Sackmann rankings. Missing rank
        // = pick-generator falls back to Pinnacle no-vig (still works).
        const p1Id = side.isHome ? selectionId : oppId;
        const p2Id = side.isHome ? oppId : selectionId;
        const p1Row = getPlayer(db, p1Id);
        const p2Row = getPlayer(db, p2Id);

        const picked: GeneratePickResult = await generatePick(db, {
          match: {
            tournament: tournamentFromSportKey(event.sport_key),
            surface: inferSurface(event.sport_key),
            round: 'UNK',
            scheduledAt: event.commence_time,
            player1: {
              id: p1Id,
              name: event.home_team,
              rank: p1Row?.rank ?? undefined
            },
            player2: {
              id: p2Id,
              name: event.away_team,
              rank: p2Row?.rank ?? undefined
            }
          },
          selection: selectionId,
          oddsByBook,
          signals: {
            pinnacleProb,
            betfairVolume: null,
            tipsterAlignedCount,
            lineMovementPct: lineMove
          },
          skipClaudeReview: options.skipClaudeReview
        });

        // Now the match exists in DB — safe to persist the Reddit signal.
        if (pendingTipsterSignal) {
          try {
            appendSignal(db, {
              matchId,
              source: 'tipster_consensus',
              signalKind: 'reddit_net',
              payloadJson: pendingTipsterSignal.payload,
              capturedAt: pendingTipsterSignal.date
            });
          } catch (err) {
            logIngestError(db, 'reddit', matchId, (err as Error).message, null);
          }
        }

        sidesScored++;
        result.picksGenerated++;
        const v = picked.pick.verdict;
        const edge = (picked.pick.edgePct * 100).toFixed(1);
        const score = picked.pick.signalScore;
        const odds = picked.pick.bookDecimalOdds.toFixed(2);
        const modelPct = (picked.pick.modelProb * 100).toFixed(1);
        const pinPct = pinnacleProb !== null ? (pinnacleProb * 100).toFixed(1) : 'n/a';
        log(
          `  ${side.name} @${odds} → ${v} | edge ${edge}% | score ${score}/100 | model ${modelPct}% vs Pin ${pinPct}%${lineMove != null ? ` | line ${(lineMove * 100).toFixed(1)}%` : ''}${tipsterAlignedCount > 0 ? ` | tipsters ${tipsterAlignedCount}` : ''}`
        );
        if (v === 'STRONG') result.strongPicks++;
        else if (v === 'PLAY') result.playPicks++;
        else result.skippedPicks++;
      }
      if (sidesScored === 0) {
        log(`${matchLabel}: no sides scoreable`);
      }
    } catch (err) {
      const msg = (err as Error).message;
      result.errors.push({ matchId: event.id, message: msg });
      logIngestError(db, 'auto-score', null, msg, event.id);
      log(`${matchLabel}: ERROR ${msg}`);
    }
  }

  log(
    `done: ${result.picksGenerated} picks (${result.strongPicks} STRONG, ${result.playPicks} PLAY, ${result.skippedPicks} SKIP), ${result.errors.length} errors`
  );
  return result;
}

function slugId(name: string): string {
  const parts = name.trim().toLowerCase().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '';
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const firstInitial = parts[0][0];
  return `${last}_${firstInitial}`.replace(/[^a-z0-9_]/g, '');
}

function lastWord(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

function tournamentFromSportKey(sportKey: string): string {
  // Strip the "tennis_atp_" / "tennis_wta_" prefix to get the slug
  return sportKey.replace(/^tennis_(atp|wta)_/, '').replace(/^tennis_/, '');
}

// surface lookup centralized in src/tennis/surface.ts
