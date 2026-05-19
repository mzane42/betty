/**
 * Status sync — cross-checks DB tennis_matches against a fresh Odds API
 * snapshot and flips stale rows to `withdrawn` or `finished`.
 *
 * Rules:
 *  - scheduled match in DB but not in current Odds API slate AND start time is
 *    still in the future → withdrawn (book pulled it, draw changed,
 *    substitution shuffled the bracket).
 *  - scheduled match in DB with scheduled_at + maxMatchHours < now → finished.
 *    We don't know the winner without a result scraper, so winner_id stays
 *    null; the user can fill it via the UI or settle path.
 *
 * Idempotent: re-running just re-applies the same labels.
 */

import type { Database } from '../db/database.js';
import { eventComposeMatchId, type OddsApiClient } from './ingest/odds-api.js';

export interface StatusSyncResult {
  scanned: number;
  withdrawn: number;
  finished: number;
  logs: string[];
}

export async function syncMatchStatuses(
  db: Database,
  client: OddsApiClient,
  options: { maxMatchHours?: number } = {}
): Promise<StatusSyncResult> {
  const maxMatchHours = options.maxMatchHours ?? 5;
  const now = Date.now();
  const cutoff = new Date(now - maxMatchHours * 3600_000).toISOString();

  const scheduled = db
    .prepare(
      `SELECT match_id, scheduled_at, player1_id, player2_id, tournament
       FROM tennis_matches
       WHERE status='scheduled'`
    )
    .all() as Array<{
    match_id: string;
    scheduled_at: string;
    player1_id: string;
    player2_id: string;
    tournament: string;
  }>;

  const logs: string[] = [`status-sync: ${scheduled.length} scheduled match(es) to verify`];
  if (scheduled.length === 0) {
    return { scanned: 0, withdrawn: 0, finished: 0, logs };
  }

  const events = await client.fetchAllEvents();
  const liveMatchIds = new Set(events.map((e) => eventComposeMatchId(e)));

  let withdrawn = 0;
  let finished = 0;
  const updateFinished = db.prepare(`UPDATE tennis_matches SET status='finished' WHERE match_id=?`);
  const updateWithdrawn = db.prepare(
    `UPDATE tennis_matches SET status='withdrawn' WHERE match_id=?`
  );

  for (const m of scheduled) {
    const wellPast = m.scheduled_at < cutoff;
    if (wellPast) {
      updateFinished.run(m.match_id);
      finished++;
      logs.push(
        `  finished: ${m.player1_id} vs ${m.player2_id} (${m.tournament}, ${m.scheduled_at})`
      );
      continue;
    }
    const inFreshSlate = liveMatchIds.has(m.match_id);
    if (!inFreshSlate && new Date(m.scheduled_at).getTime() > now) {
      updateWithdrawn.run(m.match_id);
      withdrawn++;
      logs.push(
        `  withdrawn: ${m.player1_id} vs ${m.player2_id} (${m.tournament}, ${m.scheduled_at}) — not in Odds API`
      );
    }
  }

  return { scanned: scheduled.length, withdrawn, finished, logs };
}
