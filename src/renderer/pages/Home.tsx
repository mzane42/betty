interface Props {
  onSelect: (mode: 'poker' | 'paris') => void;
}

export function Home({ onSelect }: Props): JSX.Element {
  return (
    <div className="home-page">
      <header className="home-hero">
        <h1>Coach</h1>
        <p className="muted">Choisis ton domaine d'analyse.</p>
      </header>

      <div className="home-cards">
        <button className="home-card home-card-poker" onClick={() => onSelect('poker')}>
          <span className="home-card-emoji">♠️</span>
          <h2>Poker</h2>
          <p>Analyse post-session Winamax Expresso. Bankroll, sessions, adversaires, fuites, hand reviews.</p>
          <ul>
            <li>19 562 mains importées</li>
            <li>2 057 adversaires trackés</li>
            <li>Coach Claude FR par session</li>
          </ul>
          <span className="home-card-cta">Entrer →</span>
        </button>

        <button className="home-card home-card-paris" onClick={() => onSelect('paris')}>
          <span className="home-card-emoji">🎾</span>
          <h2>Paris sportifs</h2>
          <p>Picks +EV tennis sur Unibet. Curator Claude quotidien, audit live, bankroll dédiée, risk gate.</p>
          <ul>
            <li>Roland Garros 2026 actif</li>
            <li>Scan auto T-24h / T-6h / T-1h</li>
            <li>Kelly fractionné 1/4, cap 2%</li>
          </ul>
          <span className="home-card-cta">Entrer →</span>
        </button>
      </div>

      <footer className="home-footer muted">
        Bankroll suivie séparément par domaine — placement manuel, pas d'auto-bet.
      </footer>
    </div>
  );
}
