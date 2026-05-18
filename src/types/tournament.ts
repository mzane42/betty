export type TournamentMode = 'sng' | 'tt' | 'play';

export interface ParsedTournamentSummary {
  tournamentId: string;
  tournamentName: string;
  playerName: string;
  buyIn: number;
  rake: number;
  registeredPlayers: number | null;
  mode: TournamentMode | string;
  type: string;
  speed: string;
  prizepool: number | null;
  startTime: string;
  duration: string | null;
  finishPosition: number;
  winnings: number | null;
}
