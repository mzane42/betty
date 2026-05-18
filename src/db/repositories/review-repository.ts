import type { Database } from '../database.js';
import type {
  HandReviewResult,
  SessionReviewResult,
  TournamentReviewResult
} from '../../reviewer/review-types.js';

export function saveHandReview(db: Database, handId: string, review: HandReviewResult): void {
  db.prepare(
    `INSERT INTO hand_reviews
     (hand_id, verdict, overall, key_moments_json, alternative_line, lessons_json, raw_response, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(hand_id) DO UPDATE SET
       verdict = excluded.verdict,
       overall = excluded.overall,
       key_moments_json = excluded.key_moments_json,
       alternative_line = excluded.alternative_line,
       lessons_json = excluded.lessons_json,
       raw_response = excluded.raw_response,
       created_at = excluded.created_at`
  ).run(
    handId,
    review.verdict,
    review.overall,
    JSON.stringify(review.keyMoments),
    review.alternativeLine,
    JSON.stringify(review.lessons),
    review.rawResponse,
    new Date().toISOString()
  );
}

export function getHandReview(db: Database, handId: string): HandReviewResult | null {
  const row = db.prepare('SELECT * FROM hand_reviews WHERE hand_id = ?').get(handId) as
    | {
        verdict: string;
        overall: string;
        key_moments_json: string;
        alternative_line: string;
        lessons_json: string;
        raw_response: string;
      }
    | undefined;
  if (!row) return null;
  return {
    verdict: row.verdict as HandReviewResult['verdict'],
    overall: row.overall,
    keyMoments: JSON.parse(row.key_moments_json || '[]'),
    alternativeLine: row.alternative_line,
    lessons: JSON.parse(row.lessons_json || '[]'),
    rawResponse: row.raw_response
  };
}

export function saveSessionReview(
  db: Database,
  sessionDate: string,
  heroAccount: string,
  review: SessionReviewResult
): void {
  db.prepare(
    `INSERT INTO session_reviews
     (session_date, hero_account, session_verdict, summary, patterns_json,
      biggest_mistake_json, biggest_win_json, lessons_json, next_session_focus,
      raw_response, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_date, hero_account) DO UPDATE SET
       session_verdict = excluded.session_verdict,
       summary = excluded.summary,
       patterns_json = excluded.patterns_json,
       biggest_mistake_json = excluded.biggest_mistake_json,
       biggest_win_json = excluded.biggest_win_json,
       lessons_json = excluded.lessons_json,
       next_session_focus = excluded.next_session_focus,
       raw_response = excluded.raw_response,
       created_at = excluded.created_at`
  ).run(
    sessionDate,
    heroAccount,
    review.sessionVerdict,
    review.summary,
    JSON.stringify(review.patterns),
    JSON.stringify(review.biggestMistake),
    JSON.stringify(review.biggestWin),
    JSON.stringify(review.lessons),
    review.nextSessionFocus,
    review.rawResponse,
    new Date().toISOString()
  );
}

export function getSessionReview(
  db: Database,
  sessionDate: string,
  heroAccount: string
): SessionReviewResult | null {
  const row = db
    .prepare('SELECT * FROM session_reviews WHERE session_date = ? AND hero_account = ?')
    .get(sessionDate, heroAccount) as
    | {
        session_verdict: string;
        summary: string;
        patterns_json: string;
        biggest_mistake_json: string;
        biggest_win_json: string;
        lessons_json: string;
        next_session_focus: string;
        raw_response: string;
      }
    | undefined;
  if (!row) return null;
  return {
    sessionVerdict: row.session_verdict as SessionReviewResult['sessionVerdict'],
    summary: row.summary,
    patterns: JSON.parse(row.patterns_json || '[]'),
    biggestMistake: JSON.parse(row.biggest_mistake_json || 'null'),
    biggestWin: JSON.parse(row.biggest_win_json || 'null'),
    lessons: JSON.parse(row.lessons_json || '[]'),
    nextSessionFocus: row.next_session_focus,
    rawResponse: row.raw_response
  };
}

export function saveTournamentReview(
  db: Database,
  tournamentId: string,
  review: TournamentReviewResult
): void {
  db.prepare(
    `INSERT INTO tournament_reviews
     (tournament_id, tournament_verdict, summary, phase_analysis_json, pivot_hand_json,
      key_decisions_json, lessons_json, raw_response, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tournament_id) DO UPDATE SET
       tournament_verdict = excluded.tournament_verdict,
       summary = excluded.summary,
       phase_analysis_json = excluded.phase_analysis_json,
       pivot_hand_json = excluded.pivot_hand_json,
       key_decisions_json = excluded.key_decisions_json,
       lessons_json = excluded.lessons_json,
       raw_response = excluded.raw_response,
       created_at = excluded.created_at`
  ).run(
    tournamentId,
    review.tournamentVerdict,
    review.summary,
    JSON.stringify(review.phaseAnalysis),
    JSON.stringify(review.pivotHand),
    JSON.stringify(review.keyDecisions),
    JSON.stringify(review.lessons),
    review.rawResponse,
    new Date().toISOString()
  );
}

export function getTournamentReview(
  db: Database,
  tournamentId: string
): TournamentReviewResult | null {
  const row = db.prepare('SELECT * FROM tournament_reviews WHERE tournament_id = ?').get(tournamentId) as
    | {
        tournament_verdict: string;
        summary: string;
        phase_analysis_json: string;
        pivot_hand_json: string;
        key_decisions_json: string;
        lessons_json: string;
        raw_response: string;
      }
    | undefined;
  if (!row) return null;
  return {
    tournamentVerdict: row.tournament_verdict as TournamentReviewResult['tournamentVerdict'],
    summary: row.summary,
    phaseAnalysis: JSON.parse(row.phase_analysis_json || '[]'),
    pivotHand: JSON.parse(row.pivot_hand_json || 'null'),
    keyDecisions: JSON.parse(row.key_decisions_json || '[]'),
    lessons: JSON.parse(row.lessons_json || '[]'),
    rawResponse: row.raw_response
  };
}

export function getHandReviewsForSession(
  db: Database,
  sessionDate: string,
  heroAccount: string
): Map<string, { verdict: string; overall: string }> {
  const rows = db
    .prepare(
      `SELECT hr.hand_id, hr.verdict, hr.overall
       FROM hand_reviews hr
       JOIN hands h ON h.hand_id = hr.hand_id
       JOIN tournaments t ON h.tournament_id = t.tournament_id
       WHERE t.hero_account = ? AND DATE(t.start_time) = ?`
    )
    .all(heroAccount, sessionDate) as Array<{ hand_id: string; verdict: string; overall: string }>;
  const map = new Map<string, { verdict: string; overall: string }>();
  for (const r of rows) map.set(r.hand_id, { verdict: r.verdict, overall: r.overall });
  return map;
}
