import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { pokerApi } from '../api.js';
import { Icon } from './Icon.js';

interface SimResult {
  runs: number[][];
  meta: { historicalRoi: number; perTournamentMean?: number; perTournamentStd?: number; n: number };
  message?: string;
}

export function VarianceSim(): JSX.Element {
  const [result, setResult] = useState<SimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tournaments, setTournaments] = useState(200);
  const [iterations, setIterations] = useState(50);

  async function run(): Promise<void> {
    setLoading(true);
    const res = await pokerApi.runVarianceSim({ tournaments, iterations });
    setResult(res);
    setLoading(false);
  }

  // Reshape data for recharts: each point = { idx, run0, run1, ... }
  const chartData = result?.runs.length
    ? Array.from({ length: result.runs[0]!.length }, (_, i) => {
        const row: Record<string, number> = { idx: i };
        result.runs.forEach((r, j) => {
          row[`r${j}`] = r[i]!;
        });
        return row;
      })
    : [];

  // Final outcomes histogram
  const finals = result?.runs.map((r) => r[r.length - 1]!) ?? [];
  const finalsSorted = [...finals].sort((a, b) => a - b);
  const p10 = finalsSorted[Math.floor(finalsSorted.length * 0.1)] ?? 0;
  const p50 = finalsSorted[Math.floor(finalsSorted.length * 0.5)] ?? 0;
  const p90 = finalsSorted[Math.floor(finalsSorted.length * 0.9)] ?? 0;

  return (
    <div className="card">
      <h3 className="card-title">Simulateur de variance Monte Carlo</h3>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        Simule N runs futurs basés sur ton ROI et écart-type historiques.
      </p>
      <div className="variance-controls">
        <label className="filter-field">
          <span className="muted">Tournois</span>
          <input type="number" value={tournaments} onChange={(e) => setTournaments(Number(e.target.value))} />
        </label>
        <label className="filter-field">
          <span className="muted">Itérations</span>
          <input type="number" value={iterations} onChange={(e) => setIterations(Number(e.target.value))} />
        </label>
        <button className="sparkle-btn" onClick={run} disabled={loading}>
          {loading ? 'Calcul…' : <><Icon.Dice5 size={14} /> Simuler</>}
        </button>
      </div>

      {result?.message && <p className="muted">{result.message}</p>}

      {result && result.runs.length > 0 && (
        <>
          <div className="variance-stats">
            <div className="tracker-stat">
              <span className="muted">P10 (pire 10%)</span>
              <strong className={p10 >= 0 ? 'positive' : 'negative'}>{p10.toFixed(0)}€</strong>
            </div>
            <div className="tracker-stat">
              <span className="muted">P50 médiane</span>
              <strong className={p50 >= 0 ? 'positive' : 'negative'}>{p50.toFixed(0)}€</strong>
            </div>
            <div className="tracker-stat">
              <span className="muted">P90 (meilleur 10%)</span>
              <strong className={p90 >= 0 ? 'positive' : 'negative'}>{p90.toFixed(0)}€</strong>
            </div>
          </div>
          <div style={{ width: '100%', height: 240, marginTop: 14 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" />
                <XAxis dataKey="idx" stroke="#8b93a7" tick={{ fontSize: 11, fill: '#8b93a7' }} />
                <YAxis stroke="#8b93a7" tick={{ fontSize: 11, fill: '#8b93a7' }} />
                <Tooltip
                  contentStyle={{ background: '#1e2230', border: '1px solid #2a2f3d', borderRadius: 8 }}
                  formatter={(v: number) => [`${v.toFixed(0)}€`, 'Run']}
                />
                {result.runs.map((_, j) => (
                  <Line
                    key={j}
                    type="monotone"
                    dataKey={`r${j}`}
                    stroke="rgba(168, 85, 247, 0.25)"
                    strokeWidth={1}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
