import { useEffect, useState } from 'react';
import type { PlayerDerivedStats } from '../../types/player.js';
import { pokerApi } from '../api.js';
import { ProfitBadge } from '../components/ProfitBadge.js';
import { InfoTooltip } from '../components/InfoTooltip.js';
import { TIPS } from '../glossary.js';

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

  if (loading) return <div className="loading">Loading players…</div>;

  return (
    <div className="players-page">
      <h2>Opponents</h2>
      <div className="toolbar">
        <button
          className={sortBy === 'hands_played' ? 'active' : ''}
          onClick={() => setSortBy('hands_played')}
        >
          By hands seen
        </button>
        <button
          className={sortBy === 'total_won' ? 'active' : ''}
          onClick={() => setSortBy('total_won')}
        >
          By winnings vs you
        </button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Player</th>
            <th className="num">
              Hands<InfoTooltip text={TIPS.handsSeen} />
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
              Tendency<InfoTooltip text={TIPS.tendency} />
            </th>
            <th className="num">
              Won vs you<InfoTooltip text={TIPS.wonVsYou} />
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
                <span className={`tendency-${p.tendency}`}>{p.tendency}</span>
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
