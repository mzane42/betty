import type {
  BankrollSummary,
  YearlyBankroll,
  MonthlyBankroll,
  RoiByFormat,
  RoiByStake,
  BankrollPoint
} from '../types/bankroll.js';
import type { PlayerDerivedStats } from '../types/player.js';

interface Leak {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  cost: number;
  costUnit: 'eur' | 'chips' | 'bb';
  recommendation: string;
}

interface GameRecommendation {
  format: string;
  stake: string;
  tournamentsPlayed: number;
  roi: number;
  netResult: number;
  confidence: 'high' | 'medium' | 'low';
  recommendation: 'play more' | 'keep playing' | 'avoid' | 'investigate';
}

interface ProgressPoint {
  period: string;
  tournamentsPlayed: number;
  net: number;
  roi: number;
  itm: number;
}

export interface SessionHand {
  hand_id: string;
  hand_number: number;
  tournament_id: string;
  tournament_name: string;
  hero_position: string | null;
  hero_cards: string | null;
  hero_cards_parsed: string[] | null;
  big_blind: number;
  board: string | null;
  board_parsed: string[];
  hero_invested: number;
  hero_won: number;
  hero_net: number;
  total_pot: number;
  played_at: string;
  hero_equity_preflop?: number | null;
  hero_equity_flop?: number | null;
  hero_equity_turn?: number | null;
  hero_equity_river?: number | null;
}

export interface SessionDetailResult {
  sessionDate: string;
  tournaments: TournamentRow[];
  hands: SessionHand[];
  totals: {
    tournamentsPlayed: number;
    buyIns: number;
    winnings: number;
    net: number;
    handsPlayed: number;
  };
  highlights: { topWins: SessionHand[]; topLosses: SessionHand[] };
}

export interface SessionReviewResult {
  sessionVerdict: 'winning' | 'even' | 'losing';
  summary: string;
  patterns: { pattern: string; impact: 'negative' | 'positive'; advice: string }[];
  biggestMistake: { handId: string; description: string } | null;
  biggestWin: { handId: string; description: string } | null;
  lessons: string[];
  nextSessionFocus: string;
  rawResponse: string;
}

export interface HandReviewResult {
  verdict: 'good' | 'okay' | 'mistake' | 'blunder';
  overall: string;
  keyMoments: { street: string; issue: string; suggestion: string }[];
  alternativeLine: string;
  lessons: string[];
  rawResponse: string;
}

export interface TournamentReviewResult {
  tournamentVerdict: 'won' | 'deep' | 'early-bust';
  summary: string;
  phaseAnalysis: {
    phase: 'early' | 'mid' | 'late' | 'heads-up';
    stack_range: string;
    play_quality: 'good' | 'okay' | 'leaky';
    comment: string;
  }[];
  pivotHand: { hand_number: string; description: string } | null;
  keyDecisions: {
    hand_number: string;
    decision: string;
    verdict: 'good' | 'okay' | 'mistake' | 'blunder';
    lesson: string;
  }[];
  lessons: string[];
  rawResponse: string;
}

interface PokerApi {
  // Terminal (PTY) — exposed via preload for in-app Claude Code sidebar
  createTerminal(opts?: { cwd?: string; cmd?: string }): Promise<{ id: string }>;
  writeTerminal(id: string, data: string): Promise<void>;
  resizeTerminal(id: string, cols: number, rows: number): Promise<void>;
  closeTerminal(id: string): Promise<void>;
  onTerminalData(id: string, listener: (data: string) => void): () => void;
  onTerminalExit(id: string, listener: (code: number) => void): () => void;

  getBankrollSummary(): Promise<BankrollSummary>;
  getYearlyBankroll(): Promise<YearlyBankroll[]>;
  getMonthlyBankroll(): Promise<MonthlyBankroll[]>;
  getRoiByFormat(): Promise<RoiByFormat[]>;
  getRoiByStake(): Promise<RoiByStake[]>;
  getBankrollChart(): Promise<BankrollPoint[]>;
  getSessions(limit?: number, offset?: number): Promise<SessionRow[]>;
  getSessionDetail(sessionDate: string): Promise<SessionDetailResult>;
  getPlayers(limit?: number, offset?: number, sortBy?: string): Promise<PlayerDerivedStats[]>;
  getPlayerDetail(playerName: string): Promise<PlayerDerivedStats | null>;
  getHand(handId: string): Promise<HandDetailResult | null>;
  importNewSession(): Promise<ImportResult>;
  importAll(force?: boolean): Promise<ImportResult>;
  reviewHand(handId: string): Promise<HandReviewResult>;
  reviewSession(sessionId: string): Promise<SessionReviewResult>;
  reviewTournament(tournamentId: string): Promise<TournamentReviewResult>;
  getCachedHandReview(handId: string): Promise<HandReviewResult | null>;
  getCachedSessionReview(sessionDate: string): Promise<SessionReviewResult | null>;
  getCachedTournamentReview(tournamentId: string): Promise<TournamentReviewResult | null>;
  getHandReviewsForSession(sessionDate: string): Promise<Record<string, { verdict: string; overall: string }>>;
  backfillEquity(limit?: number): Promise<{ processed: number; updated: number }>;
  getEquityStats(): Promise<{ total: number; computed: number }>;
  openCoachTerminal(clean?: boolean): Promise<{ spawned: boolean }>;
  getAutoReviewPending(): Promise<{ sessions: string[]; tournaments: { tournament_id: string; session_date: string }[] }>;
  getEvBankroll(): Promise<{
    date: string;
    actual_net: number;
    ev_net: number;
    cumulative_actual: number;
    cumulative_ev: number;
  }[]>;
  getPlayerNote(name: string): Promise<{ note: string; tags: string[] }>;
  savePlayerNote(name: string, note: string, tags: string[]): Promise<{ ok: boolean }>;
  listPlayerNotes(): Promise<Record<string, { note: string; tags: string[] }>>;
  searchHands(filters: {
    position?: string;
    minPot?: number;
    minInvested?: number;
    netSign?: 'positive' | 'negative' | 'any';
    minEquity?: number;
    maxEquity?: number;
    cardPattern?: string;
    boardPattern?: string;
    aiVerdict?: 'good' | 'okay' | 'mistake' | 'blunder';
    minBb?: number;
    maxBb?: number;
    limit?: number;
  }): Promise<Array<{
    hand_id: string;
    hero_position: string | null;
    hero_cards: string | null;
    big_blind: number;
    board: string | null;
    hero_invested: number;
    hero_won: number;
    total_pot: number;
    hero_net: number;
    played_at: string;
    hero_equity_river: number | null;
    session_date: string;
    tournament_id: string;
    ai_verdict: string | null;
  }>>;
  exportSessionMd(sessionDate: string): Promise<{ saved: boolean; path?: string; markdown: string }>;
  backupDb(): Promise<{ saved: boolean; path?: string; error?: string }>;
  listAccounts(): Promise<string[]>;
  getActiveAccount(): Promise<string>;
  setActiveAccount(account: string): Promise<string>;
  getSettings(): Promise<{ activeAccount: string; goalAnnualNet?: number; stopLossDaily?: number }>;
  updateSettings(partial: Record<string, unknown>): Promise<{ activeAccount: string; goalAnnualNet?: number; stopLossDaily?: number }>;
  getSessionAnnotation(date: string): Promise<{ annotation: string; mood: string }>;
  saveSessionAnnotation(date: string, annotation: string, mood: string): Promise<{ ok: boolean }>;
  getDashboardTrackers(): Promise<{
    streak: { length: number; type: 'winning' | 'losing' | 'neutral'; latestDate: string | null };
    todayNet: number;
    ytdNet: number;
    goalAnnualNet: number | null;
    goalPct: number;
    stopLossDaily: number | null;
    stopLossHit: boolean;
  }>;
  compareSessions(a: string, b: string): Promise<{
    a: { date: string; tournaments: number; winnings: number; buy_ins: number; net: number; hands: number; avg_pot: number; win_rate: number };
    b: { date: string; tournaments: number; winnings: number; buy_ins: number; net: number; hands: number; avg_pot: number; win_rate: number };
  }>;
  runVarianceSim(opts?: { tournaments?: number; iterations?: number }): Promise<{
    runs: number[][];
    meta: { historicalRoi: number; perTournamentMean?: number; perTournamentStd?: number; n: number };
    message?: string;
  }>;
  getPlayerDeep(name: string): Promise<{
    stats: Record<string, unknown> | undefined;
    hands: Array<Record<string, unknown>>;
    note: string;
    tags: string[];
  }>;
  getTimeOfDay(): Promise<{
    buckets: { bucket: 'morning' | 'afternoon' | 'evening' | 'night'; tournaments: number; net: number; roi: number }[];
    tilt: { firstAvgRoi: number; lastAvgRoi: number; delta: number; multiSessionCount: number };
  }>;
  scanNash(): Promise<{
    tags: Array<{
      hand_id: string;
      hand_code: string;
      position: string;
      stack_bb: number;
      action: 'shove' | 'call' | 'fold';
      nash_verdict: 'in' | 'marginal' | 'out';
      off_nash: boolean;
      cost_bb: number;
    }>;
    stats: { total: number; inRange: number; marginal: number; outOfRange: number; totalCostBb: number };
  }>;
  getLeaks(): Promise<Leak[]>;
  getGameRecommendations(): Promise<GameRecommendation[]>;
  getProgress(granularity?: 'quarter' | 'month'): Promise<ProgressPoint[]>;

  // ----- Tennis (Roland Garros 2026 sub-project) -----
  tennisListPicksToday(tournament: string, dateIso?: string): Promise<TennisPickRow[]>;
  tennisListPicksForDay(
    tournament: string,
    dateIso: string,
    minVerdict?: 'STRONG' | 'PLAY'
  ): Promise<TennisPickRow[]>;
  tennisGetPick(pickId: string): Promise<TennisPickRow | null>;
  tennisAuditDay(dateIso?: string): Promise<TennisPickAuditRowDto[]>;
  tennisPrunePicks(keepDays: number): Promise<number>;
  tennisListUpcomingMatches(tournament: string): Promise<TennisMatchRow[]>;
  tennisListMatchesByDate(tournament: string, dateIso: string): Promise<TennisMatchRow[]>;
  tennisSetMatchStatus(
    matchId: string,
    status: 'scheduled' | 'live' | 'finished' | 'withdrawn' | 'delayed',
    winnerId: string | null,
    score: string | null
  ): Promise<{ ok: true }>;
  tennisGeneratePick(input: TennisGeneratePickInput): Promise<TennisGeneratePickResult>;
  tennisPreviewVerdict(params: {
    modelProb: number;
    bookDecimalOdds: number;
    signals?: {
      pinnacleProb?: number | null;
      betfairVolume?: number | null;
      tipsterAlignedCount?: number;
      lineMovementPct?: number | null;
    };
  }): Promise<{
    score: number;
    verdict: 'STRONG' | 'PLAY' | 'SKIP';
    edge: number;
    kellyStakePct: number;
    fairDecimalOdds: number;
  }>;
  tennisPlaceBet(input: {
    pickId: string | null;
    matchId: string;
    selection: string;
    book: 'winamax' | 'betclic' | 'unibet';
    decimalOdds: number;
    stakeEur: number;
  }): Promise<TennisBetRow>;
  tennisSettleBet(
    betId: string,
    result: 'won' | 'lost' | 'void',
    pnlEur: number,
    closingOdds: number | null
  ): Promise<{ ok: true }>;
  tennisListBets(): Promise<TennisBetRow[]>;
  tennisDeleteBet(betId: string): Promise<{ deleted: boolean }>;
  tennisUnibetUrl(matchId: string): Promise<{ fallback: string; matchLabel: string }>;
  tennisPlayerForm(playerName: string): Promise<TennisPlayerFormRow>;
  tennisGetBetReview(betId: string): Promise<string | null>;
  onTennisReviewReady(listener: (betId: string) => void): () => void;
  onTennisReviewFailed(listener: (betId: string, message: string) => void): () => void;
  tennisBankrollSummary(tournament?: string): Promise<TennisBankrollSummaryRow>;
  tennisBankrollChart(): Promise<TennisBankrollPointRow[]>;
  tennisPostMatchReview(ctx: unknown): Promise<TennisPostMatchReviewRow>;
  tennisRiskStatus(): Promise<TennisRiskGateStatus>;
  tennisRiskConfig(): Promise<TennisRiskConfigRow>;
  tennisRiskSaveConfig(partial: Partial<TennisRiskConfigRow>): Promise<TennisRiskConfigRow>;
  tennisRiskPause(hours: number): Promise<TennisRiskConfigRow>;
  tennisRiskResume(): Promise<TennisRiskConfigRow>;
  tennisCuratorToday(dateIso?: string): Promise<TennisCuratorOutput | null>;
  tennisCuratorRunNow(): Promise<TennisCuratorOutput>;
  tennisDaemonAutoScoreNow(opts?: { enableReddit?: boolean }): Promise<{
    score: TennisAutoScoreResult;
    curated: TennisCuratorOutput;
  }>;
  onTennisScanProgress(listener: (line: string) => void): () => void;
}

export interface TennisCuratorSelectedPick {
  pick_id: string;
  rank: number;
  confidence: 'high' | 'medium';
  tldr: string;
  why: string;
}

export interface TennisCuratorSkippedPick {
  pick_id: string;
  reason: string;
}

export interface TennisCuratorOutput {
  selected_picks: TennisCuratorSelectedPick[];
  skipped_picks: TennisCuratorSkippedPick[];
  daily_message: string;
  generated_at: string;
}

export interface TennisAutoScoreResult {
  eventsConsidered: number;
  picksGenerated: number;
  strongPicks: number;
  playPicks: number;
  skippedPicks: number;
  errors: Array<{ matchId: string; message: string }>;
  logs: string[];
}

export interface TennisRiskConfigRow {
  bankrollEur: number;
  dailyStopLossPct: number;
  tournamentTakeProfitPct: number;
  drawdownCircuitBreakerPct: number;
  circuitBreakerPauseHours: number;
  pausedUntilIso: string | null;
  activeTournament: string;
}

export interface TennisRiskGateStatus {
  reason: 'ok' | 'manual-pause' | 'daily-stop-loss' | 'drawdown-circuit-breaker';
  blocked: boolean;
  stakeMultiplier: number;
  message: string;
  config: TennisRiskConfigRow;
}

export interface TennisPickRow {
  pickId: string;
  matchId: string;
  selection: string;
  modelProb: number;
  fairDecimalOdds: number;
  bookDecimalOdds: number;
  bestBook: 'winamax' | 'betclic' | 'unibet';
  edgePct: number;
  kellyStakePct: number;
  signalScore: number;
  verdict: 'STRONG' | 'PLAY' | 'SKIP';
  claudeReviewJson: string | null;
  generatedAt: string;
  pinnacleProb: number | null;
}

export interface TennisPickAuditRowDto extends TennisPickRow {
  player1Name: string;
  player2Name: string;
  tournament: string;
  round: string;
  surface: string;
  scheduledAt: string;
  matchStatus: string;
  winnerId: string | null;
  matchScore: string | null;
}

export interface TennisMatchRow {
  matchId: string;
  tournament: string;
  surface: 'clay' | 'hard' | 'grass' | 'carpet';
  round: string;
  player1Id: string;
  player2Id: string;
  scheduledAt: string;
  status: 'scheduled' | 'live' | 'finished' | 'withdrawn' | 'delayed';
  winnerId: string | null;
  score: string | null;
}

export interface TennisPlayerFormRow {
  playerName: string;
  matchesPlayed: number;
  last5: Array<{
    date: string;
    surface: string;
    result: 'W' | 'L';
    opponentName: string;
    round: string;
  }>;
  clayWinPct: number;
  clayMatches: number;
  daysSinceLast: number | null;
  lastMatchDate: string | null;
}

export interface TennisBetRow {
  betId: string;
  pickId: string | null;
  matchId: string;
  selection: string;
  book: 'winamax' | 'betclic' | 'unibet';
  decimalOdds: number;
  stakeEur: number;
  placedAt: string;
  result: 'won' | 'lost' | 'void' | null;
  pnlEur: number | null;
  closingOdds: number | null;
  postMatchReviewJson: string | null;
}

export interface TennisGeneratePickInput {
  match: {
    tournament: string;
    surface: 'clay' | 'hard' | 'grass' | 'carpet';
    round: string;
    scheduledAt: string;
    player1: { id: string; name: string; country?: string; rank?: number };
    player2: { id: string; name: string; country?: string; rank?: number };
  };
  selection: string;
  oddsByBook: Partial<Record<'winamax' | 'betclic' | 'unibet' | 'pinnacle' | 'betfair', number>>;
  signals?: {
    pinnacleProb?: number | null;
    betfairVolume?: number | null;
    tipsterAlignedCount?: number;
    lineMovementPct?: number | null;
  };
  context?: {
    h2h?: string | null;
    last5ClayP1?: string[];
    last5ClayP2?: string[];
    daysSinceLastMatchP1?: number | null;
    daysSinceLastMatchP2?: number | null;
  };
  skipClaudeReview?: boolean;
}

export interface TennisGeneratePickResult {
  pick: TennisPickRow;
  worthPlacing: boolean;
  modelSource: 'clay-elo' | 'rank-fallback' | 'priors-only';
  riskGate: TennisRiskGateStatus;
  blockedByRiskGate: boolean;
}

export interface TennisBankrollSummaryRow {
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
  avgClvPct: number;
}

export interface TennisBankrollPointRow {
  date: string;
  cumulativeNet: number;
  dayNet: number;
}

export interface TennisPostMatchReviewRow {
  decisionQuality: 'good' | 'okay' | 'mistake';
  resultSummary: string;
  evAssessment: string;
  whatWorked: string[];
  whatFailed: string[];
  lessons: string[];
  rawResponse: string;
}

export type { Leak, GameRecommendation, ProgressPoint };

export interface SessionRow {
  session_date: string;
  tournaments_played: number;
  winnings: number;
  buy_ins: number;
  net: number;
}

export interface TournamentRow {
  tournament_id: string;
  name: string;
  buy_in: number;
  rake: number;
  hero_finish_position: number;
  hero_winnings: number | null;
  start_time: string;
  duration: string | null;
}

export interface HandDetailResult {
  hand: Record<string, unknown>;
  players: Record<string, unknown>[];
  actions: Record<string, unknown>[];
}

export interface ImportResult {
  filesProcessed: number;
  handsImported: number;
  tournamentsImported: number;
  errors: { file: string; message: string }[];
}

declare global {
  interface Window {
    pokerApi: PokerApi;
  }
}

export const pokerApi: PokerApi = (() => {
  if (typeof window !== 'undefined' && window.pokerApi) return window.pokerApi;
  // Fallback stub for dev/test
  const stub = new Proxy({} as PokerApi, {
    get: () => () => Promise.reject(new Error('pokerApi not available'))
  });
  return stub;
})();
