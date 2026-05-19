import { useEffect, useMemo, useState } from 'react';
import { pokerApi, type SessionRow } from '../api.js';
import { ProfitBadge } from '../components/ProfitBadge.js';
import { InfoTooltip } from '../components/InfoTooltip.js';
import { SortHeader, SearchBox } from '../components/SortHeader.js';
import { useTable } from '../lib/use-table.js';
import { TIPS } from '../glossary.js';
import { Icon } from '../components/Icon.js';

const AUTO_REVIEW_KEY = 'pokerCoach.autoReviewOnImport';

interface SessionsProps {
  onSelect: (sessionDate: string) => void;
}

type Row = SessionRow & { running: number };

export function Sessions({ onSelect }: SessionsProps): JSX.Element {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [autoReview, setAutoReview] = useState(() => localStorage.getItem(AUTO_REVIEW_KEY) === '1');
  const [autoQueue, setAutoQueue] = useState<{ current: number; total: number } | null>(null);

  const [verdicts, setVerdicts] = useState<Record<string, string>>({});

  useEffect(() => {
    pokerApi
      .getSessions(100, 0)
      .then((s) => {
        setSessions(s);
        setLoading(false);
        // Fire and forget: fetch cached verdicts in parallel
        Promise.all(
          s.map((row) => pokerApi.getCachedSessionReview(row.session_date).then((r) => [row.session_date, r?.sessionVerdict ?? null] as const))
        ).then((entries) => {
          const map: Record<string, string> = {};
          for (const [d, v] of entries) if (v) map[d] = v;
          setVerdicts(map);
        });
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

  function toggleAutoReview(): void {
    const next = !autoReview;
    setAutoReview(next);
    localStorage.setItem(AUTO_REVIEW_KEY, next ? '1' : '0');
  }

  async function runImport(): Promise<void> {
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await pokerApi.importNewSession();
      setImportMsg(`Import: ${res.handsImported} mains, ${res.tournamentsImported} tournois`);

      // Reload session list
      const fresh = await pokerApi.getSessions(100, 0);
      setSessions(fresh);

      if (autoReview && res.handsImported > 0) {
        const pending = await pokerApi.getAutoReviewPending();
        const todo = pending.sessions; // session-level reviews
        if (todo.length > 0) {
          for (let i = 0; i < todo.length; i++) {
            setAutoQueue({ current: i + 1, total: todo.length });
            try {
              await pokerApi.reviewSession(todo[i]!);
            } catch (err) {
              console.error('Auto review failed for', todo[i], err);
            }
          }
          setAutoQueue(null);
          setImportMsg(`Import + ${todo.length} reviews IA terminées.`);
          // Refresh verdicts
          const fresh2 = await pokerApi.getSessions(100, 0);
          setSessions(fresh2);
        }
      }
    } catch (err) {
      setImportMsg(`Erreur: ${(err as Error).message}`);
    } finally {
      setImporting(false);
    }
  }

  if (loading) return <div className="loading">Chargement des sessions…</div>;

  return (
    <div className="sessions-page">
      <div className="sessions-header-row">
        <h2>Sessions</h2>
        <div className="sessions-import-controls">
          <button className="import-btn" onClick={runImport} disabled={importing}>
            {importing ? (
              <>
                <Icon.Loader size={14} className="spin" /> Import en cours…
              </>
            ) : (
              <>
                <Icon.Download size={14} /> Importer nouvelles mains
              </>
            )}
          </button>
          <label className="auto-review-toggle" title="Lance l'analyse IA automatiquement après import">
            <input type="checkbox" checked={autoReview} onChange={toggleAutoReview} />
            Auto-analyse IA
          </label>
        </div>
      </div>
      {importMsg && <div className="import-msg">{importMsg}</div>}
      {autoQueue && (
        <div className="import-msg">
          Analyse IA en cours: session {autoQueue.current}/{autoQueue.total}…
        </div>
      )}
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
            <th>IA</th>
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
              <td>
                {verdicts[s.session_date] && (
                  <span className={`verdict-badge t-verdict-${verdicts[s.session_date] === 'winning' ? 'won' : verdicts[s.session_date] === 'losing' ? 'early-bust' : 'deep'}`} style={{ fontSize: 9 }}>
                    {verdicts[s.session_date] === 'winning' ? '✓ Analysé' : verdicts[s.session_date] === 'losing' ? '✗ Analysé' : '= Analysé'}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
