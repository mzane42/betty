import { useState } from 'react';
import { Dashboard } from './pages/Dashboard.js';
import { Sessions } from './pages/Sessions.js';
import { SessionDetail } from './pages/SessionDetail.js';
import { Players } from './pages/Players.js';
import { LeakFinder } from './pages/LeakFinder.js';
import { GameSelection } from './pages/GameSelection.js';
import { Progress } from './pages/Progress.js';

type Page = 'dashboard' | 'sessions' | 'players' | 'leaks' | 'games' | 'progress';

export function App(): JSX.Element {
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

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
      </main>
    </div>
  );
}
