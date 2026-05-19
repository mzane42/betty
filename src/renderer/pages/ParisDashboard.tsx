import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  pokerApi,
  type TennisBankrollPointRow,
  type TennisBankrollSummaryRow,
  type TennisBetRow,
  type TennisPickAuditRowDto,
  type TennisRiskGateStatus
} from '../api.js';
import { TennisBankrollHero } from '../components/TennisBankrollHero.js';
import { TennisRiskBanner } from '../components/TennisRiskBanner.js';
import { Icon } from '../components/Icon.js';

const ROLAND_GARROS = 'roland_garros_2026';

interface Props {
  onNavigate: (tab: 'feed' | 'audit' | 'history' | 'bankroll' | 'new') => void;
}

export function ParisDashboard({ onNavigate }: Props): JSX.Element {
  const [summary, setSummary] = useState<TennisBankrollSummaryRow | null>(null);
  const [chart, setChart] = useState<TennisBankrollPointRow[]>([]);
  const [risk, setRisk] = useState<TennisRiskGateStatus | null>(null);
  const [audit, setAudit] = useState<TennisPickAuditRowDto[]>([]);
  const [bets, setBets] = useState<TennisBetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const [s, c, rg, a, b] = await Promise.all([
        pokerApi.tennisBankrollSummary(ROLAND_GARROS),
        pokerApi.tennisBankrollChart(),
        pokerApi.tennisRiskStatus(),
        pokerApi.tennisAuditDay(),
        pokerApi.tennisListBets()
      ]);
      setSummary(s);
      setChart(c);
      setRisk(rg);
      setAudit(a);
      setBets(b);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <div className="loading">Chargement…</div>;
  if (error) return <div className="error">Erreur : {error}</div>;

  const counts = {
    STRONG: audit.filter((r) => r.verdict === 'STRONG').length,
    PLAY: audit.filter((r) => r.verdict === 'PLAY').length,
    SKIP: audit.filter((r) => r.verdict === 'SKIP').length
  };
  const pendingBets = bets.filter((b) => b.result == null);
  const todayBets = bets.filter((b) => b.placedAt.slice(0, 10) === new Date().toISOString().slice(0, 10));
  const todayPnl = todayBets.reduce((sum, b) => sum + (b.pnlEur ?? 0), 0);

  return (
    <div className="paris-dashboard">
      {risk && <TennisRiskBanner status={risk} onChange={load} />}

      {summary && <TennisBankrollHero summary={summary} />}

      <div className="paris-tiles">
        <button className="paris-tile" onClick={() => onNavigate('feed')}>
          <span className="paris-tile-label">Scans aujourd'hui</span>
          <span className="paris-tile-value">{audit.length}</span>
          <span className="paris-tile-sub">
            {counts.STRONG} STRONG · {counts.PLAY} PLAY · {counts.SKIP} SKIP
          </span>
        </button>

        <button className="paris-tile" onClick={() => onNavigate('history')}>
          <span className="paris-tile-label">Bets en cours</span>
          <span className="paris-tile-value">{pendingBets.length}</span>
          <span className="paris-tile-sub">
            {pendingBets.length === 0 ? 'Rien à régler' : 'À settler après le match'}
          </span>
        </button>

        <button className="paris-tile" onClick={() => onNavigate('history')}>
          <span className="paris-tile-label">P&amp;L aujourd'hui</span>
          <span className={`paris-tile-value ${todayPnl >= 0 ? 'pos' : 'neg'}`}>
            {todayPnl >= 0 ? '+' : ''}
            {todayPnl.toFixed(2)}€
          </span>
          <span className="paris-tile-sub">
            {todayBets.length} bet{todayBets.length > 1 ? 's' : ''} placé{todayBets.length > 1 ? 's' : ''}
          </span>
        </button>

        <button className="paris-tile" onClick={() => onNavigate('bankroll')}>
          <span className="paris-tile-label">ROI cumulé</span>
          <span className={`paris-tile-value ${summary && summary.roi >= 0 ? 'pos' : 'neg'}`}>
            {summary ? `${summary.roi.toFixed(1)}%` : '—'}
          </span>
          <span className="paris-tile-sub">
            sur {summary ? summary.betsWon + summary.betsLost + summary.betsVoid : 0} bet(s)
          </span>
        </button>
      </div>

      <section className="paris-chart-card">
        <header>
          <h3>Évolution cumulée</h3>
          <button className="link" onClick={() => onNavigate('bankroll')}>
            Détails →
          </button>
        </header>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="cumulativeNet" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="paris-quick-actions">
        <h3>Actions rapides</h3>
        <div className="paris-actions-row">
          <button className="primary" onClick={() => onNavigate('feed')}>
            <Icon.Bot size={14} /> Voir picks du jour
          </button>
          <button onClick={() => onNavigate('audit')}>
            <Icon.FileText size={14} /> Audit complet
          </button>
          <button onClick={() => onNavigate('new')}>
            <Icon.Pencil size={14} /> Pick manuel
          </button>
          <button onClick={() => onNavigate('history')}>
            <Icon.BarChart size={14} /> Historique bets
          </button>
        </div>
      </section>
    </div>
  );
}
