import { useEffect, useState } from 'react';
import { pokerApi } from '../api.js';
import { CardGroup } from '../components/PlayingCard.js';
import { PositionBadge } from '../components/PositionBadge.js';
import { ProfitBadge } from '../components/ProfitBadge.js';
import { coachBus } from '../lib/coach-bus.js';

interface DeepData {
  stats: Record<string, unknown> | undefined;
  hands: Array<Record<string, unknown>>;
  note: string;
  tags: string[];
}

interface Props {
  playerName: string;
  onBack: () => void;
}

export function PlayerDetail({ playerName, onBack }: Props): JSX.Element {
  const [data, setData] = useState<DeepData | null>(null);

  useEffect(() => {
    pokerApi.getPlayerDeep(playerName).then((d) => setData(d));
  }, [playerName]);

  if (!data) return <div className="loading">Chargement…</div>;

  const totalNet = data.hands.reduce(
    (a, h) => a + ((h.hero_won as number) - (h.hero_invested as number)),
    0
  );
  const heroWins = data.hands.filter((h) => (h.hero_won as number) - (h.hero_invested as number) > 0).length;
  const winRate = data.hands.length > 0 ? (heroWins / data.hands.length) * 100 : 0;

  return (
    <div className="player-detail-page">
      <button className="back-btn" onClick={onBack}>← Adversaires</button>
      <div className="player-detail-header">
        <h2>{playerName}</h2>
        {data.tags.length > 0 && (
          <div className="note-tags">
            {data.tags.map((t) => (
              <span key={t} className="note-tag">{t}</span>
            ))}
          </div>
        )}
      </div>
      {data.note && <p className="muted">{data.note}</p>}

      <div className="trackers-grid">
        <div className="tracker-stat">
          <span className="muted">Mains vues</span>
          <strong>{data.hands.length}</strong>
        </div>
        <div className="tracker-stat">
          <span className="muted">Win rate hero vs lui</span>
          <strong className={winRate >= 50 ? 'positive' : 'negative'}>{winRate.toFixed(1)}%</strong>
        </div>
        <div className="tracker-stat">
          <span className="muted">Net hero (jetons)</span>
          <strong className={totalNet >= 0 ? 'positive' : 'negative'}>{Math.round(totalNet).toLocaleString('fr-FR')}</strong>
        </div>
        {data.stats && (
          <>
            <div className="tracker-stat">
              <span className="muted">VPIP</span>
              <strong>{fmt(data.stats.vpip as number | null)}%</strong>
            </div>
            <div className="tracker-stat">
              <span className="muted">PFR</span>
              <strong>{fmt(data.stats.pfr as number | null)}%</strong>
            </div>
            <div className="tracker-stat">
              <span className="muted">3-bet</span>
              <strong>{fmt(data.stats.threeBet as number | null)}%</strong>
            </div>
            <div className="tracker-stat">
              <span className="muted">AF</span>
              <strong>
                {data.stats.aggressionFactor != null
                  ? (data.stats.aggressionFactor as number).toFixed(1)
                  : '—'}
              </strong>
            </div>
            <div className="tracker-stat">
              <span className="muted">Profil</span>
              <strong>{(data.stats.tendency as string) ?? '—'}</strong>
            </div>
          </>
        )}
      </div>

      <button
        className="coach-link-btn"
        onClick={() =>
          coachBus.send(
            `Profil ${playerName}: ${data.hands.length} mains, win-rate hero ${winRate.toFixed(1)}%, net hero ${totalNet.toFixed(0)} jetons. Stats: VPIP ${fmt(data.stats?.vpip as number | null)}% / PFR ${fmt(data.stats?.pfr as number | null)}% / 3b ${fmt(data.stats?.threeBet as number | null)}% / AF ${data.stats?.aggressionFactor ?? '—'}. Tags: ${data.tags.join(', ') || 'aucun'}. Donne moi 1 ligne tactique principale contre ce joueur et 1 piège à éviter.`
          )
        }
      >
        ✨ Stratégie contre ce joueur
      </button>

      <div className="card">
        <h3 className="card-title">200 dernières mains contre {playerName}</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Pos</th>
              <th>Hero cartes</th>
              <th>Villain cartes</th>
              <th>Board</th>
              <th className="num">Pot</th>
              <th className="num">Net hero</th>
            </tr>
          </thead>
          <tbody>
            {data.hands.map((h) => {
              const heroCards = h.hero_cards ? (JSON.parse(h.hero_cards as string) as string[]) : null;
              const villainCards = h.villain_cards ? (JSON.parse(h.villain_cards as string) as string[]) : null;
              const board = h.board ? (JSON.parse(h.board as string) as string[]) : [];
              const net = (h.hero_won as number) - (h.hero_invested as number);
              return (
                <tr key={h.hand_id as string}>
                  <td>{h.session_date as string}</td>
                  <td><PositionBadge position={h.hero_position as string | null} /></td>
                  <td><CardGroup cards={heroCards} size="sm" withStrength /></td>
                  <td>{villainCards ? <CardGroup cards={villainCards} size="sm" /> : <span className="muted">caché</span>}</td>
                  <td><CardGroup cards={board} size="sm" /></td>
                  <td className="num">{h.total_pot as number}</td>
                  <td className="num"><ProfitBadge value={net} size="sm" unit="chips" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(0);
}
