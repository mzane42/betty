import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { pokerApi, type ProgressPoint } from '../api.js';
import { InfoTooltip } from '../components/InfoTooltip.js';
import { SortHeader, SearchBox } from '../components/SortHeader.js';
import { useTable } from '../lib/use-table.js';
import { TIPS } from '../glossary.js';

interface TimeBucket {
  bucket: 'morning' | 'afternoon' | 'evening' | 'night';
  tournaments: number;
  net: number;
  roi: number;
}
interface TimeAnalysis {
  buckets: TimeBucket[];
  tilt: { firstAvgRoi: number; lastAvgRoi: number; delta: number; multiSessionCount: number };
}

const BUCKET_LABEL: Record<TimeBucket['bucket'], string> = {
  morning: 'Matin (6-12h)',
  afternoon: 'Après-midi (12-18h)',
  evening: 'Soirée (18-24h)',
  night: 'Nuit (0-6h)'
};

export function Progress(): JSX.Element {
  const [data, setData] = useState<ProgressPoint[]>([]);
  const [granularity, setGranularity] = useState<'quarter' | 'month'>('quarter');
  const [loading, setLoading] = useState(true);
  const [timeData, setTimeData] = useState<TimeAnalysis | null>(null);

  useEffect(() => {
    setLoading(true);
    pokerApi.getProgress(granularity).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [granularity]);

  useEffect(() => {
    pokerApi.getTimeOfDay().then(setTimeData).catch(() => {});
  }, []);

  const table = useTable<ProgressPoint>(data, {
    defaultSort: { key: 'period', dir: 'desc' },
    searchFn: (p, q) => p.period.toLowerCase().includes(q)
  });

  if (loading) return <div className="loading">Chargement des progrès…</div>;

  return (
    <div className="progress-page">
      <h2>Progrès</h2>
      <div className="toolbar">
        <button className={granularity === 'quarter' ? 'active' : ''} onClick={() => setGranularity('quarter')}>
          Par trimestre
        </button>
        <button className={granularity === 'month' ? 'active' : ''} onClick={() => setGranularity('month')}>
          Par mois
        </button>
      </div>
      <div className="card">
        <h3 className="card-title">Net par période</h3>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" />
              <XAxis dataKey="period" stroke="#8b93a7" tick={{ fill: '#8b93a7', fontSize: 11 }} />
              <YAxis stroke="#8b93a7" tick={{ fill: '#8b93a7', fontSize: 11 }} tickFormatter={(v) => `${v}€`} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ background: '#1e2230', border: '1px solid #2a2f3d', borderRadius: 8 }}
                formatter={(v: number, n: string) => [
                  n === 'net' ? `${v.toFixed(2)}€` : n === 'roi' ? `${v.toFixed(1)}%` : `${v.toFixed(0)}`,
                  n
                ]}
              />
              <Bar dataKey="net">
                {data.map((entry, idx) => (
                  <Cell key={idx} fill={entry.net >= 0 ? '#4ade80' : '#f87171'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <div className="card-title-row">
          <h3 className="card-title">Métriques détaillées</h3>
          <SearchBox value={table.search} onChange={table.setSearch} placeholder="Période…" />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <SortHeader label={<>Période<InfoTooltip text={TIPS.period} /></>} sortKey="period" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} />
              <SortHeader label={<>Tournois<InfoTooltip text={TIPS.tournaments} /></>} sortKey="tournamentsPlayed" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
              <SortHeader label={<>Net<InfoTooltip text={TIPS.netResult} /></>} sortKey="net" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
              <SortHeader label={<>ROI<InfoTooltip text={TIPS.roi} /></>} sortKey="roi" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
              <SortHeader label={<>ITM%<InfoTooltip text={TIPS.itm} /></>} sortKey="itm" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
            </tr>
          </thead>
          <tbody>
            {table.rows.map((d) => (
              <tr key={d.period}>
                <td>{d.period}</td>
                <td className="num">{d.tournamentsPlayed}</td>
                <td className={`num ${d.net >= 0 ? 'positive' : 'negative'}`}>{d.net.toFixed(2)}€</td>
                <td className={`num ${d.roi >= 0 ? 'positive' : 'negative'}`}>{d.roi.toFixed(1)}%</td>
                <td className="num">{d.itm.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {timeData && timeData.buckets.some((b) => b.tournaments > 0) && (
        <div className="card">
          <h3 className="card-title">Quand tu joues le mieux</h3>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            ROI par tranche horaire (heure de début du tournoi).
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Période</th>
                <th className="num">Tournois</th>
                <th className="num">Net</th>
                <th className="num">ROI</th>
              </tr>
            </thead>
            <tbody>
              {timeData.buckets.map((b) => (
                <tr key={b.bucket}>
                  <td>{BUCKET_LABEL[b.bucket]}</td>
                  <td className="num">{b.tournaments}</td>
                  <td className={`num ${b.net >= 0 ? 'positive' : 'negative'}`}>{b.net.toFixed(2)}€</td>
                  <td className={`num ${b.roi >= 0 ? 'positive' : 'negative'}`}>{b.roi.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          {timeData.tilt.multiSessionCount >= 3 && (
            <div className="tilt-callout">
              <div className="tilt-header">
                <strong>Détection tilt fin de session</strong>
                <span className="muted">({timeData.tilt.multiSessionCount} sessions multi-tournois)</span>
              </div>
              <div className="tilt-stats">
                <div>
                  <span className="muted">Premier tournoi</span>
                  <strong className={timeData.tilt.firstAvgRoi >= 0 ? 'positive' : 'negative'}>
                    {timeData.tilt.firstAvgRoi.toFixed(1)}% ROI
                  </strong>
                </div>
                <div>
                  <span className="muted">Dernier tournoi</span>
                  <strong className={timeData.tilt.lastAvgRoi >= 0 ? 'positive' : 'negative'}>
                    {timeData.tilt.lastAvgRoi.toFixed(1)}% ROI
                  </strong>
                </div>
                <div>
                  <span className="muted">Delta</span>
                  <strong className={timeData.tilt.delta >= 0 ? 'positive' : 'negative'}>
                    {timeData.tilt.delta > 0 ? '+' : ''}{timeData.tilt.delta.toFixed(1)}%
                  </strong>
                </div>
              </div>
              {timeData.tilt.delta < -10 && (
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  ⚠️ Ton ROI baisse fortement entre le 1er et le dernier tournoi. Signe de tilt/fatigue. Pense à arrêter plus tôt ou faire des pauses.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
