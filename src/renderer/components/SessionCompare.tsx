import { useEffect, useState } from 'react';
import { pokerApi } from '../api.js';
import { Icon } from './Icon.js';

interface SessionSummary {
  date: string;
  tournaments: number;
  winnings: number;
  buy_ins: number;
  net: number;
  hands: number;
  avg_pot: number;
  win_rate: number;
}

export function SessionCompare(): JSX.Element {
  const [dates, setDates] = useState<string[]>([]);
  const [dateA, setDateA] = useState('');
  const [dateB, setDateB] = useState('');
  const [a, setA] = useState<SessionSummary | null>(null);
  const [b, setB] = useState<SessionSummary | null>(null);

  useEffect(() => {
    pokerApi.getSessions(200, 0).then((rows) => {
      setDates(rows.map((r) => r.session_date));
    });
  }, []);

  async function run(): Promise<void> {
    if (!dateA || !dateB) return;
    const res = await pokerApi.compareSessions(dateA, dateB);
    setA(res.a);
    setB(res.b);
  }

  return (
    <div className="card">
      <h3 className="card-title">Comparer deux sessions</h3>
      <div className="compare-controls">
        <select value={dateA} onChange={(e) => setDateA(e.target.value)}>
          <option value="">— session A —</option>
          {dates.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <span className="muted">vs</span>
        <select value={dateB} onChange={(e) => setDateB(e.target.value)}>
          <option value="">— session B —</option>
          {dates.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button className="ohmy-btn primary" onClick={run} disabled={!dateA || !dateB}>
          <Icon.Scale size={12} /> Comparer
        </button>
      </div>

      {a && b && (
        <table className="data-table compare-table">
          <thead>
            <tr>
              <th>Métrique</th>
              <th>{a.date}</th>
              <th>{b.date}</th>
              <th>Δ</th>
            </tr>
          </thead>
          <tbody>
            <CompareRow label="Tournois" a={a.tournaments} b={b.tournaments} />
            <CompareRow label="Mains" a={a.hands} b={b.hands} />
            <CompareRow label="Buy-ins" a={a.buy_ins} b={b.buy_ins} suffix="€" />
            <CompareRow label="Gains" a={a.winnings} b={b.winnings} suffix="€" />
            <CompareRow label="Net" a={a.net} b={b.net} suffix="€" />
            <CompareRow label="Pot moyen" a={a.avg_pot} b={b.avg_pot} suffix=" jetons" />
            <CompareRow label="Win rate" a={a.win_rate} b={b.win_rate} suffix="%" />
          </tbody>
        </table>
      )}
    </div>
  );
}

function CompareRow({ label, a, b, suffix = '' }: { label: string; a: number; b: number; suffix?: string }): JSX.Element {
  const delta = b - a;
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{a.toFixed(2)}{suffix}</td>
      <td className="num">{b.toFixed(2)}{suffix}</td>
      <td className={`num ${delta >= 0 ? 'positive' : 'negative'}`}>
        {delta >= 0 ? '+' : ''}{delta.toFixed(2)}{suffix}
      </td>
    </tr>
  );
}
