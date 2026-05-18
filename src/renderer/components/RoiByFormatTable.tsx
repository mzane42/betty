import type { RoiByFormat } from '../../types/bankroll.js';
import { ProfitBadge } from './ProfitBadge.js';
import { InfoTooltip } from './InfoTooltip.js';
import { TIPS } from '../glossary.js';

interface Props {
  data: RoiByFormat[];
}

export function RoiByFormatTable({ data }: Props): JSX.Element {
  return (
    <div className="card">
      <h3 className="card-title">ROI par format</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Format</th>
            <th className="num">
              Tournois<InfoTooltip text={TIPS.tournaments} />
            </th>
            <th className="num">
              Buy-ins<InfoTooltip text={TIPS.buyIns} />
            </th>
            <th className="num">
              Gains<InfoTooltip text={TIPS.winnings} />
            </th>
            <th className="num">
              Net<InfoTooltip text={TIPS.netResult} />
            </th>
            <th className="num">
              ROI<InfoTooltip text={TIPS.roi} />
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.format}>
              <td>{row.format}</td>
              <td className="num">{row.tournamentsPlayed}</td>
              <td className="num">{row.totalBuyIns.toFixed(2)}€</td>
              <td className="num">{row.totalWinnings.toFixed(2)}€</td>
              <td className="num">
                <ProfitBadge value={row.net} size="sm" />
              </td>
              <td className={`num ${row.roi >= 0 ? 'positive' : 'negative'}`}>{row.roi.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
