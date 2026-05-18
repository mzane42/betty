import type { Position, SeatPlayer } from '../types/hand.js';

/**
 * Compute poker positions for each player based on button seat and table size.
 *
 * Rules:
 * - Heads-up (2 players): button is SB, other is BB
 * - 3-max: BTN, SB, BB (clockwise from button)
 * - 6+ players: BTN, SB, BB, then UTG, UTG1, MP, MP1, HJ, CO depending on count
 *
 * Note: when seats are non-consecutive (e.g. seats 1, 4, 6 of a 6-max), we order
 * the players by seat number and compute positions starting from the button.
 */
export function computePositions(players: SeatPlayer[], buttonSeat: number): void {
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const n = ordered.length;
  if (n === 0) return;

  const btnIndex = ordered.findIndex((p) => p.seat === buttonSeat);
  if (btnIndex === -1) {
    // Button seat not in active players (shouldn't happen). Default first to BTN.
    assignByOrder(ordered, 0);
    syncBack(players, ordered);
    return;
  }

  assignByOrder(ordered, btnIndex);
  syncBack(players, ordered);
}

function syncBack(players: SeatPlayer[], ordered: SeatPlayer[]): void {
  const positionByName = new Map<string, Position>();
  for (const p of ordered) positionByName.set(p.name, p.position);
  for (const p of players) {
    const pos = positionByName.get(p.name);
    if (pos) p.position = pos;
  }
}

function assignByOrder(ordered: SeatPlayer[], btnIndex: number): void {
  const n = ordered.length;

  if (n === 2) {
    // Heads-up: button is SB
    ordered[btnIndex]!.position = 'SB';
    ordered[(btnIndex + 1) % n]!.position = 'BB';
    return;
  }

  // 3+ players: BTN, SB, BB are fixed
  ordered[btnIndex]!.position = 'BTN';
  ordered[(btnIndex + 1) % n]!.position = 'SB';
  ordered[(btnIndex + 2) % n]!.position = 'BB';

  if (n === 3) return;

  // Remaining seats: UTG, then continue depending on table size
  // The order after BB (clockwise) is: UTG, UTG1, MP, MP1, HJ, CO -> BTN
  // Truncate from the front based on n.
  const remainingCount = n - 3;
  const labels = pickLabels(remainingCount);
  for (let i = 0; i < remainingCount; i++) {
    const idx = (btnIndex + 3 + i) % n;
    ordered[idx]!.position = labels[i]!;
  }
}

/**
 * Returns position labels for non-button/blind seats in clockwise order
 * starting from the seat right after BB and ending just before BTN.
 */
function pickLabels(count: number): Position[] {
  // Labels we draw from, in clockwise order from UTG ending at CO (which sits before BTN):
  // [UTG, UTG1, MP, MP1, HJ, CO]
  // For 4 players (count=1) we have just [CO]
  // For 5 players (count=2): [UTG, CO]? Standard 5-max: UTG, BTN-1(CO) -- but we'll go [UTG, CO]
  // For 6 players (count=3): [UTG, HJ, CO]
  // For 7 players (count=4): [UTG, UTG1, HJ, CO]
  // For 8 players (count=5): [UTG, UTG1, MP, HJ, CO]
  // For 9 players (count=6): [UTG, UTG1, MP, MP1, HJ, CO]
  // For 10 players (count=7): [UTG, UTG1, MP, MP1, HJ, HJ, CO] -- we'll fall back to UTG repeats
  const all: Position[] = ['UTG', 'UTG1', 'MP', 'MP1', 'HJ', 'CO'];
  if (count <= all.length) {
    if (count === 1) return ['CO'];
    if (count === 2) return ['UTG', 'CO'];
    if (count === 3) return ['UTG', 'HJ', 'CO'];
    if (count === 4) return ['UTG', 'UTG1', 'HJ', 'CO'];
    if (count === 5) return ['UTG', 'UTG1', 'MP', 'HJ', 'CO'];
    if (count === 6) return ['UTG', 'UTG1', 'MP', 'MP1', 'HJ', 'CO'];
  }
  // 10-max: just extend with MP-like labels
  const extras: Position[] = ['UTG', 'UTG1', 'UTG1', 'MP', 'MP1', 'HJ', 'CO'];
  return extras.slice(0, count);
}
