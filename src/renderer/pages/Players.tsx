import { useEffect, useState } from 'react';
import type { PlayerDerivedStats } from '../../types/player.js';
import { pokerApi } from '../api.js';
import { ProfitBadge } from '../components/ProfitBadge.js';
import { InfoTooltip } from '../components/InfoTooltip.js';
import { TIPS } from '../glossary.js';

const TENDENCY_FR: Record<string, string> = {
  'tight-passive': 'tight-passif',
  'tight-aggressive': 'tight-aggro',
  'loose-passive': 'loose-passif (fish)',
  'loose-aggressive': 'loose-aggro',
  maniac: 'maniaque',
  nit: 'nit',
  unknown: 'inconnu'
};

function translateTendency(t: string): string {
  return TENDENCY_FR[t] ?? t;
}

export function Players(): JSX.Element {
  const [players, setPlayers] = useState<PlayerDerivedStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'hands_played' | 'total_won'>('hands_played');

  useEffect(() => {
    setLoading(true);
    pokerApi
      .getPlayers(100, 0, sortBy)
      .then((p) => {
        setPlayers(p);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sortBy]);

  if (loading) return <div className="loading">Chargement des adversaires…</div>;

  return (
    <div className="players-page">
      <h2>Adversaires</h2>
      <div className="toolbar">
        <button
          className={sortBy === 'hands_played' ? 'active' : ''}
          onClick={() => setSortBy('hands_played')}
        >
          Par mains jouées
        </button>
        <button
          className={sortBy === 'total_won' ? 'active' : ''}
          onClick={() => setSortBy('total_won')}
        >
          Par gains contre toi
        </button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Joueur</th>
            <th className="num">
              Mains<InfoTooltip text={TIPS.handsSeen} />
            </th>
            <th className="num">
              VPIP<InfoTooltip text={TIPS.vpip} />
            </th>
            <th className="num">
              PFR<InfoTooltip text={TIPS.pfr} />
            </th>
            <th className="num">
              3-bet<InfoTooltip text={TIPS.threeBet} />
            </th>
            <th className="num">
              AF<InfoTooltip text={TIPS.af} />
            </th>
            <th>
              Profil<InfoTooltip text={TIPS.tendency} />
            </th>
            <th className="num">
              Gains vs toi<InfoTooltip text={TIPS.wonVsYou} />
            </th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.playerName}>
              <td>{p.playerName}</td>
              <td className="num">{p.handsPlayed}</td>
              <td className="num">{p.vpip === null ? '—' : `${p.vpip.toFixed(0)}%`}</td>
              <td className="num">{p.pfr === null ? '—' : `${p.pfr.toFixed(0)}%`}</td>
              <td className="num">{p.threeBet === null ? '—' : `${p.threeBet.toFixed(0)}%`}</td>
              <td className="num">{p.aggressionFactor === null ? '—' : p.aggressionFactor.toFixed(1)}</td>
              <td>
                <span className={`tendency-${p.tendency}`}>{translateTendency(p.tendency)}</span>
              </td>
              <td className="num">
                <ProfitBadge value={p.netResult} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
