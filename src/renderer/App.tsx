import { useEffect, useState } from 'react';
import { Dashboard } from './pages/Dashboard.js';
import { Sessions } from './pages/Sessions.js';
import { SessionDetail } from './pages/SessionDetail.js';
import { Players } from './pages/Players.js';
import { LeakFinder } from './pages/LeakFinder.js';
import { GameSelection } from './pages/GameSelection.js';
import { Progress } from './pages/Progress.js';
import { HandSearch } from './pages/HandSearch.js';
import { PlayerDetail } from './pages/PlayerDetail.js';
import { Home } from './pages/Home.js';
import { ParisDashboard } from './pages/ParisDashboard.js';
import { CoachSidebar } from './components/CoachSidebar.js';
import { ToastHost } from './components/ToastHost.js';
import { AccountSwitcher } from './components/AccountSwitcher.js';
import { Icon } from './components/Icon.js';
import { TennisCuratorFeed } from './components/TennisCuratorFeed.js';
import { TennisAuditTable } from './components/TennisAuditTable.js';
import { TennisNewPickForm } from './components/TennisNewPickForm.js';
import { TennisPickCard } from './components/TennisPickCard.js';
import { TennisBankrollHero } from './components/TennisBankrollHero.js';
import { TennisRiskBanner } from './components/TennisRiskBanner.js';
import { SettleControls } from './components/TennisSettleControls.js';
import { BetReviewCell } from './components/BetReviewCell.js';
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
  type TennisGeneratePickInput,
  type TennisPickRow,
  type TennisRiskGateStatus
} from './api.js';
import { toast } from './lib/toast.js';

type Mode = 'home' | 'poker' | 'paris';
type PokerPage = 'dashboard' | 'sessions' | 'players' | 'leaks' | 'games' | 'progress' | 'search';
type ParisPage = 'dashboard' | 'feed' | 'audit' | 'new' | 'history' | 'bankroll';

const MODE_KEY = 'pokerCoach.mode';
const SIDEBAR_COLLAPSED_KEY = 'pokerCoach.sidebarCollapsed';
const SIDEBAR_WIDTH_KEY = 'pokerCoach.sidebarWidth';
const PARIS_SIDEBAR_COLLAPSED_KEY = 'pokerCoach.sidebarCollapsed.paris';
const PARIS_SIDEBAR_WIDTH_KEY = 'pokerCoach.sidebarWidth.paris';
const ROLAND_GARROS = 'roland_garros_2026';

export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>(
    () => (localStorage.getItem(MODE_KEY) as Mode) || 'home'
  );

  function switchMode(m: Mode): void {
    setMode(m);
    if (m === 'home') localStorage.removeItem(MODE_KEY);
    else localStorage.setItem(MODE_KEY, m);
  }

  if (mode === 'home') {
    return (
      <div className="app-shell">
        <main className="app-main app-main-home">
          <Home onSelect={switchMode} />
        </main>
        <ToastHost />
      </div>
    );
  }

  if (mode === 'paris') {
    return (
      <>
        <ParisShell onBackHome={() => switchMode('home')} />
        <ToastHost />
      </>
    );
  }

  return (
    <>
      <PokerShell onBackHome={() => switchMode('home')} />
      <ToastHost />
    </>
  );
}

function PokerShell({ onBackHome }: { onBackHome: () => void }): JSX.Element {
  const [page, setPage] = useState<PokerPage>('dashboard');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  );
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return stored ? Math.max(320, Math.min(900, Number(stored))) : 460;
  });

  function toggleSidebar(): void {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
  }

  function updateWidth(w: number): void {
    setSidebarWidth(w);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
  }

  function navigate(p: PokerPage): void {
    setSelectedSession(null);
    setSelectedPlayer(null);
    setPage(p);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <button className="back-home-btn" onClick={onBackHome} title="Retour à l'accueil">
            ← Domaines
          </button>
          <div>
            <h1>♠️ Poker Coach</h1>
            <p className="muted">Analyse post-session — la bankroll avant tout.</p>
          </div>
        </div>
        <nav className="app-nav">
          <button className={page === 'dashboard' ? 'active' : ''} onClick={() => navigate('dashboard')}>
            Bankroll
          </button>
          <button className={page === 'sessions' ? 'active' : ''} onClick={() => navigate('sessions')}>
            Sessions
          </button>
          <button className={page === 'players' ? 'active' : ''} onClick={() => navigate('players')}>
            Adversaires
          </button>
          <button className={page === 'leaks' ? 'active' : ''} onClick={() => navigate('leaks')}>
            Fuites
          </button>
          <button className={page === 'games' ? 'active' : ''} onClick={() => navigate('games')}>
            Jeux
          </button>
          <button className={page === 'progress' ? 'active' : ''} onClick={() => navigate('progress')}>
            Progrès
          </button>
          <button className={page === 'search' ? 'active' : ''} onClick={() => navigate('search')}>
            <Icon.Search size={14} /> Recherche
          </button>
          <button
            className="backup-btn"
            onClick={async () => {
              const res = await pokerApi.backupDb();
              if (res.saved) toast.success(`Backup sauvegardé: ${res.path}`);
              else if (res.error) toast.error(`Erreur backup: ${res.error}`);
            }}
            title="Sauvegarder la DB SQLite"
          >
            <Icon.Save size={14} />
          </button>
          <AccountSwitcher />
        </nav>
      </header>
      <div className="app-body">
        <main className="app-main">
          {page === 'dashboard' && <Dashboard />}
          {page === 'sessions' && !selectedSession && <Sessions onSelect={(d) => setSelectedSession(d)} />}
          {page === 'sessions' && selectedSession && (
            <SessionDetail sessionDate={selectedSession} onBack={() => setSelectedSession(null)} />
          )}
          {page === 'players' && !selectedPlayer && <Players onSelect={(name) => setSelectedPlayer(name)} />}
          {page === 'players' && selectedPlayer && (
            <PlayerDetail playerName={selectedPlayer} onBack={() => setSelectedPlayer(null)} />
          )}
          {page === 'leaks' && <LeakFinder />}
          {page === 'games' && <GameSelection />}
          {page === 'progress' && <Progress />}
          {page === 'search' && <HandSearch />}
        </main>
        <CoachSidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          width={sidebarWidth}
          onResize={updateWidth}
        />
      </div>
    </div>
  );
}

function ParisShell({ onBackHome }: { onBackHome: () => void }): JSX.Element {
  const [tab, setTab] = useState<ParisPage>('dashboard');
  const [picks, setPicks] = useState<TennisPickRow[]>([]);
  const [bets, setBets] = useState<TennisBetRow[]>([]);
  const [summary, setSummary] = useState<TennisBankrollSummaryRow | null>(null);
  const [chart, setChart] = useState<TennisBankrollPointRow[]>([]);
  const [risk, setRisk] = useState<TennisRiskGateStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(PARIS_SIDEBAR_COLLAPSED_KEY) === '1'
  );
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem(PARIS_SIDEBAR_WIDTH_KEY);
    return stored ? Math.max(320, Math.min(900, Number(stored))) : 460;
  });

  function toggleSidebar(): void {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem(PARIS_SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
  }

  function updateSidebarWidth(w: number): void {
    setSidebarWidth(w);
    localStorage.setItem(PARIS_SIDEBAR_WIDTH_KEY, String(w));
  }

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [p, b, s, c, rg] = await Promise.all([
        pokerApi.tennisListPicksForDay(ROLAND_GARROS, today, 'PLAY'),
        pokerApi.tennisListBets(),
        pokerApi.tennisBankrollSummary(ROLAND_GARROS),
        pokerApi.tennisBankrollChart(),
        pokerApi.tennisRiskStatus()
      ]);
      setPicks(p);
      setBets(b);
      setSummary(s);
      setChart(c);
      setRisk(rg);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab !== 'dashboard') void refresh();
  }, [tab]);

  async function handleGeneratePick(input: TennisGeneratePickInput): Promise<void> {
    try {
      const res = await pokerApi.tennisGeneratePick(input);
      toast.success(
        res.worthPlacing
          ? `Pick ${res.pick.verdict} généré (score ${res.pick.signalScore})`
          : `Pick SKIP enregistré (edge/score trop faible)`
      );
      await refresh();
      setTab('feed');
    } catch (err) {
      toast.error(`Erreur génération pick: ${(err as Error).message}`);
    }
  }

  async function handlePlaceBet(pick: TennisPickRow, stakeEur: number): Promise<void> {
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
      await refresh();
    } catch (err) {
      toast.error(`Erreur place bet: ${(err as Error).message}`);
    }
  }

  return (
    <div className="app-shell paris-shell">
      <header className="app-header paris-header">
        <div className="app-header-left">
          <button className="back-home-btn" onClick={onBackHome} title="Retour à l'accueil">
            ← Domaines
          </button>
          <div>
            <h1>🎾 Paris sportifs</h1>
            <p className="muted">Tennis Roland Garros 2026 — picks +EV, placement manuel Unibet.</p>
          </div>
        </div>
        <nav className="app-nav">
          <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
            Dashboard
          </button>
          <button className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}>
            🤖 Aujourd'hui
          </button>
          <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>
            Audit
          </button>
          <button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>
            Pick manuel
          </button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            Historique
          </button>
          <button className={tab === 'bankroll' ? 'active' : ''} onClick={() => setTab('bankroll')}>
            Bankroll
          </button>
        </nav>
      </header>

      <div className="app-body">
      <main className="app-main paris-main">
        {tab === 'dashboard' && <ParisDashboard onNavigate={(t) => setTab(t)} />}

        {tab !== 'dashboard' && loading && <div className="loading">Chargement…</div>}
        {tab !== 'dashboard' && error && <div className="error">Erreur : {error}</div>}

        {tab === 'feed' && !loading && !error && (
          <>
            {risk && <TennisRiskBanner status={risk} onChange={refresh} />}
            <TennisCuratorFeed
              onChange={refresh}
              riskStakeMultiplier={risk?.stakeMultiplier ?? 1}
              bankrollEur={risk?.config.bankrollEur ?? 200}
            />
            {picks.length > 0 && (
              <section className="tennis-picks">
                <h3>Picks retenus aujourd'hui ({picks.length})</h3>
                <div className="tennis-pick-list">
                  {picks.map((p) => (
                    <TennisPickCard key={p.pickId} pick={p} onPlaceBet={handlePlaceBet} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {tab === 'audit' && !loading && !error && <TennisAuditTable />}

        {tab === 'new' && !loading && !error && (
          <section className="tennis-new">
            <h3>Entrer un pick manuellement</h3>
            <p className="muted">
              Saisis les joueurs, classements ATP/WTA, et cotes. Le modèle calcule la prob et le verdict
              en direct.
            </p>
            <TennisNewPickForm onSubmit={handleGeneratePick} />
          </section>
        )}

        {tab === 'history' && !loading && !error && (
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
                    <th>P&amp;L (€)</th>
                    <th>CLV</th>
                    <th>Review</th>
                    <th>Action</th>
                    <th></th>
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
                      <td>
                        <BetReviewCell bet={b} />
                      </td>
                      <td>
                        {b.result == null ? (
                          <SettleControls bet={b} onSettled={refresh} />
                        ) : (
                          <span className="muted">réglé</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="bet-delete-btn"
                          title="Supprimer ce bet (erreur de saisie)"
                          onClick={async () => {
                            if (!confirm(`Supprimer le bet ${b.selection} @${b.decimalOdds} (${b.stakeEur}€) ?`))
                              return;
                            const res = await pokerApi.tennisDeleteBet(b.betId);
                            if (res.deleted) {
                              toast.success('Bet supprimé');
                              await refresh();
                            } else {
                              toast.error('Suppression échouée');
                            }
                          }}
                        >
                          <Icon.Trash size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {tab === 'bankroll' && !loading && !error && summary && (
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
      </main>
        <CoachSidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          width={sidebarWidth}
          onResize={updateSidebarWidth}
          domain="paris"
        />
      </div>
    </div>
  );
}
