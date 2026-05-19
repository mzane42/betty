import { useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type {
  BankrollPoint,
  BankrollSummary,
  MonthlyBankroll,
  RoiByFormat,
  YearlyBankroll
} from '../../types/bankroll.js';
import { pokerApi } from '../api.js';
import { BankrollHero } from '../components/BankrollHero.js';
import { BankrollChart } from '../components/BankrollChart.js';
import { YearlyChart } from '../components/YearlyChart.js';
import { MonthlyHeatmap } from '../components/MonthlyHeatmap.js';
import { RoiByFormatTable } from '../components/RoiByFormatTable.js';
import { DashboardTrackers } from '../components/DashboardTrackers.js';
import { VarianceSim } from '../components/VarianceSim.js';
import { SessionCompare } from '../components/SessionCompare.js';
import { RangeGrid } from '../components/RangeGrid.js';

interface EvPoint {
  date: string;
  actual_net: number;
  ev_net: number;
  cumulative_actual: number;
  cumulative_ev: number;
}

export function Dashboard(): JSX.Element {
  const [summary, setSummary] = useState<BankrollSummary | null>(null);
  const [yearly, setYearly] = useState<YearlyBankroll[]>([]);
  const [monthly, setMonthly] = useState<MonthlyBankroll[]>([]);
  const [chart, setChart] = useState<BankrollPoint[]>([]);
  const [roi, setRoi] = useState<RoiByFormat[]>([]);
  const [evChart, setEvChart] = useState<EvPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      pokerApi.getBankrollSummary(),
      pokerApi.getYearlyBankroll(),
      pokerApi.getMonthlyBankroll(),
      pokerApi.getBankrollChart(),
      pokerApi.getRoiByFormat(),
      pokerApi.getEvBankroll()
    ])
      .then(([s, y, m, c, r, ev]) => {
        setSummary(s);
        setYearly(y);
        setMonthly(m);
        setChart(c);
        setRoi(r);
        setEvChart(ev);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="loading">Chargement de la bankroll…</div>;
  if (error) return <div className="error">Erreur : {error}</div>;
  if (!summary) return <div className="error">Aucune donnée</div>;

  return (
    <div className="dashboard">
      <BankrollHero summary={summary} />
      <DashboardTrackers />
      <div className="grid-2">
        <YearlyChart data={yearly} />
        <MonthlyHeatmap data={monthly} />
      </div>
      <BankrollChart data={chart} />
      <EvVsActualChart data={evChart} />
      <RangeGrid />
      <SessionCompare />
      <VarianceSim />
      <RoiByFormatTable data={roi} />
    </div>
  );
}

function EvVsActualChart({ data }: { data: EvPoint[] }): JSX.Element | null {
  if (data.length === 0) return null;
  const last = data[data.length - 1]!;
  const luck = last.cumulative_actual - last.cumulative_ev;

  return (
    <div className="card">
      <div className="card-title-row">
        <h3 className="card-title">
          Bankroll réelle vs EV (équity-fair)
        </h3>
        <span className={`muted`} style={{ fontSize: 12 }}>
          Variance cumulée:{' '}
          <strong className={luck >= 0 ? 'positive' : 'negative'}>
            {luck > 0 ? '+' : ''}{luck.toFixed(0)} jetons
          </strong>{' '}
          ({luck >= 0 ? 'tu as eu de la chance' : 'tu as eu de la malchance'})
        </span>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 16 }}>
        Ligne pleine = chips réels. Ligne pointillée = ce que tu aurais gagné si chaque all-in réalisait exactement son équity.
      </p>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" />
            <XAxis dataKey="date" stroke="#8b93a7" tick={{ fill: '#8b93a7', fontSize: 11 }} />
            <YAxis stroke="#8b93a7" tick={{ fill: '#8b93a7', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#1e2230', border: '1px solid #2a2f3d', borderRadius: 8 }}
              formatter={(v: number, n: string) => [Math.round(v).toLocaleString('fr-FR') + ' jetons', n]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="cumulative_actual" name="Réel" stroke="#4ade80" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="cumulative_ev" name="EV (variance-free)" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
