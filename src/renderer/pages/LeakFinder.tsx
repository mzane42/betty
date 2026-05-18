import { useEffect, useState } from 'react';
import { pokerApi, type Leak } from '../api.js';

export function LeakFinder(): JSX.Element {
  const [leaks, setLeaks] = useState<Leak[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pokerApi
      .getLeaks()
      .then((l) => {
        setLeaks(l);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message ?? 'Unknown error');
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="loading">Analyse des fuites en cours…</div>;
  if (error)
    return (
      <div className="error">
        <h2>L'analyse des fuites a échoué</h2>
        <pre style={{ whiteSpace: 'pre-wrap', textAlign: 'left', maxWidth: 800 }}>{error}</pre>
      </div>
    );

  return (
    <div className="leaks-page">
      <h2>Détecteur de fuites</h2>
      <p className="muted">Faiblesses systémiques détectées dans ton historique.</p>
      {leaks.length === 0 ? (
        <div className="card muted">Aucune fuite majeure détectée. Continue à grinder.</div>
      ) : (
        leaks.map((leak) => (
          <div key={leak.id} className={`leak-card severity-${leak.severity}`}>
            <div className="leak-header">
              <span className={`severity-badge severity-${leak.severity}`}>
                {leak.severity === 'high' ? 'CRITIQUE' : leak.severity === 'medium' ? 'MOYEN' : 'FAIBLE'}
              </span>
              <h3>{translateLeakTitle(leak.title)}</h3>
              <span className="leak-cost negative">
                -{leak.cost.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
                {leak.costUnit === 'eur' ? '€' : leak.costUnit === 'bb' ? ' BB' : ' jetons'}
              </span>
            </div>
            <p className="leak-desc">{translateLeakDesc(leak.description)}</p>
            <div className="leak-recommendation">
              <strong>Conseil :</strong> {translateLeakReco(leak.recommendation)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function translateLeakTitle(t: string): string {
  return t
    .replace('Small Blind leak', 'Fuite à la Small Blind')
    .replace('Big Blind defense leak', 'Fuite à la défense de Big Blind')
    .replace('Pre-flop all-in pattern is unprofitable', "Pattern d'all-in pré-flop non rentable")
    .replace('Lost too many big pots', 'Trop de gros pots perdus')
    .replace('Expresso: ROI', 'Expresso : ROI');
}

function translateLeakDesc(d: string): string {
  return d
    .replace(/Losing -?(\d+) chips total from SB over (\d+) hands\./, 'Perte de $1 jetons à la SB sur $2 mains.')
    .replace(/Losing -?(\d+) chips total from BB over (\d+) hands \((-?[\d.]+)\/hand\)\./, 'Perte de $1 jetons à la BB sur $2 mains ($3/main).')
    .replace(/Went all-in pre-flop (\d+) times, net (-?\d+) chips\./, "All-in pré-flop $1 fois, net $2 jetons.")
    .replace(/(\d+) hands where you invested 500\+ chips and won nothing\. Total cost: (-?\d+) chips\./, '$1 mains où tu as investi 500+ jetons sans rien gagner. Coût total : $2 jetons.')
    .replace(/Played (\d+) Expresso tournaments for (-?[\d.]+)€ net \((-?[\d.]+)% ROI\)\./, '$1 Expresso joués pour $2€ net ($3% ROI).');
}

function translateLeakReco(r: string): string {
  return r
    .replace('SB is the worst position. Tighten up. Avoid limping. Steal more, defend less.', 'La SB est la pire position. Joue plus serré. Évite de limper. Vole plus, défends moins.')
    .replace('BB always loses some, but check if you defend too wide or fold to steals too much.', 'La BB perd toujours un peu, mais vérifie si tu défends trop large ou si tu folds trop face aux vols.')
    .replace('Your shove range is likely too wide or your call range is too loose. Tighten up shoving spots, especially in early/mid stages.', "Ta range de shove est sûrement trop large ou ta range de call trop loose. Resserre les spots de shove, surtout en early/mid game.")
    .replace('Review losing all-ins. Pattern often: calling all-ins too wide with marginal holdings (AK suited, AJ).', 'Revois tes all-ins perdus. Pattern fréquent : call all-in trop large avec des mains marginales (AK suited, AJ).')
    .replace('Stop playing Expresso or take coaching. Current ROI is unsustainable.', "Arrête l'Expresso ou prends un coach. Le ROI actuel est intenable.")
    .replace(/Review Expresso strategy\. Consider moving down in buy-in or taking a break\./, "Revois ta stratégie Expresso. Pense à descendre de buy-in ou faire une pause.");
}
