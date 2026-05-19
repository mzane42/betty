import { useState } from 'react';
import { Dashboard } from './pages/Dashboard.js';
import { Sessions } from './pages/Sessions.js';
import { SessionDetail } from './pages/SessionDetail.js';
import { Players } from './pages/Players.js';
import { LeakFinder } from './pages/LeakFinder.js';
import { GameSelection } from './pages/GameSelection.js';
import { Progress } from './pages/Progress.js';
import { HandSearch } from './pages/HandSearch.js';
import { PlayerDetail } from './pages/PlayerDetail.js';
import { Tennis } from './pages/Tennis.js';
import { CoachSidebar } from './components/CoachSidebar.js';
import { ToastHost } from './components/ToastHost.js';
import { AccountSwitcher } from './components/AccountSwitcher.js';
import { Icon } from './components/Icon.js';
import { pokerApi } from './api.js';
import { toast } from './lib/toast.js';

type Page = 'dashboard' | 'sessions' | 'players' | 'leaks' | 'games' | 'progress' | 'search' | 'tennis';

const SIDEBAR_COLLAPSED_KEY = 'pokerCoach.sidebarCollapsed';
const SIDEBAR_WIDTH_KEY = 'pokerCoach.sidebarWidth';

export function App(): JSX.Element {
  const [page, setPage] = useState<Page>('dashboard');
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

  function navigate(p: Page): void {
    setSelectedSession(null);
    setSelectedPlayer(null);
    setPage(p);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Poker Coach</h1>
          <p className="muted">Analyse post-session — la bankroll avant tout.</p>
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
            className={page === 'tennis' ? 'active tennis-tab' : 'tennis-tab'}
            onClick={() => navigate('tennis')}
            title="Tennis — Roland Garros 2026"
          >
            🎾 Tennis
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
          {page === 'tennis' && <Tennis />}
        </main>
        <CoachSidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          width={sidebarWidth}
          onResize={updateWidth}
        />
      </div>
      <ToastHost />
    </div>
  );
}
