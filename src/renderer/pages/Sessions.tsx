import { useEffect, useState } from 'react';
import { pokerApi, type SessionRow } from '../api.js';
import { ProfitBadge } from '../components/ProfitBadge.js';
import { InfoTooltip } from '../components/InfoTooltip.js';
import { TIPS } from '../glossary.js';

interface SessionsProps {
  onSelect: (sessionDate: string) => void;
}

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

  if (loading) return <div className="loading">Chargement des sessions…</div>;

  let running = 0;
  const reversed = [...sessions].reverse();
  const cumulative = reversed.map((s) => {
    running += s.net;
    return { ...s, running };
  }).reverse();

  return (
    <div className="sessions-page">
      <h2>Sessions</h2>
      <p className="muted">Clique une ligne pour voir le détail + analyse IA.</p>
      <table className="data-table clickable-rows">
        <thead>
          <tr>
            <th>
              Date<InfoTooltip text={TIPS.sessionDate} />
            </th>
            <th className="num">
              Tournois<InfoTooltip text={TIPS.tournaments} />
            </th>
            <th className="num">
              Buy-ins<InfoTooltip text={TIPS.buyIns} />
            </th>
            <th className="num">
              Gains<InfoTooltip text={TIPS.winnings} />
            </th>
            <th className="num">
              Net<InfoTooltip text={TIPS.netResult} />
            </th>
            <th className="num">
              Bankroll après<InfoTooltip text={TIPS.bankrollAfter} />
            </th>
          </tr>
        </thead>
        <tbody>
          {cumulative.map((s) => (
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
