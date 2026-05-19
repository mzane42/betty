import type { Database } from '../database.js';
import type {
  TennisPlayer,
  TennisMatch,
  TennisMatchStatus,
  OddsSnapshot,
  TennisPick,
  TennisBet,
  TennisBook,
  PickVerdict,
  BetResult,
  SignalRecord,
  TennisBankrollPoint,
  TennisBankrollSummary
} from '../../types/tennis.js';

// ----- Players -----

export function upsertPlayer(db: Database, p: TennisPlayer): void {
  db.prepare(
    `INSERT INTO tennis_players (player_id, name, country, hand, height_cm, birth_date, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET
       name=excluded.name,
       country=excluded.country,
       hand=excluded.hand,
       height_cm=excluded.height_cm,
       birth_date=excluded.birth_date,
       updated_at=excluded.updated_at`
  ).run(p.playerId, p.name, p.country, p.hand, p.heightCm, p.birthDate, p.updatedAt);
}

export function getPlayer(db: Database, playerId: string): TennisPlayer | null {
  const row = db
    .prepare(
      `SELECT player_id, name, country, hand, height_cm, birth_date,
              rank, rank_points, rank_tour, rank_updated_at, updated_at
       FROM tennis_players WHERE player_id = ?`
    )
    .get(playerId) as
    | {
        player_id: string;
        name: string;
        country: string | null;
        hand: 'L' | 'R' | null;
        height_cm: number | null;
        birth_date: string | null;
        rank: number | null;
        rank_points: number | null;
        rank_tour: string | null;
        rank_updated_at: string | null;
        updated_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    playerId: row.player_id,
    name: row.name,
    country: row.country,
    hand: row.hand,
    heightCm: row.height_cm,
    birthDate: row.birth_date,
    rank: row.rank,
    rankPoints: row.rank_points,
    rankTour: row.rank_tour,
    rankUpdatedAt: row.rank_updated_at,
    updatedAt: row.updated_at
  };
}

// ----- Matches -----

export function upsertMatch(db: Database, m: TennisMatch): void {
  db.prepare(
    `INSERT INTO tennis_matches
       (match_id, tournament, surface, round, player1_id, player2_id, scheduled_at, status, winner_id, score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(match_id) DO UPDATE SET
       tournament=excluded.tournament,
       surface=excluded.surface,
       round=excluded.round,
       player1_id=excluded.player1_id,
       player2_id=excluded.player2_id,
       scheduled_at=excluded.scheduled_at,
       status=excluded.status,
       winner_id=COALESCE(excluded.winner_id, tennis_matches.winner_id),
       score=COALESCE(excluded.score, tennis_matches.score)`
  ).run(
    m.matchId,
    m.tournament,
    m.surface,
    m.round,
    m.player1Id,
    m.player2Id,
    m.scheduledAt,
    m.status,
    m.winnerId,
    m.score
  );
}

export function setMatchStatus(
  db: Database,
  matchId: string,
  status: TennisMatchStatus,
  winnerId: string | null = null,
  score: string | null = null
): void {
  db.prepare(
    `UPDATE tennis_matches SET status=?, winner_id=COALESCE(?, winner_id), score=COALESCE(?, score)
     WHERE match_id=?`
  ).run(status, winnerId, score, matchId);
}

export function listUpcomingMatches(db: Database, tournament: string): TennisMatch[] {
  const rows = db
    .prepare(
      `SELECT match_id, tournament, surface, round, player1_id, player2_id,
              scheduled_at, status, winner_id, score
       FROM tennis_matches
       WHERE tournament=? AND status IN ('scheduled', 'live')
       ORDER BY scheduled_at ASC`
    )
    .all(tournament) as Array<{
    match_id: string;
    tournament: string;
    surface: string;
    round: string;
    player1_id: string;
    player2_id: string;
    scheduled_at: string;
    status: string;
    winner_id: string | null;
    score: string | null;
  }>;
  return rows.map(rowToMatch);
}

export function listMatchesByDate(db: Database, tournament: string, dateIso: string): TennisMatch[] {
  const rows = db
    .prepare(
      `SELECT match_id, tournament, surface, round, player1_id, player2_id,
              scheduled_at, status, winner_id, score
       FROM tennis_matches
       WHERE tournament=? AND DATE(scheduled_at)=?
       ORDER BY scheduled_at ASC`
    )
    .all(tournament, dateIso) as Array<{
    match_id: string;
    tournament: string;
    surface: string;
    round: string;
    player1_id: string;
    player2_id: string;
    scheduled_at: string;
    status: string;
    winner_id: string | null;
    score: string | null;
  }>;
  return rows.map(rowToMatch);
}

function rowToMatch(row: {
  match_id: string;
  tournament: string;
  surface: string;
  round: string;
  player1_id: string;
  player2_id: string;
  scheduled_at: string;
  status: string;
  winner_id: string | null;
  score: string | null;
}): TennisMatch {
  return {
    matchId: row.match_id,
    tournament: row.tournament,
    surface: row.surface as TennisMatch['surface'],
    round: row.round,
    player1Id: row.player1_id,
    player2Id: row.player2_id,
    scheduledAt: row.scheduled_at,
    status: row.status as TennisMatchStatus,
    winnerId: row.winner_id,
    score: row.score
  };
}

// ----- Odds snapshots -----

export function insertOddsSnapshot(db: Database, s: OddsSnapshot): void {
  db.prepare(
    `INSERT INTO tennis_odds_snapshots
       (match_id, book, market, selection, decimal_odds, captured_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(s.matchId, s.book, s.market, s.selection, s.decimalOdds, s.capturedAt);
}

export function insertOddsSnapshots(db: Database, snapshots: OddsSnapshot[]): void {
  const stmt = db.prepare(
    `INSERT INTO tennis_odds_snapshots
       (match_id, book, market, selection, decimal_odds, captured_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction((rows: OddsSnapshot[]) => {
    for (const r of rows) {
      stmt.run(r.matchId, r.book, r.market, r.selection, r.decimalOdds, r.capturedAt);
    }
  });
  tx(snapshots);
}

export function getLatestOdds(
  db: Database,
  matchId: string,
  selection: string
): Array<{ book: TennisBook; decimalOdds: number; capturedAt: string }> {
  const rows = db
    .prepare(
      `SELECT book, decimal_odds, captured_at
       FROM tennis_odds_snapshots o
       WHERE match_id=? AND selection=?
         AND captured_at = (
           SELECT MAX(captured_at) FROM tennis_odds_snapshots
           WHERE match_id=o.match_id AND book=o.book AND selection=o.selection
         )`
    )
    .all(matchId, selection) as Array<{ book: string; decimal_odds: number; captured_at: string }>;
  return rows.map((r) => ({
    book: r.book as TennisBook,
    decimalOdds: r.decimal_odds,
    capturedAt: r.captured_at
  }));
}

export function getOpeningOdds(
  db: Database,
  matchId: string,
  selection: string,
  book: TennisBook
): number | null {
  const row = db
    .prepare(
      `SELECT decimal_odds FROM tennis_odds_snapshots
       WHERE match_id=? AND selection=? AND book=?
       ORDER BY captured_at ASC LIMIT 1`
    )
    .get(matchId, selection, book) as { decimal_odds: number } | undefined;
  return row?.decimal_odds ?? null;
}

export function getClosingOdds(
  db: Database,
  matchId: string,
  selection: string,
  book: TennisBook
): number | null {
  const row = db
    .prepare(
      `SELECT decimal_odds FROM tennis_odds_snapshots
       WHERE match_id=? AND selection=? AND book=?
       ORDER BY captured_at DESC LIMIT 1`
    )
    .get(matchId, selection, book) as { decimal_odds: number } | undefined;
  return row?.decimal_odds ?? null;
}

// ----- Picks -----

export function insertPick(db: Database, p: TennisPick): void {
  db.prepare(
    `INSERT INTO tennis_picks
       (pick_id, match_id, selection, model_prob, fair_decimal_odds, book_decimal_odds,
        best_book, edge_pct, kelly_stake_pct, signal_score, verdict, claude_review_json, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    p.pickId,
    p.matchId,
    p.selection,
    p.modelProb,
    p.fairDecimalOdds,
    p.bookDecimalOdds,
    p.bestBook,
    p.edgePct,
    p.kellyStakePct,
    p.signalScore,
    p.verdict,
    p.claudeReviewJson,
    p.generatedAt
  );
}

export function updatePickReview(db: Database, pickId: string, claudeReviewJson: string): void {
  db.prepare(`UPDATE tennis_picks SET claude_review_json=? WHERE pick_id=?`).run(claudeReviewJson, pickId);
}

export function listPicksForDay(
  db: Database,
  tournament: string,
  dateIso: string,
  minVerdict: PickVerdict = 'PLAY'
): TennisPick[] {
  const verdictFilter =
    minVerdict === 'STRONG' ? "verdict IN ('STRONG')" : "verdict IN ('STRONG', 'PLAY')";
  const rows = db
    .prepare(
      `SELECT p.* FROM tennis_picks p
       JOIN tennis_matches m ON m.match_id = p.match_id
       WHERE m.tournament=? AND DATE(m.scheduled_at)=? AND ${verdictFilter}
       ORDER BY p.signal_score DESC, p.generated_at DESC`
    )
    .all(tournament, dateIso) as Array<Record<string, unknown>>;
  return rows.map(rowToPick);
}

export interface TennisPickAuditRow extends TennisPick {
  player1Name: string;
  player2Name: string;
  tournament: string;
  round: string;
  surface: string;
  scheduledAt: string;
}

/**
 * All picks generated today across all tournaments — including SKIP.
 * Deduplicated: when the same (match_id, selection) has been scored multiple
 * times (re-scans across the day), we keep the most recent generated_at row
 * so older buggy picks (e.g. early scans before the Pinnacle fallback) don't
 * pollute the audit view.
 */
export function listAllPicksForDate(
  db: Database,
  dateIso: string
): TennisPickAuditRow[] {
  const rows = db
    .prepare(
      `WITH latest AS (
         SELECT pick_id FROM (
           SELECT pick_id,
                  ROW_NUMBER() OVER (
                    PARTITION BY match_id, selection
                    ORDER BY generated_at DESC
                  ) as rn
           FROM tennis_picks
           WHERE DATE(generated_at) = ?
         ) WHERE rn = 1
       )
       SELECT p.*, m.tournament, m.round, m.surface, m.scheduled_at,
              p1.name as p1_name, p2.name as p2_name
       FROM tennis_picks p
       JOIN latest l ON l.pick_id = p.pick_id
       JOIN tennis_matches m ON m.match_id = p.match_id
       LEFT JOIN tennis_players p1 ON p1.player_id = m.player1_id
       LEFT JOIN tennis_players p2 ON p2.player_id = m.player2_id
       ORDER BY
         CASE p.verdict
           WHEN 'STRONG' THEN 0
           WHEN 'PLAY' THEN 1
           ELSE 2
         END,
         p.edge_pct DESC,
         p.signal_score DESC`
    )
    .all(dateIso) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    ...rowToPick(row),
    player1Name: (row.p1_name as string) ?? '?',
    player2Name: (row.p2_name as string) ?? '?',
    tournament: row.tournament as string,
    round: row.round as string,
    surface: row.surface as string,
    scheduledAt: row.scheduled_at as string
  }));
}

/**
 * Delete picks older than `keepDays` to prevent the audit view from showing
 * stale generations. Called manually from CLI or IPC; not auto-pruned.
 */
export function prunePicksOlderThan(db: Database, keepDays: number): number {
  const cutoff = new Date(Date.now() - keepDays * 86400_000).toISOString();
  const result = db
    .prepare(`DELETE FROM tennis_picks WHERE generated_at < ?`)
    .run(cutoff);
  return result.changes;
}

export function getPick(db: Database, pickId: string): TennisPick | null {
  const row = db.prepare(`SELECT * FROM tennis_picks WHERE pick_id=?`).get(pickId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return rowToPick(row);
}

function rowToPick(row: Record<string, unknown>): TennisPick {
  return {
    pickId: row.pick_id as string,
    matchId: row.match_id as string,
    selection: row.selection as string,
    modelProb: row.model_prob as number,
    fairDecimalOdds: row.fair_decimal_odds as number,
    bookDecimalOdds: row.book_decimal_odds as number,
    bestBook: row.best_book as TennisBook,
    edgePct: row.edge_pct as number,
    kellyStakePct: row.kelly_stake_pct as number,
    signalScore: row.signal_score as number,
    verdict: row.verdict as PickVerdict,
    claudeReviewJson: (row.claude_review_json as string) ?? null,
    generatedAt: row.generated_at as string
  };
}

// ----- Bets -----

export function insertBet(db: Database, b: TennisBet): void {
  db.prepare(
    `INSERT INTO tennis_bets
       (bet_id, pick_id, match_id, selection, book, decimal_odds, stake_eur,
        placed_at, result, pnl_eur, closing_odds, post_match_review_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    b.betId,
    b.pickId,
    b.matchId,
    b.selection,
    b.book,
    b.decimalOdds,
    b.stakeEur,
    b.placedAt,
    b.result,
    b.pnlEur,
    b.closingOdds,
    b.postMatchReviewJson
  );
}

export function setPostMatchReview(db: Database, betId: string, reviewJson: string): void {
  db.prepare(`UPDATE tennis_bets SET post_match_review_json=? WHERE bet_id=?`).run(reviewJson, betId);
}

export function deleteBet(db: Database, betId: string): { deleted: boolean } {
  const res = db.prepare(`DELETE FROM tennis_bets WHERE bet_id=?`).run(betId);
  return { deleted: res.changes > 0 };
}

export function getBet(db: Database, betId: string): TennisBet | null {
  const row = db.prepare(`SELECT * FROM tennis_bets WHERE bet_id=?`).get(betId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToBet(row) : null;
}

export function settleBet(
  db: Database,
  betId: string,
  result: BetResult,
  pnlEur: number,
  closingOdds: number | null
): void {
  db.prepare(
    `UPDATE tennis_bets SET result=?, pnl_eur=?, closing_odds=COALESCE(?, closing_odds)
     WHERE bet_id=?`
  ).run(result, pnlEur, closingOdds, betId);
}

export function listBetsForMatch(db: Database, matchId: string): TennisBet[] {
  const rows = db.prepare(`SELECT * FROM tennis_bets WHERE match_id=?`).all(matchId) as Array<
    Record<string, unknown>
  >;
  return rows.map(rowToBet);
}

export function listAllBets(db: Database): TennisBet[] {
  const rows = db
    .prepare(`SELECT * FROM tennis_bets ORDER BY placed_at DESC`)
    .all() as Array<Record<string, unknown>>;
  return rows.map(rowToBet);
}

function rowToBet(row: Record<string, unknown>): TennisBet {
  return {
    betId: row.bet_id as string,
    pickId: (row.pick_id as string) ?? null,
    matchId: row.match_id as string,
    selection: row.selection as string,
    book: row.book as TennisBook,
    decimalOdds: row.decimal_odds as number,
    stakeEur: row.stake_eur as number,
    placedAt: row.placed_at as string,
    result: (row.result as BetResult) ?? null,
    pnlEur: (row.pnl_eur as number) ?? null,
    closingOdds: (row.closing_odds as number) ?? null,
    postMatchReviewJson: (row.post_match_review_json as string) ?? null
  };
}

// ----- Signal log -----

export function appendSignal(db: Database, s: SignalRecord): void {
  db.prepare(
    `INSERT INTO tennis_signal_log (match_id, source, signal_kind, payload_json, captured_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(s.matchId, s.source, s.signalKind, s.payloadJson, s.capturedAt);
}

export function recentSignals(db: Database, matchId: string, limit = 50): SignalRecord[] {
  const rows = db
    .prepare(
      `SELECT match_id, source, signal_kind, payload_json, captured_at
       FROM tennis_signal_log WHERE match_id=? ORDER BY captured_at DESC LIMIT ?`
    )
    .all(matchId, limit) as Array<{
    match_id: string;
    source: string;
    signal_kind: string;
    payload_json: string;
    captured_at: string;
  }>;
  return rows.map((r) => ({
    matchId: r.match_id,
    source: r.source as SignalRecord['source'],
    signalKind: r.signal_kind,
    payloadJson: r.payload_json,
    capturedAt: r.captured_at
  }));
}

// ----- Ingest errors -----

export function logIngestError(
  db: Database,
  source: string,
  matchId: string | null,
  errorMessage: string,
  rawContext: string | null
): void {
  db.prepare(
    `INSERT INTO tennis_ingest_errors (source, match_id, error_message, raw_context, occurred_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(source, matchId, errorMessage, rawContext, new Date().toISOString());
}

// ----- Bankroll -----

export function getTennisBankrollSummary(db: Database, tournament?: string): TennisBankrollSummary {
  const tournamentFilter = tournament ? `AND m.tournament=?` : '';
  const args = tournament ? [tournament] : [];

  const totalsAll = db
    .prepare(
      `SELECT
        COUNT(*) as bets,
        COALESCE(SUM(b.stake_eur), 0) as staked,
        COALESCE(SUM(CASE WHEN b.result='won' THEN b.stake_eur + b.pnl_eur ELSE 0 END), 0) as won,
        COALESCE(SUM(CASE WHEN b.result IS NOT NULL THEN b.pnl_eur ELSE 0 END), 0) as net,
        COALESCE(SUM(CASE WHEN b.result='won' THEN 1 ELSE 0 END), 0) as bets_won,
        COALESCE(SUM(CASE WHEN b.result='lost' THEN 1 ELSE 0 END), 0) as bets_lost,
        COALESCE(SUM(CASE WHEN b.result='void' THEN 1 ELSE 0 END), 0) as bets_void,
        COALESCE(SUM(CASE WHEN b.result IS NULL THEN 1 ELSE 0 END), 0) as bets_pending
      FROM tennis_bets b
      JOIN tennis_matches m ON m.match_id=b.match_id
      WHERE 1=1 ${tournamentFilter}`
    )
    .get(...args) as {
    bets: number;
    staked: number;
    won: number;
    net: number;
    bets_won: number;
    bets_lost: number;
    bets_void: number;
    bets_pending: number;
  };

  const currentRow = tournament
    ? totalsAll
    : (db
        .prepare(
          `SELECT COALESCE(SUM(b.pnl_eur), 0) as net
           FROM tennis_bets b
           JOIN tennis_matches m ON m.match_id=b.match_id
           WHERE b.result IS NOT NULL
             AND m.tournament=(SELECT m2.tournament FROM tennis_matches m2 ORDER BY m2.scheduled_at DESC LIMIT 1)`
        )
        .get() as { bets?: number; net: number } & Partial<typeof totalsAll>);

  const allTimeNet = totalsAll.net;
  const totalStaked = totalsAll.staked;
  const totalWon = totalsAll.won;

  const decidedBets = totalsAll.bets_won + totalsAll.bets_lost;
  const winRate = decidedBets > 0 ? totalsAll.bets_won / decidedBets : 0;
  const roi = totalStaked > 0 ? (allTimeNet / totalStaked) * 100 : 0;

  const clvRow = db
    .prepare(
      `SELECT AVG(
         CASE WHEN closing_odds IS NOT NULL AND closing_odds > 1
              THEN ((decimal_odds - closing_odds) / closing_odds) * 100
              ELSE NULL END
       ) as avg_clv
       FROM tennis_bets WHERE result IS NOT NULL`
    )
    .get() as { avg_clv: number | null };

  return {
    allTimeNet,
    currentTournamentNet: currentRow.net ?? 0,
    totalStaked,
    totalWon,
    betsPlaced: totalsAll.bets,
    betsWon: totalsAll.bets_won,
    betsLost: totalsAll.bets_lost,
    betsVoid: totalsAll.bets_void,
    betsPending: totalsAll.bets_pending,
    winRate,
    roi,
    avgClvPct: clvRow.avg_clv ?? 0
  };
}

export function getTennisBankrollChart(db: Database): TennisBankrollPoint[] {
  const rows = db
    .prepare(
      `SELECT DATE(placed_at) as date, COALESCE(SUM(pnl_eur), 0) as day_net
       FROM tennis_bets WHERE result IS NOT NULL
       GROUP BY date ORDER BY date ASC`
    )
    .all() as Array<{ date: string; day_net: number }>;

  let cumulative = 0;
  return rows.map((r) => {
    cumulative += r.day_net;
    return { date: r.date, dayNet: r.day_net, cumulativeNet: cumulative };
  });
}
