import { useEffect, useState } from 'react';
import type { PlayerDerivedStats } from '../../types/player.js';
import { pokerApi } from '../api.js';
import { ProfitBadge } from '../components/ProfitBadge.js';
import { InfoTooltip } from '../components/InfoTooltip.js';
import { SortHeader, SearchBox } from '../components/SortHeader.js';
import { useTable } from '../lib/use-table.js';
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

  useEffect(() => {
    setLoading(true);
    pokerApi
      .getPlayers(500, 0, 'hands_played')
      .then((p) => {
        setPlayers(p);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const table = useTable<PlayerDerivedStats>(players, {
    defaultSort: { key: 'handsPlayed', dir: 'desc' },
    searchFn: (p, q) => p.playerName.toLowerCase().includes(q) || p.tendency.toLowerCase().includes(q)
  });

  if (loading) return <div className="loading">Chargement des adversaires…</div>;

  return (
    <div className="players-page">
      <h2>Adversaires</h2>
      <div className="table-toolbar">
        <p className="muted">{table.rows.length}/{players.length} adversaires</p>
        <SearchBox value={table.search} onChange={table.setSearch} placeholder="Nom ou profil…" />
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <SortHeader label="Joueur" sortKey="playerName" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} />
            <SortHeader label={<>Mains<InfoTooltip text={TIPS.handsSeen} /></>} sortKey="handsPlayed" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
            <SortHeader label={<>VPIP<InfoTooltip text={TIPS.vpip} /></>} sortKey="vpip" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
            <SortHeader label={<>PFR<InfoTooltip text={TIPS.pfr} /></>} sortKey="pfr" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
            <SortHeader label={<>3-bet<InfoTooltip text={TIPS.threeBet} /></>} sortKey="threeBet" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
            <SortHeader label={<>AF<InfoTooltip text={TIPS.af} /></>} sortKey="aggressionFactor" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
            <SortHeader label={<>Profil<InfoTooltip text={TIPS.tendency} /></>} sortKey="tendency" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} />
            <SortHeader label={<>Gains vs toi<InfoTooltip text={TIPS.wonVsYou} /></>} sortKey="netResult" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
          </tr>
        </thead>
        <tbody>
          {table.rows.map((p) => (
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
