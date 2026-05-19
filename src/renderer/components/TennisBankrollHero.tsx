import type { TennisBankrollSummaryRow } from '../api.js';

interface Props {
  summary: TennisBankrollSummaryRow;
}

export function TennisBankrollHero({ summary }: Props): JSX.Element {
  const netSign = summary.allTimeNet >= 0 ? 'positive' : 'negative';
  return (
    <section className="bankroll-hero tennis-bankroll-hero">
      <div className={`net net-${netSign}`}>
        <span className="label">Net all-time tennis</span>
        <span className="value">{formatEur(summary.allTimeNet)}</span>
      </div>
      <div className="metric">
        <span className="label">ROI</span>
        <span className="value">{summary.roi.toFixed(1)}%</span>
      </div>
      <div className="metric">
        <span className="label">Win rate</span>
        <span className="value">{(summary.winRate * 100).toFixed(1)}%</span>
      </div>
      <div className="metric">
        <span className="label">Bets</span>
        <span className="value">
          {summary.betsWon}-{summary.betsLost}-{summary.betsVoid}
          {summary.betsPending > 0 ? ` (${summary.betsPending} en cours)` : ''}
        </span>
      </div>
      <div className="metric">
        <span className="label">CLV moyen</span>
        <span className="value">{summary.avgClvPct.toFixed(2)}%</span>
      </div>
      <div className="metric">
        <span className="label">Total misé</span>
        <span className="value">{formatEur(summary.totalStaked)}</span>
      </div>
    </section>
  );
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}
