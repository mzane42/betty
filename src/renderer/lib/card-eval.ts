const RANK_ORDER = '23456789TJQKA';

export type HandStrength = 'premium' | 'strong' | 'playable' | 'marginal' | 'weak';

const PREMIUM = new Set(['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo', 'AQs']);
const STRONG = new Set(['TT', '99', 'AQo', 'AJs', 'ATs', 'KQs', 'KJs', 'AJo']);
const PLAYABLE = new Set([
  '88', '77', '66', '55', '44', '33', '22',
  'KQo', 'KJo', 'KTs', 'QJs', 'QTs', 'JTs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s'
]);

export function handStrength(cards: string[] | null | undefined): HandStrength {
  if (!cards || cards.length !== 2) return 'weak';
  const [a, b] = cards;
  const r1 = a!.charAt(0).toUpperCase();
  const r2 = b!.charAt(0).toUpperCase();
  const s1 = a!.charAt(1).toLowerCase();
  const s2 = b!.charAt(1).toLowerCase();
  const isPair = r1 === r2;
  const suited = s1 === s2;
  const high = RANK_ORDER.indexOf(r1) > RANK_ORDER.indexOf(r2) ? r1 : r2;
  const low = high === r1 ? r2 : r1;
  const key = isPair ? high + high : high + low + (suited ? 's' : 'o');

  if (PREMIUM.has(key)) return 'premium';
  if (STRONG.has(key)) return 'strong';
  if (PLAYABLE.has(key)) return 'playable';

  const gap = Math.abs(RANK_ORDER.indexOf(r1) - RANK_ORDER.indexOf(r2));
  if (suited && gap <= 2) return 'marginal';
  if (high === 'A' && suited) return 'marginal';
  if (high === 'K' && suited) return 'marginal';
  return 'weak';
}

export type BoardTexture = 'paired' | 'flush-draw' | 'monotone' | 'connected' | 'high' | 'rainbow';

export function boardTextures(board: string[] | null | undefined): BoardTexture[] {
  if (!board || board.length < 3) return [];
  const tags = new Set<BoardTexture>();
  const ranks = board.map((c) => c.charAt(0).toUpperCase());
  const suits = board.map((c) => c.charAt(1).toLowerCase());

  // Paired
  const rankCounts = new Map<string, number>();
  ranks.forEach((r) => rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1));
  if ([...rankCounts.values()].some((c) => c >= 2)) tags.add('paired');

  // Monotone / flush draw
  const suitCounts = new Map<string, number>();
  suits.forEach((s) => suitCounts.set(s, (suitCounts.get(s) ?? 0) + 1));
  const maxSuit = Math.max(...suitCounts.values());
  if (maxSuit >= 3) tags.add('monotone');
  else if (maxSuit === 2) tags.add('flush-draw');
  else tags.add('rainbow');

  // Connected
  const sortedIdx = [...new Set(ranks)].map((r) => RANK_ORDER.indexOf(r)).sort((a, b) => a - b);
  const span = sortedIdx[sortedIdx.length - 1]! - sortedIdx[0]!;
  if (span <= 4 && sortedIdx.length >= 3) tags.add('connected');

  // High broadway
  if (ranks.some((r) => 'AKQJ'.includes(r))) tags.add('high');

  return [...tags];
}

export function isPocketPair(cards: string[] | null | undefined): boolean {
  if (!cards || cards.length !== 2) return false;
  return cards[0]!.charAt(0).toUpperCase() === cards[1]!.charAt(0).toUpperCase();
}
