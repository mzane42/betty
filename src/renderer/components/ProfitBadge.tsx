interface ProfitBadgeProps {
  value: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSign?: boolean;
}

export function ProfitBadge({ value, size = 'md', showSign = true }: ProfitBadgeProps): JSX.Element {
  const positive = value >= 0;
  const sign = showSign ? (positive ? '+' : '-') : '';
  const display = `${sign}${Math.abs(value).toFixed(2)}€`;
  const cls = `profit-${size} ${positive ? 'positive' : 'negative'}`;
  return <span className={cls}>{display}</span>;
}
