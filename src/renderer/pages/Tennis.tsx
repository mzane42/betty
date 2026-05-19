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
  type TennisBankrollSummaryRow,
  type TennisBetRow,
  type TennisGeneratePickInput,
  type TennisPickRow,
  type TennisBankrollPointRow
} from '../api.js';
import { TennisPickCard } from '../components/TennisPickCard.js';
import { TennisNewPickForm } from '../components/TennisNewPickForm.js';
import { TennisBankrollHero } from '../components/TennisBankrollHero.js';
import { toast } from '../lib/toast.js';

const ROLAND_GARROS = 'roland_garros_2026';

type Tab = 'today' | 'new' | 'history' | 'bankroll';

export function Tennis(): JSX.Element {
  const [tab, setTab] = useState<Tab>('today');
  const [picks, setPicks] = useState<TennisPickRow[]>([]);
  const [bets, setBets] = useState<TennisBetRow[]>([]);
  const [summary, setSummary] = useState<TennisBankrollSummaryRow | null>(null);
  const [chart, setChart] = useState<TennisBankrollPointRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refreshAll(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [p, b, s, c] = await Promise.all([
        pokerApi.tennisListPicksForDay(ROLAND_GARROS, today, 'PLAY'),
        pokerApi.tennisListBets(),
        pokerApi.tennisBankrollSummary(ROLAND_GARROS),
        pokerApi.tennisBankrollChart()
      ]);
      setPicks(p);
      setBets(b);
      setSummary(s);
      setChart(c);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  async function handleGeneratePick(input: TennisGeneratePickInput): Promise<void> {
    try {
      const res = await pokerApi.tennisGeneratePick(input);
      toast.success(
        res.worthPlacing
          ? `Pick ${res.pick.verdict} généré (score ${res.pick.signalScore})`
          : `Pick SKIP enregistré (edge/score trop faible)`
      );
      await refreshAll();
      setTab('today');
    } catch (err) {
      toast.error(`Erreur génération pick: ${(err as Error).message}`);
    }
  }

  async function handlePlaceBet(
    pick: TennisPickRow,
    stakeEur: number
  ): Promise<void> {
    try {
      await pokerApi.tennisPlaceBet({
        pickId: pick.pickId,
        matchId: pick.matchId,
        selection: pick.selection,
        book: pick.bestBook,
        decimalOdds: pick.bookDecimalOdds,
        stakeEur
      });
      toast.success(`Bet ${stakeEur.toFixed(2)}€ enregistré sur ${pick.bestBook}`);
      await refreshAll();
    } catch (err) {
      toast.error(`Erreur place bet: ${(err as Error).message}`);
    }
  }

  if (loading) return <div className="loading">Chargement tennis…</div>;
  if (error) return <div className="error">Erreur : {error}</div>;

  return (
    <div className="tennis-page">
      <div className="tennis-header">
        <div>
          <h2>Tennis — Roland Garros 2026</h2>
          <p className="muted">
            Analyse post-session, picks +EV suggérés, placement manuel sur Winamax / Betclic /
            Unibet.
          </p>
        </div>
        <button className="primary" onClick={() => void refreshAll()}>
          ↻ Rafraîchir
        </button>
      </div>

      <nav className="tennis-nav">
        <button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}>
          Picks du jour
        </button>
        <button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>
          Nouveau pick
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          Historique
        </button>
        <button className={tab === 'bankroll' ? 'active' : ''} onClick={() => setTab('bankroll')}>
          Bankroll tennis
        </button>
      </nav>

      {tab === 'today' && (
        <section className="tennis-picks">
          <h3>Picks aujourd'hui ({picks.length})</h3>
          {picks.length === 0 ? (
            <div className="empty-state">
              <p>Aucun pick pour aujourd'hui.</p>
              <p className="muted">
                Va dans <strong>Nouveau pick</strong> pour entrer un match manuellement, ou attends
                que le daemon tourne (T-6h batch quotidien).
              </p>
              <button className="primary" onClick={() => setTab('new')}>
                + Nouveau pick
              </button>
            </div>
          ) : (
            <div className="tennis-pick-list">
              {picks.map((p) => (
                <TennisPickCard key={p.pickId} pick={p} onPlaceBet={handlePlaceBet} />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'new' && (
        <section className="tennis-new">
          <h3>Entrer un pick manuellement</h3>
          <p className="muted">
            Saisis les joueurs, leurs classements ATP/WTA, et les cotes proposées. Le modèle calcule
            la prob et le verdict en direct ; tu valides et tu places ensuite sur ton book.
          </p>
          <TennisNewPickForm onSubmit={handleGeneratePick} />
        </section>
      )}

      {tab === 'history' && (
        <section className="tennis-history">
          <h3>Bets placés ({bets.length})</h3>
          {bets.length === 0 ? (
            <p className="muted">Aucun bet placé pour le moment.</p>
          ) : (
            <table className="tennis-bet-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sélection</th>
                  <th>Book</th>
                  <th>Cote</th>
                  <th>Mise (€)</th>
                  <th>Résultat</th>
                  <th>P&L (€)</th>
                  <th>CLV</th>
                </tr>
              </thead>
              <tbody>
                {bets.map((b) => (
                  <tr key={b.betId} className={`bet-row bet-${b.result ?? 'pending'}`}>
                    <td>{b.placedAt.slice(0, 10)}</td>
                    <td>{b.selection}</td>
                    <td>{b.book}</td>
                    <td>{b.decimalOdds.toFixed(2)}</td>
                    <td>{b.stakeEur.toFixed(2)}</td>
                    <td>{b.result ?? 'pending'}</td>
                    <td>{b.pnlEur != null ? b.pnlEur.toFixed(2) : '—'}</td>
                    <td>
                      {b.closingOdds != null && b.closingOdds > 1
                        ? `${(((b.decimalOdds - b.closingOdds) / b.closingOdds) * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'bankroll' && summary && (
        <section className="tennis-bankroll">
          <TennisBankrollHero summary={summary} />
          <h3>Évolution cumulée</h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="cumulativeNet"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}
