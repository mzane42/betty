import type { BankrollSummary } from '../../types/bankroll.js';
import { ProfitBadge } from './ProfitBadge.js';
import { InfoTooltip } from './InfoTooltip.js';
import { TIPS } from '../glossary.js';

interface Props {
  summary: BankrollSummary;
}

export function BankrollHero({ summary }: Props): JSX.Element {
  const status = summary.allTimeNet >= 0 ? 'positive' : 'negative';
  return (
    <div className={`bankroll-hero bankroll-${status}`}>
      <div className="bankroll-main">
        <span className="bankroll-label">
          All-time net<InfoTooltip text={TIPS.allTimeNet} />
        </span>
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
          <span className="stat-label">
            This year<InfoTooltip text={TIPS.currentYearNet} />
          </span>
          <ProfitBadge value={summary.currentYearNet} size="lg" />
        </div>
        <div className="stat-card">
          <span className="stat-label">
            This month<InfoTooltip text={TIPS.currentMonthNet} />
          </span>
          <ProfitBadge value={summary.currentMonthNet} size="lg" />
        </div>
        <div className="stat-card">
          <span className="stat-label">
            Best month<InfoTooltip text={TIPS.bestMonth} />
          </span>
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
          <span className="stat-label">
            Worst month<InfoTooltip text={TIPS.worstMonth} />
          </span>
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
