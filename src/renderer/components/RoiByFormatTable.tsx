import type { RoiByFormat } from '../../types/bankroll.js';
import { ProfitBadge } from './ProfitBadge.js';

interface Props {
  data: RoiByFormat[];
}

export function RoiByFormatTable({ data }: Props): JSX.Element {
  return (
    <div className="card">
      <h3 className="card-title">ROI by format</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Format</th>
            <th className="num">Tournaments</th>
            <th className="num">Buy-ins</th>
            <th className="num">Winnings</th>
            <th className="num">Net</th>
            <th className="num">ROI</th>
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
