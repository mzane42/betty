export type PlayerTendency =
  | 'tight-passive'
  | 'tight-aggressive'
  | 'loose-passive'
  | 'loose-aggressive'
  | 'maniac'
  | 'nit'
  | 'unknown';

export interface PlayerStatsRaw {
  playerName: string;
  heroAccount: string;
  handsPlayed: number;
  vpipOpportunities: number;
  vpipActions: number;
  pfrOpportunities: number;
  pfrActions: number;
  threeBetOpportunities: number;
  threeBetActions: number;
  foldTo3betOpportunities: number;
  foldTo3betActions: number;
  cbetOpportunities: number;
  cbetActions: number;
  foldToCbetOpportunities: number;
  foldToCbetActions: number;
  totalBets: number;
  totalRaises: number;
  totalCalls: number;
  wentToShowdown: number;
  wonAtShowdown: number;
  totalWon: number;
  totalInvested: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface PlayerDerivedStats {
  playerName: string;
  handsPlayed: number;
  vpip: number | null;
  pfr: number | null;
  threeBet: number | null;
  foldTo3bet: number | null;
  cbet: number | null;
  foldToCbet: number | null;
  aggressionFactor: number | null;
  wtsd: number | null;
  wsd: number | null;
  netResult: number;
  tendency: PlayerTendency;
}
