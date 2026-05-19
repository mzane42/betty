import { useEffect, useState } from 'react';
import { pokerApi, type TennisPickAuditRowDto } from '../api.js';

export function TennisAuditTable(): JSX.Element {
  const [rows, setRows] = useState<TennisPickAuditRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'STRONG' | 'PLAY' | 'SKIP'>('all');

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const data = await pokerApi.tennisAuditDay();
      setRows(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.verdict === filter);
  const counts = {
    STRONG: rows.filter((r) => r.verdict === 'STRONG').length,
    PLAY: rows.filter((r) => r.verdict === 'PLAY').length,
    SKIP: rows.filter((r) => r.verdict === 'SKIP').length
  };

  if (loading) return <div className="loading">Chargement audit…</div>;
  if (error) return <div className="error">Erreur : {error}</div>;

  return (
    <section className="tennis-audit">
      <div className="tennis-feed-header">
        <div>
          <h3>Tous les scans — aujourd'hui</h3>
          <p className="muted">
            {rows.length} pick(s) générés · {counts.STRONG} STRONG · {counts.PLAY} PLAY ·{' '}
            {counts.SKIP} SKIP
          </p>
        </div>
        <div className="tennis-feed-controls">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="audit-filter"
          >
            <option value="all">Tous</option>
            <option value="STRONG">STRONG only</option>
            <option value="PLAY">PLAY only</option>
            <option value="SKIP">SKIP only</option>
          </select>
          <button
            className="audit-prune"
            title="Supprime les picks de plus de 24h (libère la DB des anciens scans bogués)"
            onClick={async () => {
              const n = await pokerApi.tennisPrunePicks(1);
              await load();
              alert(`${n} ancien(s) pick(s) supprimé(s).`);
            }}
          >
            🗑 Purger >24h
          </button>
          <button className="primary" onClick={() => void load()}>
            ↻
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">Aucun pick dans ce filtre.</p>
      ) : (
        <div className="audit-table-wrapper">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Verdict</th>
                <th>Tournoi</th>
                <th>Match</th>
                <th>Sélection</th>
                <th>Cote</th>
                <th>Book</th>
                <th>Modèle</th>
                <th>Edge</th>
                <th>Score</th>
                <th>Kelly</th>
                <th>Heure</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.pickId} className={`audit-row audit-${r.verdict.toLowerCase()}`}>
                  <td>
                    <span className={`pick-verdict verdict-${r.verdict.toLowerCase()}`}>
                      {r.verdict}
                    </span>
                  </td>
                  <td>{prettyTournament(r.tournament)}</td>
                  <td>
                    <div>
                      {r.player1Name} <span className="muted">vs</span> {r.player2Name}
                    </div>
                    <div className="muted small">
                      {r.surface} · {r.round}
                    </div>
                  </td>
                  <td>
                    <strong>{r.selection}</strong>
                  </td>
                  <td>{r.bookDecimalOdds.toFixed(2)}</td>
                  <td>{r.bestBook}</td>
                  <td>{(r.modelProb * 100).toFixed(1)}%</td>
                  <td className={r.edgePct >= 0 ? 'edge-pos' : 'edge-neg'}>
                    {(r.edgePct * 100).toFixed(1)}%
                  </td>
                  <td>{r.signalScore}</td>
                  <td>{(r.kellyStakePct * 100).toFixed(2)}%</td>
                  <td className="muted small">
                    {new Date(r.scheduledAt).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function prettyTournament(raw: string): string {
  return raw
    .replace(/^roland_garros_2026$/, 'RG 2026')
    .replace(/^french_open$/, 'French Open')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
