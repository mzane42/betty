interface Props {
  net: number;
  invested: number;
}

export function ResultIcon({ net, invested }: Props): JSX.Element {
  if (invested === 0) return <span className="result-icon result-fold" title="Couché pré-flop">—</span>;
  if (net > 0) return <span className="result-icon result-win" title="Gagnée">✓</span>;
  if (net < 0) return <span className="result-icon result-loss" title="Perdue">✗</span>;
  return <span className="result-icon result-split" title="Split / égalité">=</span>;
}
