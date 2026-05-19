import { useEffect, useState } from 'react';
import { pokerApi, type Leak } from '../api.js';
import { coachBus } from '../lib/coach-bus.js';

interface NashScan {
  tags: Array<{
    hand_id: string;
    hand_code: string;
    position: string;
    stack_bb: number;
    action: 'shove' | 'call' | 'fold';
    nash_verdict: 'in' | 'marginal' | 'out';
    off_nash: boolean;
    cost_bb: number;
  }>;
  stats: { total: number; inRange: number; marginal: number; outOfRange: number; totalCostBb: number };
}

export function LeakFinder(): JSX.Element {
  const [leaks, setLeaks] = useState<Leak[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nash, setNash] = useState<NashScan | null>(null);
  const [nashLoading, setNashLoading] = useState(false);

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

    setNashLoading(true);
    pokerApi
      .scanNash()
      .then((res) => {
        setNash(res);
        setNashLoading(false);
      })
      .catch(() => setNashLoading(false));
  }, []);

  if (loading) return <div className="loading">Analyse des fuites en cours…</div>;
  if (error)
    return (
      <div className="error">
        <h2>L'analyse des fuites a échoué</h2>
        <pre style={{ whiteSpace: 'pre-wrap', textAlign: 'left', maxWidth: 800 }}>{error}</pre>
      </div>
    );

  const worstNash = nash
    ? [...nash.tags].filter((t) => t.off_nash).sort((a, b) => a.cost_bb - b.cost_bb).slice(0, 5)
    : [];

  return (
    <div className="leaks-page">
      <h2>Détecteur de fuites</h2>
      <p className="muted">Faiblesses systémiques détectées dans ton historique.</p>

      {nashLoading && <div className="card muted">Calcul conformité Nash en cours…</div>}
      {nash && nash.stats.total > 0 && (
        <div className="card nash-card">
          <div className="nash-card-header">
            <h3 className="card-title">
              Conformité Nash <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>(push/fold 3-max)</span>
            </h3>
            <button
              className="coach-link-btn"
              onClick={() =>
                coachBus.send(
                  `Sur ${nash.stats.total} push/fold décisions: ${nash.stats.inRange} dans range Nash, ${nash.stats.marginal} marginales, ${nash.stats.outOfRange} hors range pour ${nash.stats.totalCostBb.toFixed(1)} BB cumulés. Donne moi 1 conseil concret pour resserrer ma range de call all-in et 1 pour ma range de shove.`
                )
              }
            >
              ✨ Discuter avec coach
            </button>
          </div>
          <div className="nash-stats-grid">
            <div className="nash-stat">
              <span className="muted">Décisions analysées</span>
              <strong>{nash.stats.total}</strong>
            </div>
            <div className="nash-stat">
              <span className="muted">En range Nash</span>
              <strong className="positive">{nash.stats.inRange}</strong>
            </div>
            <div className="nash-stat">
              <span className="muted">Marginales</span>
              <strong style={{ color: '#fde68a' }}>{nash.stats.marginal}</strong>
            </div>
            <div className="nash-stat">
              <span className="muted">Hors range</span>
              <strong className="negative">{nash.stats.outOfRange}</strong>
            </div>
            <div className="nash-stat">
              <span className="muted">Coût off-Nash</span>
              <strong className={nash.stats.totalCostBb < 0 ? 'negative' : 'positive'}>
                {nash.stats.totalCostBb.toFixed(1)} BB
              </strong>
            </div>
          </div>
          {worstNash.length > 0 && (
            <>
              <h4 style={{ marginTop: 14, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)' }}>
                Pires décisions hors range
              </h4>
              <ul className="nash-worst-list">
                {worstNash.map((t) => (
                  <li key={t.hand_id}>
                    <span className="nash-badge nash-out">{t.action} {t.nash_verdict}</span>
                    <span className="nash-hand-code">{t.hand_code}</span>
                    <span className="muted">{t.position} · {t.stack_bb} BB</span>
                    <span className="negative">{t.cost_bb.toFixed(1)} BB</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

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
