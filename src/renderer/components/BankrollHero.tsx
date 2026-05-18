import type { BankrollSummary } from '../../types/bankroll.js';
import { ProfitBadge } from './ProfitBadge.js';

interface Props {
  summary: BankrollSummary;
}

export function BankrollHero({ summary }: Props): JSX.Element {
  const status = summary.allTimeNet >= 0 ? 'positive' : 'negative';
  return (
    <div className={`bankroll-hero bankroll-${status}`}>
      <div className="bankroll-main">
        <span className="bankroll-label">All-time net</span>
        <span className={`bankroll-value ${status}`}>
          {summary.allTimeNet >= 0 ? '+' : '-'}
          {Math.abs(summary.allTimeNet).toFixed(2)}€
        </span>
        <span className="bankroll-sub">
          {summary.tournamentsPlayed} tournaments · {summary.handsPlayed.toLocaleString()} hands
        </span>
      </div>
      <div className="bankroll-stats">
        <div className="stat-card">
          <span className="stat-label">This year</span>
          <ProfitBadge value={summary.currentYearNet} size="lg" />
        </div>
        <div className="stat-card">
          <span className="stat-label">This month</span>
          <ProfitBadge value={summary.currentMonthNet} size="lg" />
        </div>
        <div className="stat-card">
          <span className="stat-label">Best month</span>
          {summary.bestMonth ? (
            <>
              <ProfitBadge value={summary.bestMonth.net} size="md" />
              <span className="stat-sub">{summary.bestMonth.month}</span>
            </>
          ) : (
            <span className="stat-sub">—</span>
          )}
        </div>
        <div className="stat-card">
          <span className="stat-label">Worst month</span>
          {summary.worstMonth ? (
            <>
              <ProfitBadge value={summary.worstMonth.net} size="md" />
              <span className="stat-sub">{summary.worstMonth.month}</span>
            </>
          ) : (
            <span className="stat-sub">—</span>
          )}
        </div>
      </div>
    </div>
  );
}
