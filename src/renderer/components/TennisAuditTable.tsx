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
            🗑 Purger {'>'}24h
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
                <th title="STRONG (≥75 score + ≥3% edge) = pari fort. PLAY (≥60 + ≥3%) = pari modéré. SKIP = à éviter (edge négatif ou score trop bas).">
                  Verdict <span className="th-help">?</span>
                </th>
                <th title="Compétition d'où vient le match (Roland-Garros, Hamburg Open, Strasbourg, etc.).">
                  Tournoi <span className="th-help">?</span>
                </th>
                <th title="Les deux joueurs + surface (terre/dur/herbe) + round (UNK = round inconnu car The Odds API ne le fournit pas).">
                  Match <span className="th-help">?</span>
                </th>
                <th title="Joueur sur qui le système suggère de parier (slug = nom_initialeprenom).">
                  Sélection <span className="th-help">?</span>
                </th>
                <th title="Cote décimale Unibet pour la sélection. Implicite = 1/cote (probabilité que le book attribue).">
                  Cote <span className="th-help">?</span>
                </th>
                <th title="Bookmaker où placer le pari (toujours Unibet aujourd'hui — seul book FR redistribué par The Odds API).">
                  Book <span className="th-help">?</span>
                </th>
                <th title="Probabilité estimée par le modèle que la sélection gagne. Source : clay-Elo > rang ATP/WTA > Pinnacle no-vig (fallback). 50% = pas de data ni Pinnacle = ignore.">
                  Modèle <span className="th-help">?</span>
                </th>
                <th title="Edge = (prob_modèle − prob_implicite_cote) / prob_implicite_cote. Positif vert = le modèle pense que le pari gagne plus souvent que la cote suggère (+EV). Négatif rouge = book trop confiant, à éviter. Seuil PLAY/STRONG = +3%.">
                  Edge <span className="th-help">?</span>
                </th>
                <th title="Score signaux 0-100 = combinaison pondérée modèle (40%) + Pinnacle no-vig (25%) + Betfair volume (15%) + tipsters Reddit (10%) + line movement (10%). Seuils : PLAY≥60, STRONG≥75.">
                  Score <span className="th-help">?</span>
                </th>
                <th title="Mise optimale en % de la bankroll selon Kelly fractionné 1/4, borné entre 0.5% et 2%. Multiplié par le risk-gate (×0.5 en mode take-profit, ×0 en stop-loss).">
                  Kelly <span className="th-help">?</span>
                </th>
                <th title="Date + heure de début prévue du match (Europe/Paris).">
                  Heure <span className="th-help">?</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const impliedBookPct = (100 / r.bookDecimalOdds).toFixed(1);
                const verdictExplain =
                  r.verdict === 'STRONG'
                    ? `STRONG : score ${r.signalScore}≥75 + edge ${(r.edgePct * 100).toFixed(1)}%≥3% → pari fort recommandé.`
                    : r.verdict === 'PLAY'
                      ? `PLAY : score ${r.signalScore}≥60 + edge ${(r.edgePct * 100).toFixed(1)}%≥3% → pari modéré.`
                      : `SKIP : ${r.edgePct < 0.03 ? 'edge insuffisant' : 'score insuffisant'} (edge ${(r.edgePct * 100).toFixed(1)}%, score ${r.signalScore}/100).`;
                const edgeExplain =
                  r.edgePct >= 0
                    ? `Modèle pense ${(r.modelProb * 100).toFixed(1)}% chance de gagner. Cote ${r.bookDecimalOdds.toFixed(2)} = ${impliedBookPct}% implicite. Modèle > book → edge positif = +EV.`
                    : `Modèle pense ${(r.modelProb * 100).toFixed(1)}%, mais cote ${r.bookDecimalOdds.toFixed(2)} implique ${impliedBookPct}%. Book trop confiant → edge négatif = à éviter.`;
                return (
                  <tr key={r.pickId} className={`audit-row audit-${r.verdict.toLowerCase()}`}>
                    <td title={verdictExplain}>
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
                    <td title={`Identifiant interne pour ${r.selection}`}>
                      <strong>{r.selection}</strong>
                    </td>
                    <td title={`Cote ${r.bookDecimalOdds.toFixed(2)} → implicite ${impliedBookPct}% (le book attribue cette probabilité de gain).`}>
                      {r.bookDecimalOdds.toFixed(2)}
                    </td>
                    <td>{r.bestBook}</td>
                    <td title={`Probabilité estimée par le modèle. Cote juste correspondante ≈ ${r.fairDecimalOdds < 100 ? r.fairDecimalOdds.toFixed(2) : '∞'}.`}>
                      {(r.modelProb * 100).toFixed(1)}%
                    </td>
                    <td
                      className={r.edgePct >= 0 ? 'edge-pos' : 'edge-neg'}
                      title={edgeExplain}
                    >
                      {(r.edgePct * 100).toFixed(1)}%
                    </td>
                    <td title={`Score signaux 0-100. ${r.signalScore >= 75 ? 'Très fort.' : r.signalScore >= 60 ? 'Suffisant pour PLAY.' : 'Trop bas — modèle/Pinnacle pas assez tranchés.'}`}>
                      {r.signalScore}
                    </td>
                    <td title={`Kelly fractionné 1/4 borné [0.5%, 2%]. Mise = bankroll × ${(r.kellyStakePct * 100).toFixed(2)}%.`}>
                      {(r.kellyStakePct * 100).toFixed(2)}%
                    </td>
                    <td className="muted small">
                      {new Date(r.scheduledAt).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                  </tr>
                );
              })}
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
