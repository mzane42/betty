import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseHandHistoryFile,
  parseHeader,
  parseBlinds,
  parseTableLine,
  parseSeatLine,
  parseActionLine,
  splitIntoHandBlocks
} from '../../src/parser/hand-parser.js';

const FIXTURES = join(__dirname, '../fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}

describe('parseHeader', () => {
  it('parses Expresso tournament header', () => {
    const line =
      'Winamax Poker - Tournament "Expresso" buyIn: 4.65€ + 0.35€ level: 1 - HandId: #1990367422120460289-1-1620779809 - Holdem no limit (10/20) - 2021/05/12 00:36:49 UTC';
    const h = parseHeader(line);
    expect(h).not.toBeNull();
    expect(h!.gameType).toBe('tournament');
    expect(h!.tournamentName).toBe('Expresso');
    expect(h!.buyIn).toBe(4.65);
    expect(h!.rakeBuyIn).toBe(0.35);
    expect(h!.level).toBe(1);
    expect(h!.tournamentId).toBe('1990367422120460289');
    expect(h!.handId).toBe('#1990367422120460289-1-1620779809');
    expect(h!.blinds).toEqual({ ante: 0, smallBlind: 10, bigBlind: 20 });
    expect(h!.date).toBe('2021-05-12T00:36:49.000Z');
  });

  it('parses tournament header with antes (3-value blinds)', () => {
    const line =
      'Winamax Poker - Tournament "Hit&Run Ticket 10€" buyIn: 1.80€ + 0.20€ level: 12 - HandId: #1730586355286671366-18-1605377406 - Holdem no limit (80/350/700) - 2020/11/14 18:10:06 UTC';
    const h = parseHeader(line);
    expect(h).not.toBeNull();
    expect(h!.tournamentName).toBe('Hit&Run Ticket 10€');
    expect(h!.buyIn).toBe(1.8);
    expect(h!.rakeBuyIn).toBe(0.2);
    expect(h!.blinds).toEqual({ ante: 80, smallBlind: 350, bigBlind: 700 });
  });

  it('parses cash game header', () => {
    const line =
      'Winamax Poker - CashGame - HandId: #15063435-600-1602549057 - Holdem no limit (1/2) - 2020/10/13 00:30:57 UTC';
    const h = parseHeader(line);
    expect(h).not.toBeNull();
    expect(h!.gameType).toBe('cashgame');
    expect(h!.tournamentId).toBeNull();
    expect(h!.tournamentName).toBe('CashGame');
    expect(h!.buyIn).toBe(0);
    expect(h!.blinds).toEqual({ ante: 0, smallBlind: 1, bigBlind: 2 });
  });

  it('parses freeroll with 0€ buy-in', () => {
    const line =
      'Winamax Poker - Tournament "Starting Block WiPT - Déglingos !" buyIn: 0€ + 0€ level: 1 - HandId: #1088135693927972865-1-1540117259 - Holdem no limit (3/10/20) - 2018/10/21 10:20:59 UTC';
    const h = parseHeader(line);
    expect(h).not.toBeNull();
    expect(h!.tournamentName).toBe('Starting Block WiPT - Déglingos !');
    expect(h!.buyIn).toBe(0);
    expect(h!.rakeBuyIn).toBe(0);
    expect(h!.blinds).toEqual({ ante: 3, smallBlind: 10, bigBlind: 20 });
  });
});

describe('parseBlinds', () => {
  it('parses 2-value blinds (no ante)', () => {
    expect(parseBlinds('10/20')).toEqual({ ante: 0, smallBlind: 10, bigBlind: 20 });
  });

  it('parses 3-value blinds (ante)', () => {
    expect(parseBlinds('3/10/20')).toEqual({ ante: 3, smallBlind: 10, bigBlind: 20 });
  });

  it('parses decimal blinds (cash games)', () => {
    expect(parseBlinds('0.5/1')).toEqual({ ante: 0, smallBlind: 0.5, bigBlind: 1 });
  });
});

describe('parseTableLine', () => {
  it('parses 3-max real money table', () => {
    const t = parseTableLine(
      "Table: 'Expresso(244457459)#0' 3-max (real money) Seat #3 is the button"
    );
    expect(t).toEqual({
      tableName: 'Expresso(244457459)#0',
      tableSize: 3,
      buttonSeat: 3
    });
  });

  it('parses 5-max play money table', () => {
    const t = parseTableLine("Table: 'Toledo 17' 5-max (play money) Seat #4 is the button");
    expect(t.tableSize).toBe(5);
    expect(t.buttonSeat).toBe(4);
  });

  it('parses 10-max table with special chars in name', () => {
    const t = parseTableLine(
      "Table: 'Starting Block WiPT - Déglingos !(253351334)#0' 10-max (real money) Seat #4 is the button"
    );
    expect(t.tableSize).toBe(10);
  });
});

describe('parseSeatLine', () => {
  it('parses standard seat with integer stack', () => {
    expect(parseSeatLine('Seat 1: mzane42 (500)')).toEqual({
      seat: 1,
      name: 'mzane42',
      stack: 500,
      position: 'UTG'
    });
  });

  it('parses seat with decimal stack (cash game)', () => {
    const s = parseSeatLine('Seat 2: 19MORENO73 (244.91)');
    expect(s).not.toBeNull();
    expect(s!.stack).toBe(244.91);
  });

  it('parses player name with special characters', () => {
    const s = parseSeatLine('Seat 1: -FTZ- (500)');
    expect(s!.name).toBe('-FTZ-');
  });

  it('parses player name with spaces', () => {
    const s = parseSeatLine('Seat 6: La fouine 07 (500)');
    expect(s!.name).toBe('La fouine 07');
  });
});

describe('parseActionLine', () => {
  it('parses fold', () => {
    expect(parseActionLine('mzane42 folds')).toEqual({
      player: 'mzane42',
      type: 'fold',
      amount: 0,
      isAllIn: false
    });
  });

  it('parses check', () => {
    expect(parseActionLine('BangPunch checks')).toEqual({
      player: 'BangPunch',
      type: 'check',
      amount: 0,
      isAllIn: false
    });
  });

  it('parses call', () => {
    expect(parseActionLine('mzane42 calls 20')?.amount).toBe(20);
  });

  it('parses bet', () => {
    expect(parseActionLine('-FTZ- bets 30')?.amount).toBe(30);
  });

  it('parses raise with to', () => {
    const a = parseActionLine('BangPunch raises 20 to 40');
    expect(a?.type).toBe('raise');
    expect(a?.amount).toBe(20);
    expect(a?.toTotal).toBe(40);
  });

  it('parses all-in raise', () => {
    const a = parseActionLine('Player raises 100 to 500 and is all-in');
    expect(a?.isAllIn).toBe(true);
    expect(a?.toTotal).toBe(500);
  });

  it('parses ante post', () => {
    const a = parseActionLine('daj posts ante 80');
    expect(a?.type).toBe('posts_ante');
    expect(a?.amount).toBe(80);
  });

  it('parses small blind post', () => {
    expect(parseActionLine('-FTZ- posts small blind 10')?.type).toBe('posts_sb');
  });

  it('parses big blind post', () => {
    expect(parseActionLine('BangPunch posts big blind 20')?.type).toBe('posts_bb');
  });
});

describe('splitIntoHandBlocks', () => {
  it('splits multi-hand fixture into blocks', () => {
    const content = loadFixture('expresso_3max_basic.txt');
    const blocks = splitIntoHandBlocks(content);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks[0]).toMatch(/^Winamax Poker - /);
  });
});

describe('parseHandHistoryFile - Expresso 3-max basic', () => {
  const content = loadFixture('expresso_3max_basic.txt');
  const hands = parseHandHistoryFile(content, 'mzane42');

  it('parses multiple hands', () => {
    expect(hands.length).toBeGreaterThan(5);
  });

  it('first hand has correct hero cards', () => {
    const first = hands[0]!;
    expect(first.heroName).toBe('mzane42');
    expect(first.heroCards).toEqual(['8d', '4h']);
  });

  it('first hand has 3 players', () => {
    expect(hands[0]!.players.length).toBe(3);
  });

  it('first hand has correct blinds', () => {
    expect(hands[0]!.blinds).toEqual({ ante: 0, smallBlind: 10, bigBlind: 20 });
  });

  it('all hands have valid handId', () => {
    for (const h of hands) {
      expect(h.handId).toMatch(/^#\d+-\d+-\d+$/);
    }
  });

  it('positions assigned to all players', () => {
    for (const h of hands) {
      for (const p of h.players) {
        expect(['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'MP', 'MP1', 'HJ', 'CO']).toContain(p.position);
      }
    }
  });
});

describe('parseHandHistoryFile - cash game', () => {
  const content = loadFixture('cashgame_5max.txt');
  const hands = parseHandHistoryFile(content, 'mzane42');

  it('parses cash game hands', () => {
    expect(hands.length).toBeGreaterThan(0);
  });

  it('first hand is cashgame type', () => {
    expect(hands[0]!.gameType).toBe('cashgame');
    expect(hands[0]!.tournamentId).toBeNull();
  });

  it('decimal stacks preserved', () => {
    const playerWithDecimal = hands[0]!.players.find((p) => p.stack % 1 !== 0);
    expect(playerWithDecimal).toBeDefined();
  });
});

describe('parseHandHistoryFile - MTT with antes', () => {
  const content = loadFixture('mtt_special_chars.txt');
  const hands = parseHandHistoryFile(content, 'mzane42');

  it('parses MTT hands', () => {
    expect(hands.length).toBeGreaterThan(0);
  });

  it('handles tournament name with special chars', () => {
    expect(hands[0]!.tournamentName).toBe('Hit&Run Ticket 10€');
  });

  it('parses ante in blinds', () => {
    expect(hands[0]!.blinds.ante).toBeGreaterThan(0);
  });
});

describe('parseHandHistoryFile - 10-max Starting Block', () => {
  const content = loadFixture('mtt_starting_block.txt');
  const hands = parseHandHistoryFile(content, 'mzane42');

  it('parses 10-max hands', () => {
    expect(hands.length).toBeGreaterThan(0);
  });

  it('table is 10-max', () => {
    expect(hands[0]!.tableSize).toBe(10);
  });

  it('handles tournament name with accents and punctuation', () => {
    expect(hands[0]!.tournamentName).toBe('Starting Block WiPT - Déglingos !');
  });
});
