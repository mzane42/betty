import { PlayingCard } from './PlayingCard.js';

interface PlayerData {
  player_name: string;
  seat: number;
  position: string;
  stack_start: number;
  is_hero: number;
  cards: string | null;
  won: number;
}

interface Props {
  players: PlayerData[];
  board: string[];
  bigBlind: number;
  totalPot: number;
  street: 'PRE-FLOP' | 'FLOP' | 'TURN' | 'RIVER';
}

/**
 * SVG-based oval poker table replay.
 * Renders 3 seats (hero bottom, villains top-left + top-right) with their
 * cards, stack in BB, position badge, and the visible board cards + pot.
 */
export function TableReplay({ players, board, bigBlind, totalPot, street }: Props): JSX.Element {
  const hero = players.find((p) => p.is_hero === 1);
  const villains = players.filter((p) => p.is_hero === 0);

  // Seat positions (in % of SVG viewBox 1000 x 500)
  // Hero: bottom center
  // Villain 1: top-left
  // Villain 2: top-right
  const seatPositions: Array<{ cx: number; cy: number; align: 'left' | 'center' | 'right' }> = [
    { cx: 50, cy: 90, align: 'center' },
    { cx: 18, cy: 10, align: 'left' },
    { cx: 82, cy: 10, align: 'right' }
  ];

  const seats: Array<PlayerData & { pos: typeof seatPositions[0] }> = [];
  if (hero) seats.push({ ...hero, pos: seatPositions[0]! });
  villains.slice(0, 2).forEach((v, i) => {
    seats.push({ ...v, pos: seatPositions[i + 1]! });
  });

  const visibleBoard =
    street === 'PRE-FLOP'
      ? []
      : street === 'FLOP'
      ? board.slice(0, 3)
      : street === 'TURN'
      ? board.slice(0, 4)
      : board.slice(0, 5);

  return (
    <div className="table-replay">
      <svg viewBox="0 0 1000 500" className="table-svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="tableFelt" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#1e3a5f" />
            <stop offset="100%" stopColor="#0d1f33" />
          </radialGradient>
          <linearGradient id="rail" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3a3a44" />
            <stop offset="100%" stopColor="#1a1a22" />
          </linearGradient>
        </defs>

        {/* Outer rail */}
        <ellipse cx="500" cy="250" rx="490" ry="235" fill="url(#rail)" />
        {/* Felt */}
        <ellipse cx="500" cy="250" rx="460" ry="210" fill="url(#tableFelt)" stroke="#0a1929" strokeWidth="2" />

        {/* Center: pot + board */}
        <foreignObject x="280" y="190" width="440" height="120">
          <div className="table-center">
            <div className="table-board">
              {visibleBoard.map((c, i) => (
                <div key={i} className="board-card" style={{ animationDelay: `${i * 100}ms` }}>
                  <PlayingCard card={c} size="md" />
                </div>
              ))}
              {visibleBoard.length === 0 && <span className="muted">{street}</span>}
            </div>
            <div className="table-pot">
              Pot: <strong>{Math.round(totalPot).toLocaleString('fr-FR')}</strong>
              <span className="muted">({(totalPot / bigBlind).toFixed(1)} BB)</span>
            </div>
          </div>
        </foreignObject>

        {/* Seats */}
        {seats.map((s) => {
          const stackBb = bigBlind > 0 ? s.stack_start / bigBlind : 0;
          const cards: string[] | null = s.cards ? (JSON.parse(s.cards) as string[]) : null;
          const x = s.pos.cx * 10;
          const y = s.pos.cy * 5;
          return (
            <foreignObject
              key={s.player_name}
              x={x - 80}
              y={s.is_hero ? y - 90 : y - 10}
              width="160"
              height="120"
            >
              <div className={`table-seat ${s.is_hero ? 'hero-seat' : 'villain-seat'}`}>
                <div className="seat-name">
                  <span className="seat-avatar" style={{ background: avatarColor(s.player_name) }}>
                    {s.player_name.charAt(0).toUpperCase()}
                  </span>
                  <span>{s.player_name}</span>
                </div>
                <div className="seat-info">
                  <span className={`seat-position pos-${s.position.toLowerCase()}`}>{s.position}</span>
                  <span className="seat-stack">{stackBb.toFixed(1)} BB</span>
                </div>
                <div className="seat-cards">
                  {cards ? (
                    cards.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)
                  ) : (
                    <>
                      <CardBack />
                      <CardBack />
                    </>
                  )}
                </div>
              </div>
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
}

function CardBack(): JSX.Element {
  return <span className="card-back" />;
}

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return `hsl(${h % 360}, 55%, 35%)`;
}
