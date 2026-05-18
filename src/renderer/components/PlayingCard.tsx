import { handStrength, type HandStrength } from '../lib/card-eval.js';

interface Props {
  card: string;
  size?: 'sm' | 'md';
}

const SUIT_SYMBOL: Record<string, string> = { h: '♥', d: '♦', s: '♠', c: '♣' };
const SUIT_CLASS: Record<string, string> = { h: 'red', d: 'red', s: 'dark', c: 'dark' };

export function PlayingCard({ card, size = 'md' }: Props): JSX.Element {
  const rank = card.slice(0, -1).toUpperCase().replace('T', '10');
  const suitChar = card.slice(-1).toLowerCase();
  const suit = SUIT_SYMBOL[suitChar] ?? '?';
  const colorClass = SUIT_CLASS[suitChar] ?? 'dark';

  return (
    <span className={`playing-card pc-${size} pc-${colorClass}`}>
      <span className="pc-rank">{rank}</span>
      <span className="pc-suit">{suit}</span>
    </span>
  );
}

interface GroupProps {
  cards: string[] | null;
  size?: 'sm' | 'md';
  /** When true, wraps a hand strength halo for 2-card combos (hero hole cards). */
  withStrength?: boolean;
}

export function CardGroup({ cards, size = 'md', withStrength = false }: GroupProps): JSX.Element {
  if (!cards || cards.length === 0) return <span className="muted">-</span>;
  const strength: HandStrength | null = withStrength && cards.length === 2 ? handStrength(cards) : null;
  return (
    <span className={`card-group ${strength ? `strength-${strength}` : ''}`}>
      {cards.map((c, i) => <PlayingCard key={`${c}-${i}`} card={c} size={size} />)}
    </span>
  );
}
