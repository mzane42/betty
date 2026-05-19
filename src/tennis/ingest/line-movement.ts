/**
 * Line movement signal — % change between opening odds and current odds for
 * the selected player on a placeable book.
 *
 * Positive value = book shortened (price dropped) on our selection.
 *   Interpretation: sharps are backing the same side; line is moving with us.
 *
 * Reads from `tennis_odds_snapshots` via the repository helpers, so the daemon
 * must have at least one prior snapshot for the computation to mean anything.
 */

import type { Database } from '../../db/database.js';
import { getClosingOdds, getOpeningOdds } from '../../db/repositories/tennis-repository.js';
import type { TennisBook } from '../../types/tennis.js';

/** Returns % shortening (positive = good for our side) or null when no opening snapshot. */
export function lineMovementPct(
  db: Database,
  matchId: string,
  selection: string,
  book: TennisBook
): number | null {
  const opening = getOpeningOdds(db, matchId, selection, book);
  const latest = getClosingOdds(db, matchId, selection, book);
  if (opening == null || latest == null) return null;
  if (opening <= 1 || latest <= 1) return null;
  // Positive = price shortened from opening → ours
  return (opening - latest) / opening;
}
