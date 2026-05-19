import { useEffect, useState } from 'react';
import { pokerApi } from '../api.js';

interface Props {
  onSelect: (mode: 'poker' | 'paris') => void;
}

interface CombinedBankroll {
  pokerNet: number;
  tennisNet: number;
  tennisStaked: number;
  tennisPending: number;
}

export function Home({ onSelect }: Props): JSX.Element {
  const [bankroll, setBankroll] = useState<CombinedBankroll | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [poker, tennis] = await Promise.all([
          pokerApi.getBankrollSummary(),
          pokerApi.tennisBankrollSummary('roland_garros_2026')
        ]);
        setBankroll({
          pokerNet: poker.allTimeNet,
          tennisNet: tennis.allTimeNet,
          tennisStaked: tennis.totalStaked,
          tennisPending: tennis.betsPending
        });
      } catch {
        // bankroll widget is best-effort; renderer should still mount if IPC fails
      }
    })();
  }, []);

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

      {bankroll && <CombinedBankroll data={bankroll} />}

      <footer className="home-footer muted">
        Bankroll suivie séparément par domaine — placement manuel, pas d'auto-bet.
      </footer>
    </div>
  );
}

function CombinedBankroll({ data }: { data: CombinedBankroll }): JSX.Element {
  const combined = data.pokerNet + data.tennisNet;
  const sign = combined >= 0 ? 'pos' : 'neg';
  return (
    <section className="home-bankroll">
      <header>
        <h3>Bankroll combinée</h3>
        <span className="muted">net all-time tous domaines confondus</span>
      </header>
      <div className="home-bankroll-grid">
        <div className={`hb-cell hb-cell-combined hb-${sign}`}>
          <span className="hb-label">Total net</span>
          <span className="hb-value">{formatEur(combined)}</span>
          <span className="hb-sub">{data.pokerNet >= 0 ? '+' : ''}{formatEur(data.pokerNet)} poker · {data.tennisNet >= 0 ? '+' : ''}{formatEur(data.tennisNet)} tennis</span>
        </div>
        <div className={`hb-cell hb-${data.pokerNet >= 0 ? 'pos' : 'neg'}`}>
          <span className="hb-label">♠️ Poker</span>
          <span className="hb-value">{formatEur(data.pokerNet)}</span>
        </div>
        <div className={`hb-cell hb-${data.tennisNet >= 0 ? 'pos' : 'neg'}`}>
          <span className="hb-label">🎾 Tennis</span>
          <span className="hb-value">{formatEur(data.tennisNet)}</span>
          <span className="hb-sub">
            misé {formatEur(data.tennisStaked)}
            {data.tennisPending > 0 ? ` · ${data.tennisPending} en cours` : ''}
          </span>
        </div>
      </div>
    </section>
  );
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}
