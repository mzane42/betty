import { useEffect, useState } from 'react';
import { pokerApi, type GameRecommendation } from '../api.js';
import { ProfitBadge } from '../components/ProfitBadge.js';

export function GameSelection(): JSX.Element {
  const [recs, setRecs] = useState<GameRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pokerApi.getGameRecommendations().then((r) => {
      setRecs(r);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="loading">Computing recommendations…</div>;

  return (
    <div className="recs-page">
      <h2>Game selection</h2>
      <p className="muted">Where you should play based on your ROI history.</p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Format</th>
            <th>Stake</th>
            <th className="num">Tournaments</th>
            <th className="num">Net</th>
            <th className="num">ROI</th>
            <th>Confidence</th>
            <th>Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {recs.map((r) => (
            <tr key={`${r.format}-${r.stake}`}>
              <td>{r.format}</td>
              <td>{r.stake}</td>
              <td className="num">{r.tournamentsPlayed}</td>
              <td className="num">
                <ProfitBadge value={r.netResult} size="sm" />
              </td>
              <td className={`num ${r.roi >= 0 ? 'positive' : 'negative'}`}>{r.roi.toFixed(1)}%</td>
              <td>
                <span className={`confidence-${r.confidence}`}>{r.confidence}</span>
              </td>
              <td>
                <span className={`rec-${r.recommendation.replace(/\s/g, '-')}`}>{r.recommendation}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
