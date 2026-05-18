import { useEffect, useState } from 'react';
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

export function Dashboard(): JSX.Element {
  const [summary, setSummary] = useState<BankrollSummary | null>(null);
  const [yearly, setYearly] = useState<YearlyBankroll[]>([]);
  const [monthly, setMonthly] = useState<MonthlyBankroll[]>([]);
  const [chart, setChart] = useState<BankrollPoint[]>([]);
  const [roi, setRoi] = useState<RoiByFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      pokerApi.getBankrollSummary(),
      pokerApi.getYearlyBankroll(),
      pokerApi.getMonthlyBankroll(),
      pokerApi.getBankrollChart(),
      pokerApi.getRoiByFormat()
    ])
      .then(([s, y, m, c, r]) => {
        setSummary(s);
        setYearly(y);
        setMonthly(m);
        setChart(c);
        setRoi(r);
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
      <div className="grid-2">
        <YearlyChart data={yearly} />
        <MonthlyHeatmap data={monthly} />
      </div>
      <BankrollChart data={chart} />
      <RoiByFormatTable data={roi} />
    </div>
  );
}
