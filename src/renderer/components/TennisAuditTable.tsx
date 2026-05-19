import { useEffect, useState } from 'react';
import { pokerApi, type TennisPickAuditRowDto } from '../api.js';
import { InfoTooltip } from './InfoTooltip.js';
import { Icon } from './Icon.js';
import { UnibetLink } from './UnibetLink.js';

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
            <Icon.Trash size={14} /> Purger {'>'}24h
          </button>
          <button className="primary" onClick={() => void load()} title="Rafraîchir">
            <Icon.RefreshCw size={14} />
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
                <th>
                  Verdict
                  <InfoTooltip text="STRONG (score ≥75 + edge ≥3%) = pari fort. PLAY (score ≥60 + edge ≥3%) = pari modéré. SKIP = edge négatif ou score insuffisant." />
                </th>
                <th>
                  Tournoi
                  <InfoTooltip text="Compétition où se joue le match (Roland Garros, Hamburg Open, Strasbourg…)." />
                </th>
                <th>
                  Match
                  <InfoTooltip text="Joueurs + surface (terre/dur/herbe) + round. UNK = round non fourni par The Odds API." />
                </th>
                <th>
                  Sélection
                  <InfoTooltip text="Joueur sur qui le système suggère de parier. Format slug = nom_initialeprenom." />
                </th>
                <th>
                  Cote
                  <InfoTooltip text="Cote décimale Unibet pour la sélection. Probabilité implicite = 1/cote." />
                </th>
                <th>
                  Book
                  <InfoTooltip text="Bookmaker où placer le pari. Unibet seulement aujourd'hui (seul FR redistribué par The Odds API)." />
                </th>
                <th>
                  Modèle
                  <InfoTooltip text="Probabilité estimée que la sélection gagne. Source : clay-Elo > rang ATP/WTA > Pinnacle no-vig (fallback)." />
                </th>
                <th>
                  Edge
                  <InfoTooltip text="(prob modèle − prob implicite cote) / prob implicite cote. Positif = +EV. Négatif = book trop confiant. Seuil PLAY/STRONG : +3%." />
                </th>
                <th>
                  Score
                  <InfoTooltip text="Score signaux 0-100 = modèle (40%) + Pinnacle no-vig (25%) + Betfair (15%) + tipsters Reddit (10%) + line movement (10%). PLAY ≥60, STRONG ≥75." />
                </th>
                <th>
                  Kelly
                  <InfoTooltip text="Mise optimale en % de la bankroll. Kelly fractionné ×1/4, borné [0.5%, 2%]. Multiplié par risk-gate (×0.5 en take-profit, ×0 en stop-loss)." />
                </th>
                <th>
                  Heure
                  <InfoTooltip text="Date + heure de début prévue du match (Europe/Paris)." />
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
                      <div className="audit-match-line">
                        <span>
                          {r.player1Name} <span className="muted">vs</span> {r.player2Name}
                        </span>
                        <UnibetLink matchId={r.matchId} compact />
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
