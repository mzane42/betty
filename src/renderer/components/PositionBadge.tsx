interface Props {
  position: string | null;
}

const POS_CLASS: Record<string, string> = {
  SB: 'pos-sb',
  BB: 'pos-bb',
  BTN: 'pos-btn',
  CO: 'pos-co',
  HJ: 'pos-hj',
  MP: 'pos-mp',
  UTG: 'pos-utg',
  'UTG+1': 'pos-utg',
  'UTG+2': 'pos-utg'
};

export function PositionBadge({ position }: Props): JSX.Element {
  if (!position) return <span className="muted">-</span>;
  const cls = POS_CLASS[position] ?? 'pos-default';
  return <span className={`position-badge ${cls}`}>{position}</span>;
}
