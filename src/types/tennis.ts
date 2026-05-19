/**
 * Tennis domain types — Roland Garros 2026 MVP.
 * Mirrors poker types pattern. All money fields in EUR. All odds decimal format.
 */

export type TennisSurface = 'clay' | 'hard' | 'grass' | 'carpet';

export type TennisMatchStatus = 'scheduled' | 'live' | 'finished' | 'withdrawn' | 'delayed';

export type TennisBook = 'winamax' | 'betclic' | 'unibet' | 'pinnacle' | 'betfair';

/**
 * Books where the user actually places bets (not reference-only).
 *
 * Currently Unibet-only: Winamax and Betclic are not redistributed through The
 * Odds API, so they can't be auto-detected. Unibet is the only FR ANJ-licensed
 * book in the API and the one mzane42 is registered with for tennis.
 *
 * Adding Winamax/Betclic later = uncomment + extend BOOK_KEY_MAP in
 * src/tennis/ingest/odds-api.ts (and the user would need to manually shop
 * those prices since the API doesn't carry them).
 */
export const PLACEABLE_BOOKS: ReadonlyArray<TennisBook> = ['unibet'];

export type TennisMarket = 'match_winner';

export type PickVerdict = 'STRONG' | 'PLAY' | 'SKIP';

export type BetResult = 'won' | 'lost' | 'void';

export interface TennisPlayer {
  playerId: string;
  name: string;
  country: string | null;
  hand: 'L' | 'R' | null;
  heightCm: number | null;
  birthDate: string | null;
  rank: number | null;
  rankPoints: number | null;
  rankTour: string | null;
  rankUpdatedAt: string | null;
  updatedAt: string;
}

export interface TennisMatch {
  matchId: string;
  tournament: string;
  surface: TennisSurface;
  round: string;
  player1Id: string;
  player2Id: string;
  scheduledAt: string;
  status: TennisMatchStatus;
  winnerId: string | null;
  score: string | null;
}

export interface OddsSnapshot {
  matchId: string;
  book: TennisBook;
  market: TennisMarket;
  selection: string;
  decimalOdds: number;
  capturedAt: string;
}

export interface TennisPick {
  pickId: string;
  matchId: string;
  selection: string;
  modelProb: number;
  fairDecimalOdds: number;
  bookDecimalOdds: number;
  bestBook: TennisBook;
  edgePct: number;
  kellyStakePct: number;
  signalScore: number;
  verdict: PickVerdict;
  claudeReviewJson: string | null;
  generatedAt: string;
  pinnacleProb: number | null;
}

export interface TennisBet {
  betId: string;
  pickId: string | null;
  matchId: string;
  selection: string;
  book: TennisBook;
  decimalOdds: number;
  stakeEur: number;
  placedAt: string;
  result: BetResult | null;
  pnlEur: number | null;
  closingOdds: number | null;
  postMatchReviewJson: string | null;
}

/** Signals fed into the cross-info scorer. */
export type SignalSource =
  | 'model'
  | 'pinnacle_novig'
  | 'betfair_volume'
  | 'tipster_consensus'
  | 'line_movement';

export interface SignalRecord {
  matchId: string;
  source: SignalSource;
  /** What the signal points to (player_id) or "neutral". */
  signalKind: string;
  /** JSON-stringified payload (varies per source). */
  payloadJson: string;
  capturedAt: string;
}

export interface CrossInfoInput {
  /** Model probability of `selection` winning. */
  modelProb: number;
  /** Pinnacle no-vig fair probability of `selection`. */
  pinnacleProb: number | null;
  /** Betfair Exchange directional volume: positive = backing `selection`, negative = laying. */
  betfairVolume: number | null;
  /** Aligned tipster count (only ≥3 contributes). */
  tipsterAlignedCount: number;
  /** Recent line drift in % (positive = book shortened on `selection`, our pick). */
  lineMovementPct: number | null;
}

export interface CrossInfoResult {
  score: number;
  verdict: PickVerdict;
  weightContributions: Record<SignalSource, number>;
  rationale: string[];
}

export interface ClaudeTennisReview {
  pickVerdict: PickVerdict;
  summary: string;
  /** FR coach lines: short, cite stats. */
  rationale: string[];
  /** Concerns / risk factors. */
  cautions: string[];
  /** Vocabulary footer if first encounter in thread. */
  glossary?: { term: string; def: string }[];
  rawResponse: string;
}

export interface TennisBankrollPoint {
  date: string;
  /** Cumulative tennis P&L in EUR. */
  cumulativeNet: number;
  /** P&L delta on this date. */
  dayNet: number;
}

export interface TennisBankrollSummary {
  allTimeNet: number;
  currentTournamentNet: number;
  totalStaked: number;
  totalWon: number;
  betsPlaced: number;
  betsWon: number;
  betsLost: number;
  betsVoid: number;
  betsPending: number;
  winRate: number;
  roi: number;
  /** Closing Line Value: average % beat vs market close. */
  avgClvPct: number;
}
