import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { pokerApi, type ProgressPoint } from '../api.js';
import { InfoTooltip } from '../components/InfoTooltip.js';
import { TIPS } from '../glossary.js';

export function Progress(): JSX.Element {
  const [data, setData] = useState<ProgressPoint[]>([]);
  const [granularity, setGranularity] = useState<'quarter' | 'month'>('quarter');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    pokerApi.getProgress(granularity).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [granularity]);

  if (loading) return <div className="loading">Loading progress…</div>;

  return (
    <div className="progress-page">
      <h2>Progress</h2>
      <div className="toolbar">
        <button className={granularity === 'quarter' ? 'active' : ''} onClick={() => setGranularity('quarter')}>
          By quarter
        </button>
        <button className={granularity === 'month' ? 'active' : ''} onClick={() => setGranularity('month')}>
          By month
        </button>
      </div>
      <div className="card">
        <h3 className="card-title">Net by period</h3>
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
        <h3 className="card-title">Detailed metrics</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>
                Period<InfoTooltip text={TIPS.period} />
              </th>
              <th className="num">
                Tournaments<InfoTooltip text={TIPS.tournaments} />
              </th>
              <th className="num">
                Net<InfoTooltip text={TIPS.netResult} />
              </th>
              <th className="num">
                ROI<InfoTooltip text={TIPS.roi} />
              </th>
              <th className="num">
                ITM%<InfoTooltip text={TIPS.itm} />
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
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
    </div>
  );
}
