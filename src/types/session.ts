export interface Session {
  id: string;
  heroAccount: string;
  startedAt: string;
  endedAt: string | null;
  tournamentsPlayed: number;
  handsPlayed: number;
  totalBuyIns: number;
  totalWinnings: number;
  netResult: number;
}
