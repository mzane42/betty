import { describe, expect, it } from 'vitest';
import { computePositions } from '../../src/parser/position-calculator.js';
import type { SeatPlayer } from '../../src/types/hand.js';

function makePlayers(seats: number[]): SeatPlayer[] {
  return seats.map((s) => ({
    seat: s,
    name: `P${s}`,
    stack: 100,
    position: 'UTG'
  }));
}

describe('computePositions', () => {
  it('heads-up: button is SB', () => {
    const players = makePlayers([1, 2]);
    computePositions(players, 1);
    expect(players[0]!.position).toBe('SB');
    expect(players[1]!.position).toBe('BB');
  });

  it('3-max: BTN, SB, BB clockwise', () => {
    const players = makePlayers([1, 2, 3]);
    computePositions(players, 3);
    expect(players.find((p) => p.seat === 3)!.position).toBe('BTN');
    expect(players.find((p) => p.seat === 1)!.position).toBe('SB');
    expect(players.find((p) => p.seat === 2)!.position).toBe('BB');
  });

  it('6-max: BTN, SB, BB, UTG, HJ, CO', () => {
    const players = makePlayers([1, 2, 3, 4, 5, 6]);
    computePositions(players, 6);
    const positions = players.reduce<Record<number, string>>((acc, p) => {
      acc[p.seat] = p.position;
      return acc;
    }, {});
    expect(positions[6]).toBe('BTN');
    expect(positions[1]).toBe('SB');
    expect(positions[2]).toBe('BB');
    expect(positions[3]).toBe('UTG');
  });

  it('9-max: full ring positions', () => {
    const players = makePlayers([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    computePositions(players, 9);
    expect(players.find((p) => p.seat === 9)!.position).toBe('BTN');
    expect(players.find((p) => p.seat === 1)!.position).toBe('SB');
    expect(players.find((p) => p.seat === 2)!.position).toBe('BB');
  });

  it('handles non-consecutive seats (someone busted)', () => {
    const players = makePlayers([1, 4, 6]);
    computePositions(players, 6);
    expect(players.find((p) => p.seat === 6)!.position).toBe('BTN');
    expect(players.find((p) => p.seat === 1)!.position).toBe('SB');
    expect(players.find((p) => p.seat === 4)!.position).toBe('BB');
  });
});
