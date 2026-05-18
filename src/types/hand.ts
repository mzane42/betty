export type Position =
  | 'BTN'
  | 'SB'
  | 'BB'
  | 'UTG'
  | 'UTG1'
  | 'MP'
  | 'MP1'
  | 'HJ'
  | 'CO';

export type Street = 'PRE-FLOP' | 'FLOP' | 'TURN' | 'RIVER';

export type ActionType =
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'posts_sb'
  | 'posts_bb'
  | 'posts_ante';

export type GameType = 'tournament' | 'cashgame';

export interface Blinds {
  ante: number;
  smallBlind: number;
  bigBlind: number;
}

export interface SeatPlayer {
  seat: number;
  name: string;
  stack: number;
  position: Position;
}

export interface Action {
  player: string;
  type: ActionType;
  amount: number;
  isAllIn: boolean;
  toTotal?: number;
}

export interface StreetData {
  name: Street;
  cards: string[];
  actions: Action[];
}

export interface ShowdownEntry {
  player: string;
  cards: [string, string];
  handDescription: string;
}

export interface Winner {
  player: string;
  amount: number;
  pot: 'main' | `side ${number}`;
}

export interface HandSummaryLine {
  seat: number;
  player: string;
  positionLabel: string | null;
  showed: boolean;
  cards: [string, string] | null;
  result: string;
  amount: number;
}

export interface ParsedHand {
  handId: string;
  tournamentId: string | null;
  tournamentName: string;
  gameType: GameType;
  buyIn: number;
  rake: number;
  level: number | null;
  blinds: Blinds;
  date: string;
  tableName: string;
  tableSize: number;
  buttonSeat: number;
  players: SeatPlayer[];
  heroName: string;
  heroCards: [string, string] | null;
  streets: StreetData[];
  showdown: ShowdownEntry[] | null;
  board: string[];
  pot: { total: number; rake: number };
  winners: Winner[];
  summary: HandSummaryLine[];
}
