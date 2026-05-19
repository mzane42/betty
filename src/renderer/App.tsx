import { useEffect, useState } from 'react';
import { Dashboard } from './pages/Dashboard.js';
import { Sessions } from './pages/Sessions.js';
import { SessionDetail } from './pages/SessionDetail.js';
import { Players } from './pages/Players.js';
import { LeakFinder } from './pages/LeakFinder.js';
import { GameSelection } from './pages/GameSelection.js';
import { Progress } from './pages/Progress.js';
import { Coach } from './pages/Coach.js';

type Page = 'dashboard' | 'sessions' | 'players' | 'leaks' | 'games' | 'progress' | 'coach';

const AUTO_COACH_KEY = 'pokerCoach.autoOpenTerminal';

export function App(): JSX.Element {
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [autoCoach, setAutoCoach] = useState(() => localStorage.getItem(AUTO_COACH_KEY) === '1');

  useEffect(() => {
    if (autoCoach) setPage('coach');
    // run once at mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleAutoCoach(): void {
    const next = !autoCoach;
    setAutoCoach(next);
    localStorage.setItem(AUTO_COACH_KEY, next ? '1' : '0');
  }

  function navigate(p: Page): void {
    setSelectedSession(null);
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
          <span className="nav-sep" />
          <button
            className={`coach-btn ${page === 'coach' ? 'active' : ''}`}
            onClick={() => navigate('coach')}
            title="Terminal Claude intégré dans l'app"
          >
            ✨ Coach
          </button>
          <label className="auto-coach-toggle" title="Auto-ouvrir au démarrage">
            <input type="checkbox" checked={autoCoach} onChange={toggleAutoCoach} />
            Auto
          </label>
        </nav>
      </header>
      <main className="app-main">
        {page === 'dashboard' && <Dashboard />}
        {page === 'sessions' && !selectedSession && <Sessions onSelect={(d) => setSelectedSession(d)} />}
        {page === 'sessions' && selectedSession && (
          <SessionDetail sessionDate={selectedSession} onBack={() => setSelectedSession(null)} />
        )}
        {page === 'players' && <Players />}
        {page === 'leaks' && <LeakFinder />}
        {page === 'games' && <GameSelection />}
        {page === 'progress' && <Progress />}
        {page === 'coach' && <Coach />}
      </main>
    </div>
  );
}
