import { useEffect, useState } from 'react';
import { pokerApi, type GameRecommendation } from '../api.js';
import { ProfitBadge } from '../components/ProfitBadge.js';
import { InfoTooltip } from '../components/InfoTooltip.js';
import { SortHeader, SearchBox } from '../components/SortHeader.js';
import { useTable } from '../lib/use-table.js';
import { TIPS } from '../glossary.js';

function translateConfidence(c: string): string {
  return { high: 'élevée', medium: 'moyenne', low: 'faible' }[c] ?? c;
}

function translateRec(r: string): string {
  return ({
    'play more': 'joue plus',
    'keep playing': 'continue',
    avoid: 'évite',
    investigate: 'à investiguer'
  } as Record<string, string>)[r] ?? r;
}

export function GameSelection(): JSX.Element {
  const [recs, setRecs] = useState<GameRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pokerApi.getGameRecommendations().then((r) => {
      setRecs(r);
      setLoading(false);
    });
  }, []);

  const table = useTable<GameRecommendation>(recs, {
    defaultSort: { key: 'tournamentsPlayed', dir: 'desc' },
    searchFn: (r, q) => r.format.toLowerCase().includes(q) || r.stake.toLowerCase().includes(q) || r.recommendation.toLowerCase().includes(q)
  });

  if (loading) return <div className="loading">Calcul des recommandations…</div>;

  return (
    <div className="recs-page">
      <h2>Sélection des jeux</h2>
      <div className="table-toolbar">
        <p className="muted">Où tu devrais jouer selon ton historique ROI.</p>
        <SearchBox value={table.search} onChange={table.setSearch} placeholder="Format, stake, reco…" />
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <SortHeader label="Format" sortKey="format" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} />
            <SortHeader label={<>Buy-in<InfoTooltip text={TIPS.stake} /></>} sortKey="stake" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} />
            <SortHeader label={<>Tournois<InfoTooltip text={TIPS.tournaments} /></>} sortKey="tournamentsPlayed" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
            <SortHeader label={<>Net<InfoTooltip text={TIPS.netResult} /></>} sortKey="netResult" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
            <SortHeader label={<>ROI<InfoTooltip text={TIPS.roi} /></>} sortKey="roi" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
            <SortHeader label={<>Fiabilité<InfoTooltip text={TIPS.confidence} /></>} sortKey="confidence" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} />
            <SortHeader label={<>Recommandation<InfoTooltip text={TIPS.recommendation} /></>} sortKey="recommendation" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} />
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={`${r.format}-${r.stake}`}>
              <td>{r.format}</td>
              <td>{r.stake}</td>
              <td className="num">{r.tournamentsPlayed}</td>
              <td className="num">
                <ProfitBadge value={r.netResult} size="sm" />
              </td>
              <td className={`num ${r.roi >= 0 ? 'positive' : 'negative'}`}>{r.roi.toFixed(1)}%</td>
              <td>
                <span className={`confidence-${r.confidence}`}>{translateConfidence(r.confidence)}</span>
              </td>
              <td>
                <span className={`rec-${r.recommendation.replace(/\s/g, '-')}`}>{translateRec(r.recommendation)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
