interface ProfitBadgeProps {
  value: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSign?: boolean;
  unit?: 'eur' | 'chips';
}

export function ProfitBadge({ value, size = 'md', showSign = true, unit = 'eur' }: ProfitBadgeProps): JSX.Element {
  const positive = value >= 0;
  const sign = showSign ? (positive ? '+' : '-') : '';
  const abs = Math.abs(value);
  const display =
    unit === 'eur'
      ? `${sign}${abs.toFixed(2)}€`
      : `${sign}${Math.round(abs).toLocaleString('fr-FR')} `;
  const cls = `profit-${size} ${positive ? 'positive' : 'negative'}`;
  return (
    <span className={cls}>
      {display}
      {unit === 'chips' && <ChipIcon />}
    </span>
  );
}

function ChipIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width="11"
      height="11"
      aria-hidden
      style={{ verticalAlign: '-1px', marginLeft: 2 }}
    >
      <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.18" />
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1" />
      <line x1="8" y1="0.6" x2="8" y2="3" stroke="currentColor" strokeWidth="1.2" />
      <line x1="8" y1="13" x2="8" y2="15.4" stroke="currentColor" strokeWidth="1.2" />
      <line x1="0.6" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1.2" />
      <line x1="13" y1="8" x2="15.4" y2="8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
