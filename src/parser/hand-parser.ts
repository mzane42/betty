import type {
  Action,
  Blinds,
  GameType,
  HandSummaryLine,
  ParsedHand,
  SeatPlayer,
  ShowdownEntry,
  StreetData,
  Winner
} from '../types/hand.js';
import { computePositions } from './position-calculator.js';

/**
 * Parse a Winamax hand history file into an array of parsed hands.
 * Hands are separated by blank lines. Some files may have empty trailing entries.
 */
export function parseHandHistoryFile(content: string, heroName: string): ParsedHand[] {
  const blocks = splitIntoHandBlocks(content);
  const hands: ParsedHand[] = [];
  for (const block of blocks) {
    try {
      const hand = parseHandBlock(block, heroName);
      if (hand) hands.push(hand);
    } catch (err) {
      console.warn(`[hand-parser] failed to parse hand: ${(err as Error).message}`);
    }
  }
  return hands;
}

/**
 * Split file content into individual hand blocks. A hand starts at a line beginning
 * with "Winamax Poker - " and continues until the next such line or EOF.
 */
export function splitIntoHandBlocks(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith('Winamax Poker - ') && current.length > 0) {
      blocks.push(current.join('\n').trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    const trimmed = current.join('\n').trim();
    if (trimmed.length > 0) blocks.push(trimmed);
  }
  return blocks.filter((b) => b.startsWith('Winamax Poker - '));
}

/**
 * Parse a single hand block.
 */
export function parseHandBlock(block: string, heroName: string): ParsedHand | null {
  const lines = block.split('\n').map((l) => l.trimEnd());
  if (lines.length === 0) return null;

  const header = parseHeader(lines[0]!);
  if (!header) return null;

  const tableLine = lines[1];
  if (!tableLine) return null;
  const table = parseTableLine(tableLine);

  // Tournament ID is more reliably extracted from the table name (e.g. "Expresso(244457459)#0")
  // than from the HandId prefix (which is an internal Winamax counter).
  const tournamentIdFromTable = extractTournamentIdFromTableName(table.tableName);
  if (header.gameType === 'tournament' && tournamentIdFromTable) {
    header.tournamentId = tournamentIdFromTable;
  }

  const players: SeatPlayer[] = [];
  let i = 2;
  while (i < lines.length && !lines[i]!.startsWith('***')) {
    const seat = parseSeatLine(lines[i]!);
    if (seat) players.push(seat);
    i++;
  }

  const sections = collectSections(lines.slice(i));

  const ante = sections['ANTE/BLINDS'] ?? [];
  const preflop = sections['PRE-FLOP'] ?? [];
  const flop = sections['FLOP'] ?? [];
  const turn = sections['TURN'] ?? [];
  const river = sections['RIVER'] ?? [];
  const showdown = sections['SHOW DOWN'] ?? [];
  const summary = sections['SUMMARY'] ?? [];

  const heroCards = findHeroCards([...ante, ...preflop], heroName);

  const streets: StreetData[] = [];
  streets.push(buildStreet('PRE-FLOP', [...ante, ...preflop], []));

  const flopCards = extractBoardCards(flop[0]);
  if (flopCards) streets.push(buildStreet('FLOP', flop.slice(1), flopCards));

  const turnCards = extractBoardCards(turn[0]);
  if (turnCards) streets.push(buildStreet('TURN', turn.slice(1), turnCards.slice(-1)));

  const riverCards = extractBoardCards(river[0]);
  if (riverCards) streets.push(buildStreet('RIVER', river.slice(1), riverCards.slice(-1)));

  const showdownEntries = parseShowdown(showdown);

  const summaryData = parseSummarySection(summary);
  const winners = parseWinners([...flop, ...turn, ...river]);

  const board = summaryData.board.length > 0 ? summaryData.board : combinedBoard(flop, turn, river);

  computePositions(players, table.buttonSeat);

  return {
    handId: header.handId,
    tournamentId: header.tournamentId,
    tournamentName: header.tournamentName,
    gameType: header.gameType,
    buyIn: header.buyIn,
    rake: header.rakeBuyIn,
    level: header.level,
    blinds: header.blinds,
    date: header.date,
    tableName: table.tableName,
    tableSize: table.tableSize,
    buttonSeat: table.buttonSeat,
    players,
    heroName,
    heroCards,
    streets,
    showdown: showdownEntries.length > 0 ? showdownEntries : null,
    board,
    pot: { total: summaryData.totalPot, rake: summaryData.rake },
    winners,
    summary: summaryData.summaryLines
  };
}

interface HeaderInfo {
  handId: string;
  tournamentId: string | null;
  tournamentName: string;
  gameType: GameType;
  buyIn: number;
  rakeBuyIn: number;
  level: number | null;
  blinds: Blinds;
  date: string;
}

const TOURNAMENT_HEADER =
  /^Winamax Poker - Tournament "(.+)" buyIn: (\d+(?:\.\d+)?)\s*€?\s*\+\s*(\d+(?:\.\d+)?)\s*€?\s*(?:level: (\d+) )?- HandId: #(\S+) - Holdem no limit \(([^)]+)\) - (.+) UTC$/;

const CASHGAME_HEADER =
  /^Winamax Poker - CashGame - HandId: #(\S+) - Holdem no limit \(([^)]+)\) - (.+) UTC$/;

export function parseHeader(line: string): HeaderInfo | null {
  const t = line.match(TOURNAMENT_HEADER);
  if (t) {
    const [, name, buyIn, rake, levelStr, handId, blindsStr, dateStr] = t;
    const tournamentId = extractTournamentIdFromHandId(handId!);
    return {
      handId: '#' + handId!,
      tournamentId,
      tournamentName: name!,
      gameType: 'tournament',
      buyIn: parseFloat(buyIn!),
      rakeBuyIn: parseFloat(rake!),
      level: levelStr ? parseInt(levelStr, 10) : null,
      blinds: parseBlinds(blindsStr!),
      date: normalizeDate(dateStr!)
    };
  }
  const c = line.match(CASHGAME_HEADER);
  if (c) {
    const [, handId, blindsStr, dateStr] = c;
    return {
      handId: '#' + handId!,
      tournamentId: null,
      tournamentName: 'CashGame',
      gameType: 'cashgame',
      buyIn: 0,
      rakeBuyIn: 0,
      level: null,
      blinds: parseBlinds(blindsStr!),
      date: normalizeDate(dateStr!)
    };
  }
  return null;
}

function extractTournamentIdFromHandId(handId: string): string | null {
  const parts = handId.split('-');
  if (parts.length >= 3 && parts[0] && /^\d+$/.test(parts[0])) {
    return parts[0];
  }
  return null;
}

function extractTournamentIdFromTableName(tableName: string): string | null {
  // Patterns like "Expresso(244457459)#0" or "Hit&Run Ticket 10€(402933535)#005"
  const m = tableName.match(/\((\d+)\)(?:#\d+)?$/);
  return m ? m[1]! : null;
}

export function parseBlinds(s: string): Blinds {
  const parts = s.split('/').map((p) => parseFloat(p.trim()));
  if (parts.length === 2) {
    return { ante: 0, smallBlind: parts[0]!, bigBlind: parts[1]! };
  }
  if (parts.length === 3) {
    return { ante: parts[0]!, smallBlind: parts[1]!, bigBlind: parts[2]! };
  }
  return { ante: 0, smallBlind: 0, bigBlind: 0 };
}

function normalizeDate(s: string): string {
  const match = s.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!match) return s;
  const [, y, m, d, h, mi, sec] = match;
  return `${y}-${m}-${d}T${h}:${mi}:${sec}.000Z`;
}

interface TableInfo {
  tableName: string;
  tableSize: number;
  buttonSeat: number;
}

const TABLE_LINE =
  /^Table: '(.+)' (\d+)-max \((?:real money|play money)\) Seat #(\d+) is the button$/;

export function parseTableLine(line: string): TableInfo {
  const m = line.match(TABLE_LINE);
  if (!m) {
    return { tableName: 'unknown', tableSize: 0, buttonSeat: 0 };
  }
  return {
    tableName: m[1]!,
    tableSize: parseInt(m[2]!, 10),
    buttonSeat: parseInt(m[3]!, 10)
  };
}

const SEAT_LINE = /^Seat (\d+): (.+?) \((\d+(?:\.\d+)?)\)$/;

export function parseSeatLine(line: string): SeatPlayer | null {
  const m = line.match(SEAT_LINE);
  if (!m) return null;
  return {
    seat: parseInt(m[1]!, 10),
    name: m[2]!,
    stack: parseFloat(m[3]!),
    position: 'UTG'
  };
}

function collectSections(lines: string[]): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let currentName: string | null = null;
  let currentLines: string[] = [];
  const SECTION_RE = /^\*\*\* (.+?) \*\*\*\s*(.*)$/;

  for (const line of lines) {
    const m = line.match(SECTION_RE);
    if (m) {
      if (currentName) sections[currentName] = currentLines;
      currentName = m[1]!;
      currentLines = [];
      const rest = m[2];
      if (rest && rest.length > 0) currentLines.push(rest);
    } else if (currentName) {
      currentLines.push(line);
    }
  }
  if (currentName) sections[currentName] = currentLines;
  return sections;
}

function findHeroCards(
  lines: string[],
  heroName: string
): [string, string] | null {
  const re = new RegExp(
    `^Dealt to ${escapeRegex(heroName)} \\[(\\S+) (\\S+)\\]$`
  );
  for (const line of lines) {
    const m = line.match(re);
    if (m) return [m[1]!, m[2]!];
  }
  return null;
}

function buildStreet(name: StreetData['name'], lines: string[], boardCards: string[]): StreetData {
  const actions: Action[] = [];
  for (const line of lines) {
    if (line.startsWith('Dealt to ')) continue;
    if (line.length === 0) continue;
    const action = parseActionLine(line);
    if (action) actions.push(action);
  }
  return { name, cards: boardCards, actions };
}

const RAISE_RE = /^(.+?) raises (\d+(?:\.\d+)?) to (\d+(?:\.\d+)?)(?: and is all-in)?$/;
const BET_RE = /^(.+?) bets (\d+(?:\.\d+)?)(?: and is all-in)?$/;
const CALL_RE = /^(.+?) calls (\d+(?:\.\d+)?)(?: and is all-in)?$/;
const CHECK_RE = /^(.+?) checks$/;
const FOLD_RE = /^(.+?) folds$/;
const POST_SB_RE = /^(.+?) posts small blind (\d+(?:\.\d+)?)$/;
const POST_BB_RE = /^(.+?) posts big blind (\d+(?:\.\d+)?)(?: and is all-in)?$/;
const POST_ANTE_RE = /^(.+?) posts ante (\d+(?:\.\d+)?)$/;

export function parseActionLine(line: string): Action | null {
  let m: RegExpMatchArray | null;

  m = line.match(RAISE_RE);
  if (m) {
    return {
      player: m[1]!,
      type: 'raise',
      amount: parseFloat(m[2]!),
      toTotal: parseFloat(m[3]!),
      isAllIn: line.endsWith('all-in')
    };
  }
  m = line.match(BET_RE);
  if (m) {
    return {
      player: m[1]!,
      type: 'bet',
      amount: parseFloat(m[2]!),
      isAllIn: line.endsWith('all-in')
    };
  }
  m = line.match(CALL_RE);
  if (m) {
    return {
      player: m[1]!,
      type: 'call',
      amount: parseFloat(m[2]!),
      isAllIn: line.endsWith('all-in')
    };
  }
  m = line.match(CHECK_RE);
  if (m) {
    return { player: m[1]!, type: 'check', amount: 0, isAllIn: false };
  }
  m = line.match(FOLD_RE);
  if (m) {
    return { player: m[1]!, type: 'fold', amount: 0, isAllIn: false };
  }
  m = line.match(POST_SB_RE);
  if (m) {
    return { player: m[1]!, type: 'posts_sb', amount: parseFloat(m[2]!), isAllIn: false };
  }
  m = line.match(POST_BB_RE);
  if (m) {
    return {
      player: m[1]!,
      type: 'posts_bb',
      amount: parseFloat(m[2]!),
      isAllIn: line.endsWith('all-in')
    };
  }
  m = line.match(POST_ANTE_RE);
  if (m) {
    return { player: m[1]!, type: 'posts_ante', amount: parseFloat(m[2]!), isAllIn: false };
  }
  return null;
}

function extractBoardCards(headerLine: string | undefined): string[] | null {
  if (!headerLine) return null;
  const matches = headerLine.match(/\[([^\]]+)\]/g);
  if (!matches) return null;
  const cards: string[] = [];
  for (const m of matches) {
    const inner = m.slice(1, -1).split(/\s+/);
    for (const c of inner) if (c.length > 0) cards.push(c);
  }
  return cards;
}

function parseShowdown(lines: string[]): ShowdownEntry[] {
  const entries: ShowdownEntry[] = [];
  for (const line of lines) {
    const m = line.match(/^(.+?) shows \[(\S+) (\S+)\] \((.+)\)$/);
    if (m) {
      entries.push({
        player: m[1]!,
        cards: [m[2]!, m[3]!],
        handDescription: m[4]!
      });
    }
  }
  return entries;
}

interface SummaryData {
  totalPot: number;
  rake: number;
  board: string[];
  summaryLines: HandSummaryLine[];
}

const SUMMARY_POT_RE = /^Total pot (\d+(?:\.\d+)?)\s*\|\s*(?:No rake|Rake (\d+(?:\.\d+)?))$/;
const SUMMARY_BOARD_RE = /^Board: \[([^\]]+)\]$/;
const SUMMARY_SEAT_RE = /^Seat (\d+): (.+?)(?: \((small blind|big blind|button)\))?(.*)$/;

function parseSummarySection(lines: string[]): SummaryData {
  let totalPot = 0;
  let rake = 0;
  let board: string[] = [];
  const summaryLines: HandSummaryLine[] = [];

  for (const line of lines) {
    let m = line.match(SUMMARY_POT_RE);
    if (m) {
      totalPot = parseFloat(m[1]!);
      if (m[2]) rake = parseFloat(m[2]);
      continue;
    }
    m = line.match(SUMMARY_BOARD_RE);
    if (m) {
      board = m[1]!.split(/\s+/);
      continue;
    }
    m = line.match(SUMMARY_SEAT_RE);
    if (m) {
      const seat = parseInt(m[1]!, 10);
      const player = m[2]!;
      const positionLabel = m[3] ?? null;
      let showed = false;
      let cards: [string, string] | null = null;
      let result = '';
      let amount = 0;

      const showedM = line.match(/showed \[(\S+) (\S+)\] and (won (\d+(?:\.\d+)?) with .+|lost with .+)/);
      if (showedM) {
        showed = true;
        cards = [showedM[1]!, showedM[2]!];
        result = showedM[3]!;
        if (showedM[4]) amount = parseFloat(showedM[4]);
      } else {
        const wonM = line.match(/\bwon (\d+(?:\.\d+)?)\b/);
        if (wonM) {
          result = 'won';
          amount = parseFloat(wonM[1]!);
        }
        const collectedM = line.match(/\bcollected (\d+(?:\.\d+)?) from /);
        if (collectedM) {
          result = result || 'collected';
          amount = parseFloat(collectedM[1]!);
        }
        const foldedM = line.match(/\bfolded\b/);
        if (foldedM) {
          result = 'folded';
        }
      }
      summaryLines.push({ seat, player, positionLabel, showed, cards, result, amount });
    }
  }

  return { totalPot, rake, board, summaryLines };
}

const COLLECTED_RE = /^(.+?) collected (\d+(?:\.\d+)?) from (?:(main) pot|side pot (\d+)|pot)$/;

function parseWinners(otherSections: string[]): Winner[] {
  const winners: Winner[] = [];
  for (const line of otherSections) {
    const m = line.match(COLLECTED_RE);
    if (m) {
      const player = m[1]!;
      const amount = parseFloat(m[2]!);
      let pot: Winner['pot'] = 'main';
      if (m[4]) pot = `side ${parseInt(m[4], 10)}` as Winner['pot'];
      winners.push({ player, amount, pot });
    }
  }
  return winners;
}

function combinedBoard(flop: string[], turn: string[], river: string[]): string[] {
  const cards: string[] = [];
  const flopCards = extractBoardCards(flop[0]);
  if (flopCards) cards.push(...flopCards);
  const turnCards = extractBoardCards(turn[0]);
  if (turnCards) {
    const turnOnly = turnCards.slice(flopCards?.length ?? 3);
    cards.push(...turnOnly);
  }
  const riverCards = extractBoardCards(river[0]);
  if (riverCards) {
    const riverOnly = riverCards.slice((flopCards?.length ?? 3) + 1);
    cards.push(...riverOnly);
  }
  return cards;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
