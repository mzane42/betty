import { useEffect, useMemo, useState } from 'react';
import { pokerApi, type SessionRow } from '../api.js';
import { ProfitBadge } from '../components/ProfitBadge.js';
import { InfoTooltip } from '../components/InfoTooltip.js';
import { SortHeader, SearchBox } from '../components/SortHeader.js';
import { useTable } from '../lib/use-table.js';
import { TIPS } from '../glossary.js';

interface SessionsProps {
  onSelect: (sessionDate: string) => void;
}

type Row = SessionRow & { running: number };

export function Sessions({ onSelect }: SessionsProps): JSX.Element {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pokerApi
      .getSessions(100, 0)
      .then((s) => {
        setSessions(s);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const rowsWithRunning: Row[] = useMemo(() => {
    let running = 0;
    const reversed = [...sessions].reverse();
    const cumulative = reversed.map((s) => {
      running += s.net;
      return { ...s, running };
    });
    return cumulative.reverse();
  }, [sessions]);

  const table = useTable<Row>(rowsWithRunning, {
    defaultSort: { key: 'session_date', dir: 'desc' },
    searchFn: (r, q) => r.session_date.toLowerCase().includes(q)
  });

  if (loading) return <div className="loading">Chargement des sessions…</div>;

  return (
    <div className="sessions-page">
      <h2>Sessions</h2>
      <div className="table-toolbar">
        <p className="muted">Clique une ligne pour voir le détail + analyse IA.</p>
        <SearchBox value={table.search} onChange={table.setSearch} placeholder="Filtrer par date…" />
      </div>
      <table className="data-table clickable-rows">
        <thead>
          <tr>
            <SortHeader label={<>Date<InfoTooltip text={TIPS.sessionDate} /></>} sortKey="session_date" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} />
            <SortHeader label={<>Tournois<InfoTooltip text={TIPS.tournaments} /></>} sortKey="tournaments_played" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
            <SortHeader label={<>Buy-ins<InfoTooltip text={TIPS.buyIns} /></>} sortKey="buy_ins" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
            <SortHeader label={<>Gains<InfoTooltip text={TIPS.winnings} /></>} sortKey="winnings" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
            <SortHeader label={<>Net<InfoTooltip text={TIPS.netResult} /></>} sortKey="net" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
            <SortHeader label={<>Bankroll après<InfoTooltip text={TIPS.bankrollAfter} /></>} sortKey="running" activeKey={table.sortKey} dir={table.sortDir} onClick={table.toggleSort} numeric />
          </tr>
        </thead>
        <tbody>
          {table.rows.map((s) => (
            <tr key={s.session_date} onClick={() => onSelect(s.session_date)} className="clickable-row">
              <td>{s.session_date}</td>
              <td className="num">{s.tournaments_played}</td>
              <td className="num">{s.buy_ins.toFixed(2)}€</td>
              <td className="num">{s.winnings.toFixed(2)}€</td>
              <td className="num">
                <ProfitBadge value={s.net} size="sm" />
              </td>
              <td className="num">
                <ProfitBadge value={s.running} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
