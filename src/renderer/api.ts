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
