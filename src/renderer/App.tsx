import { useState } from 'react';
import { Dashboard } from './pages/Dashboard.js';
import { Sessions } from './pages/Sessions.js';
import { Players } from './pages/Players.js';
import { LeakFinder } from './pages/LeakFinder.js';
import { GameSelection } from './pages/GameSelection.js';
import { Progress } from './pages/Progress.js';

type Page = 'dashboard' | 'sessions' | 'players' | 'leaks' | 'games' | 'progress';

export function App(): JSX.Element {
  const [page, setPage] = useState<Page>('dashboard');

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Poker Coach</h1>
          <p className="muted">Post-session analytics — bankroll first.</p>
        </div>
        <nav className="app-nav">
          <button className={page === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}>
            Bankroll
          </button>
          <button className={page === 'sessions' ? 'active' : ''} onClick={() => setPage('sessions')}>
            Sessions
          </button>
          <button className={page === 'players' ? 'active' : ''} onClick={() => setPage('players')}>
            Players
          </button>
          <button className={page === 'leaks' ? 'active' : ''} onClick={() => setPage('leaks')}>
            Leaks
          </button>
          <button className={page === 'games' ? 'active' : ''} onClick={() => setPage('games')}>
            Games
          </button>
          <button className={page === 'progress' ? 'active' : ''} onClick={() => setPage('progress')}>
            Progress
          </button>
        </nav>
      </header>
      <main className="app-main">
        {page === 'dashboard' && <Dashboard />}
        {page === 'sessions' && <Sessions />}
        {page === 'players' && <Players />}
        {page === 'leaks' && <LeakFinder />}
        {page === 'games' && <GameSelection />}
        {page === 'progress' && <Progress />}
      </main>
    </div>
  );
}
