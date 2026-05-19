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
import { appendSignal, logIngestError } from '../db/repositories/tennis-repository.js';

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
    errors: []
  };

  for (const event of upcoming) {
    try {
      // Score BOTH sides of the match. One often has +EV, rarely both — the
      // scorer filters via verdict gating.
      const sides = [
        { name: event.home_team, isHome: true },
        { name: event.away_team, isHome: false }
      ];
      for (const side of sides) {
        const selectionId = slugId(side.name);
        const oppId = slugId(side.isHome ? event.away_team : event.home_team);
        const placeable = bestPlaceableOddsForEvent(event, selectionId);
        if (!placeable) continue; // No FR-placeable odds for this side, skip
        const oddsByBook = eventToOddsByBook(event, selectionId);
        if (!oddsByBook[placeable.book]) continue;

        const pinnacleProb = pinnacleNoVigProbForEvent(event, selectionId);

        const matchId = eventComposeMatchId(event);
        const lineMove = lineMovementPct(db, matchId, selectionId, placeable.book);

        let tipsterAlignedCount = 0;
        if (enableReddit) {
          try {
            const surname = lastWord(side.name);
            const oppSurname = lastWord(
              side.isHome ? event.away_team : event.home_team
            );
            const tipster = await ingestTipsterCount(surname, oppSurname);
            tipsterAlignedCount = Math.max(0, tipster.alignedCount - tipster.fadeCount);
            appendSignal(db, {
              matchId,
              source: 'tipster_consensus',
              signalKind: 'reddit_net',
              payloadJson: JSON.stringify(tipster),
              capturedAt: new Date().toISOString()
            });
          } catch (err) {
            logIngestError(db, 'reddit', matchId, (err as Error).message, null);
          }
        }

        const picked: GeneratePickResult = await generatePick(db, {
          match: {
            tournament: tournamentFromSportKey(event.sport_key),
            surface: surfaceFromSportKey(event.sport_key),
            round: 'UNK',
            scheduledAt: event.commence_time,
            player1: { id: side.isHome ? selectionId : oppId, name: event.home_team },
            player2: { id: side.isHome ? oppId : selectionId, name: event.away_team }
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

        result.picksGenerated++;
        if (picked.pick.verdict === 'STRONG') result.strongPicks++;
        else if (picked.pick.verdict === 'PLAY') result.playPicks++;
        else result.skippedPicks++;
      }
    } catch (err) {
      result.errors.push({ matchId: event.id, message: (err as Error).message });
      logIngestError(db, 'auto-score', null, (err as Error).message, event.id);
    }
  }

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

function surfaceFromSportKey(sportKey: string): 'clay' | 'hard' | 'grass' {
  if (sportKey.includes('french_open') || sportKey.includes('roland') || sportKey.includes('madrid') || sportKey.includes('rome')) return 'clay';
  if (sportKey.includes('wimbledon') || sportKey.includes('queens') || sportKey.includes('halle')) return 'grass';
  return 'hard';
}
