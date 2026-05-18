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

  if (loading) return <div className="loading">Analyzing leaks…</div>;
  if (error)
    return (
      <div className="error">
        <h2>Leak analysis failed</h2>
        <pre style={{ whiteSpace: 'pre-wrap', textAlign: 'left', maxWidth: 800 }}>{error}</pre>
      </div>
    );

  return (
    <div className="leaks-page">
      <h2>Leak finder</h2>
      <p className="muted">Systematic weaknesses detected from your history.</p>
      {leaks.length === 0 ? (
        <div className="card muted">No major leaks detected. Keep grinding.</div>
      ) : (
        leaks.map((leak) => (
          <div key={leak.id} className={`leak-card severity-${leak.severity}`}>
            <div className="leak-header">
              <span className={`severity-badge severity-${leak.severity}`}>{leak.severity}</span>
              <h3>{leak.title}</h3>
              <span className="leak-cost negative">
                -{leak.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                {leak.costUnit === 'eur' ? '€' : ' chips'}
              </span>
            </div>
            <p className="leak-desc">{leak.description}</p>
            <div className="leak-recommendation">
              <strong>Recommendation:</strong> {leak.recommendation}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
