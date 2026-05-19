/**
 * Push/fold Nash ranges for 3-max Hyper Turbo Sit&Go (Expresso style).
 *
 * Ranges sourced from published 3-max ICM-aware Nash equilibrium charts
 * (Holdem Resources / Snap Shove Lite 3-max tables). They are intentionally
 * conservative: this is decision *guidance*, not solver-perfect output.
 *
 * Encoding for 169 starting-hand classes:
 *   pairs: "AA", "KK", ..., "22"
 *   suited: "AKs", "AQs", ..., "32s"
 *   offsuit: "AKo", "AQo", ..., "32o"
 *
 * Each entry returns: 'in' (clear shove/call), 'marginal' (borderline ~50% freq),
 * 'out' (clear fold).
 */

const RANK_ORDER = 'AKQJT98765432';

export type NashVerdict = 'in' | 'marginal' | 'out';

/** Canonical hand code from two cards e.g. ["Ah","Kd"] -> "AKo". */
export function handCode(cards: string[]): string | null {
  if (cards.length !== 2) return null;
  const r1 = cards[0]!.charAt(0).toUpperCase();
  const r2 = cards[1]!.charAt(0).toUpperCase();
  const s1 = cards[0]!.charAt(1).toLowerCase();
  const s2 = cards[1]!.charAt(1).toLowerCase();
  if (r1 === r2) return r1 + r2; // pair
  // Order: higher rank first
  const i1 = RANK_ORDER.indexOf(r1);
  const i2 = RANK_ORDER.indexOf(r2);
  const high = i1 < i2 ? r1 : r2;
  const low = i1 < i2 ? r2 : r1;
  return high + low + (s1 === s2 ? 's' : 'o');
}

/** Pair index: 0=AA, 1=KK, ..., 12=22 */
function pairIdx(code: string): number {
  return RANK_ORDER.indexOf(code.charAt(0));
}

/** For non-pair codes, returns the "card index sum" (higher = stronger broadly). */
function cardStrength(code: string): { high: number; low: number; suited: boolean } {
  return {
    high: RANK_ORDER.indexOf(code.charAt(0)),
    low: RANK_ORDER.indexOf(code.charAt(1)),
    suited: code.endsWith('s')
  };
}

/**
 * Hero is the small blind (heads-up vs BB after BTN folds OR 3-max where
 * BTN already folded). Returns whether to *shove* given stack in BB.
 *
 * Approximations: at 10 BB SB shoves ~50% range (any pair, A-rag, K-Q-J face,
 * suited connectors). Tighter as stack grows.
 */
export function sbShoveVerdict(code: string, stackBb: number): NashVerdict {
  if (stackBb >= 25) return offRangeOnly(code, ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo']);
  if (stackBb >= 20) return shoveRangeBig(code);
  if (stackBb >= 15) return shoveRange15(code);
  if (stackBb >= 12) return shoveRange12(code);
  if (stackBb >= 10) return shoveRange10(code);
  if (stackBb >= 8) return shoveRange8(code);
  if (stackBb >= 6) return shoveRange6(code);
  if (stackBb >= 4) return shoveRange4(code);
  // <4 BB: shove ATC except worst trash
  return code === '32o' || code === '42o' || code === '52o' || code === '72o' ? 'marginal' : 'in';
}

/**
 * Hero in BB facing a shove from SB or BTN.
 * Returns whether to *call* given hero stack in BB.
 */
export function bbCallVerdict(code: string, stackBb: number): NashVerdict {
  if (stackBb >= 20) return offRangeOnly(code, ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo']);
  if (stackBb >= 15) return callRange15(code);
  if (stackBb >= 12) return callRange12(code);
  if (stackBb >= 10) return callRange10(code);
  if (stackBb >= 8) return callRange8(code);
  if (stackBb >= 6) return callRange6(code);
  if (stackBb >= 4) return callRange4(code);
  // <4 BB: call ATC pretty much
  return 'in';
}

/**
 * BTN in 3-max with all players still in. Shove range slightly looser than SB.
 */
export function btnShoveVerdict(code: string, stackBb: number): NashVerdict {
  if (stackBb >= 25) return offRangeOnly(code, ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo', 'AQs']);
  // BTN shoves slightly tighter than SB heads-up (3 players still alive)
  if (stackBb >= 20) return shoveRange15(code);
  if (stackBb >= 15) return shoveRange12(code);
  if (stackBb >= 12) return shoveRange10(code);
  if (stackBb >= 10) return shoveRange8(code);
  if (stackBb >= 8) return shoveRange6(code);
  if (stackBb >= 6) return shoveRange4(code);
  // ultra short BTN: any reasonable hand
  return code === '32o' || code === '42o' ? 'marginal' : 'in';
}

// --- Range definitions ---

function offRangeOnly(code: string, allowedList: string[]): NashVerdict {
  return allowedList.includes(code) ? 'in' : 'out';
}

function isPair(code: string, minRank: string): boolean {
  if (code.charAt(0) !== code.charAt(1)) return false;
  return pairIdx(code) <= RANK_ORDER.indexOf(minRank);
}

function isAce(code: string, minKicker: string, suitedOnly = false): boolean {
  if (code.charAt(0) !== 'A') return false;
  if (code.charAt(0) === code.charAt(1)) return false;
  if (suitedOnly && !code.endsWith('s')) return false;
  return RANK_ORDER.indexOf(code.charAt(1)) <= RANK_ORDER.indexOf(minKicker);
}

// Reserved helper functions for upcoming Nash range tiers (>25BB, broadway-only
// scenarios). Currently unused but kept here so the range tables stay readable
// when the wider stacks are wired up.
export function isBroadwayPlus(code: string, minHigh: string): boolean {
  if (code.charAt(0) === code.charAt(1)) return false;
  const s = cardStrength(code);
  return s.high <= RANK_ORDER.indexOf(minHigh);
}

export function shoveRange25Plus(code: string): NashVerdict {
  if (isPair(code, 'TT')) return 'in';
  if (['AKs', 'AKo'].includes(code)) return 'in';
  return 'out';
}

function shoveRangeBig(code: string): NashVerdict {
  if (isPair(code, '88')) return 'in';
  if (isPair(code, '77')) return 'marginal';
  if (isAce(code, 'T')) return 'in';
  if (code === 'AJo' || code === 'ATs' || code === 'KQs' || code === 'KQo') return 'in';
  if (code === 'AT' || code === 'KJs' || code === 'QJs') return 'marginal';
  return 'out';
}

function shoveRange15(code: string): NashVerdict {
  if (isPair(code, '55')) return 'in';
  if (isPair(code, '44')) return 'marginal';
  if (isAce(code, '7')) return 'in';
  if (isAce(code, '5', true)) return 'in';
  if (['KJs', 'QJs', 'JTs', 'KQs', 'KQo', 'KJo', 'AJo', 'KTs', 'A6o'].includes(code)) return 'in';
  if (['QTs', 'T9s', 'A5o', 'KTo', 'QJo'].includes(code)) return 'marginal';
  return 'out';
}

function shoveRange12(code: string): NashVerdict {
  if (isPair(code, '22')) return 'in';
  if (isAce(code, '4')) return 'in';
  if (isAce(code, '2', true)) return 'in';
  if (
    [
      'KTs', 'K9s', 'K8s', 'KJs', 'KQs', 'KQo', 'KJo', 'KTo',
      'QJs', 'QTs', 'Q9s', 'QJo',
      'JTs', 'J9s', 'T9s', '98s', '87s', '76s'
    ].includes(code)
  )
    return 'in';
  if (['K9o', 'Q9o', 'J9o', 'T8s', 'A2o', 'A3o'].includes(code)) return 'marginal';
  return 'out';
}

function shoveRange10(code: string): NashVerdict {
  if (isPair(code, '22')) return 'in';
  if (code.charAt(0) === 'A') return 'in'; // any Ace
  if (code.charAt(0) === 'K' && (code.endsWith('s') || RANK_ORDER.indexOf(code.charAt(1)) <= RANK_ORDER.indexOf('7'))) return 'in';
  if (code.charAt(0) === 'Q' && (code.endsWith('s') || RANK_ORDER.indexOf(code.charAt(1)) <= RANK_ORDER.indexOf('9'))) return 'in';
  if (
    [
      'JTs', 'J9s', 'J8s', 'JTo', 'J9o',
      'T9s', 'T8s', 'T9o',
      '98s', '97s', '87s', '76s', '65s', '54s'
    ].includes(code)
  )
    return 'in';
  if (['K6o', 'K5o', 'Q8o', 'J8o', 'T8o', '98o'].includes(code)) return 'marginal';
  return 'out';
}

function shoveRange8(code: string): NashVerdict {
  if (isPair(code, '22')) return 'in';
  if (code.charAt(0) === 'A') return 'in';
  if (code.charAt(0) === 'K') return 'in';
  if (code.charAt(0) === 'Q' && (code.endsWith('s') || RANK_ORDER.indexOf(code.charAt(1)) <= RANK_ORDER.indexOf('6'))) return 'in';
  if (
    [
      'JTs', 'J9s', 'J8s', 'J7s', 'JTo', 'J9o', 'J8o',
      'T9s', 'T8s', 'T7s', 'T9o',
      '98s', '97s', '87s', '76s', '65s', '54s', '43s'
    ].includes(code)
  )
    return 'in';
  if (['Q5o', 'Q4o', 'J7o', 'T8o', '98o', '87o', '76o'].includes(code)) return 'marginal';
  return 'out';
}

function shoveRange6(code: string): NashVerdict {
  if (code.charAt(0) === code.charAt(1)) return 'in'; // any pair
  if (code.charAt(0) === 'A' || code.charAt(0) === 'K' || code.charAt(0) === 'Q') return 'in';
  if (code.charAt(0) === 'J') return 'in';
  if (code.startsWith('T') && (code.endsWith('s') || RANK_ORDER.indexOf(code.charAt(1)) <= RANK_ORDER.indexOf('6'))) return 'in';
  if (['98s', '97s', '96s', '87s', '86s', '76s', '65s', '54s', '43s'].includes(code)) return 'in';
  if (['T6o', '98o', '87o', '76o', '65o'].includes(code)) return 'marginal';
  return 'out';
}

function shoveRange4(code: string): NashVerdict {
  if (code.charAt(0) === code.charAt(1)) return 'in';
  if ('AKQJT9'.includes(code.charAt(0))) return 'in';
  if (code.startsWith('8') && code.endsWith('s')) return 'in';
  if (['98s', '87s', '76s', '65s', '54s', '43s', '98o', '87o'].includes(code)) return 'in';
  if (['76o', '65o', '54o', '43o'].includes(code)) return 'marginal';
  return code === '32o' || code === '42o' || code === '52o' ? 'out' : 'marginal';
}

// Call ranges (tighter than shove ranges across the board)

function callRange15(code: string): NashVerdict {
  if (isPair(code, '88')) return 'in';
  if (isPair(code, '66')) return 'marginal';
  if (['AKs', 'AKo', 'AQs', 'AQo', 'AJs'].includes(code)) return 'in';
  if (['AJo', 'ATs', 'KQs'].includes(code)) return 'marginal';
  return 'out';
}

function callRange12(code: string): NashVerdict {
  if (isPair(code, '66')) return 'in';
  if (isPair(code, '44')) return 'marginal';
  if (isAce(code, 'T')) return 'in';
  if (['AJo', 'KQs', 'KQo', 'KJs'].includes(code)) return 'in';
  if (['A9s', 'A9o', 'A8s', 'KJo', 'QJs'].includes(code)) return 'marginal';
  return 'out';
}

function callRange10(code: string): NashVerdict {
  if (isPair(code, '44')) return 'in';
  if (isPair(code, '22')) return 'marginal';
  if (isAce(code, '8')) return 'in';
  if (isAce(code, '5', true)) return 'in';
  if (['A7o', 'KQs', 'KQo', 'KJs', 'KJo', 'KTs'].includes(code)) return 'in';
  if (['A6o', 'A5o', 'A4o', 'KTo', 'K9s', 'QJs', 'QJo', 'JTs'].includes(code)) return 'marginal';
  return 'out';
}

function callRange8(code: string): NashVerdict {
  if (isPair(code, '22')) return 'in';
  if (isAce(code, '5')) return 'in';
  if (isAce(code, '2', true)) return 'in';
  if (
    ['KQs', 'KQo', 'KJs', 'KJo', 'KTs', 'KTo', 'K9s', 'QJs', 'QJo', 'QTs', 'JTs'].includes(code)
  )
    return 'in';
  if (['K9o', 'K8s', 'Q9s', 'QTo', 'J9s', 'T9s'].includes(code)) return 'marginal';
  return 'out';
}

function callRange6(code: string): NashVerdict {
  if (code.charAt(0) === code.charAt(1)) return 'in';
  if (code.charAt(0) === 'A') return 'in';
  if (code.charAt(0) === 'K') return 'in';
  if (code.charAt(0) === 'Q' && (code.endsWith('s') || RANK_ORDER.indexOf(code.charAt(1)) <= RANK_ORDER.indexOf('8'))) return 'in';
  if (['JTs', 'J9s', 'JTo', 'T9s', '98s', '87s', '76s'].includes(code)) return 'in';
  if (['Q7o', 'J9o', 'J8s', 'T8s', '98o'].includes(code)) return 'marginal';
  return 'out';
}

function callRange4(code: string): NashVerdict {
  if (code.charAt(0) === code.charAt(1)) return 'in';
  if ('AKQJ'.includes(code.charAt(0))) return 'in';
  if (code.startsWith('T') && (code.endsWith('s') || RANK_ORDER.indexOf(code.charAt(1)) <= RANK_ORDER.indexOf('7'))) return 'in';
  if (['98s', '87s', '76s', '65s', '54s', '98o', '87o', '76o'].includes(code)) return 'in';
  if (['T6o', '65o', '54o', '43o'].includes(code)) return 'marginal';
  return 'out';
}
