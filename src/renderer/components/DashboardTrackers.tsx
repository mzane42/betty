import { useEffect, useState } from 'react';
import { pokerApi } from '../api.js';
import { toast } from '../lib/toast.js';
import { Icon } from './Icon.js';

interface Trackers {
  streak: { length: number; type: 'winning' | 'losing' | 'neutral'; latestDate: string | null };
  todayNet: number;
  ytdNet: number;
  goalAnnualNet: number | null;
  goalPct: number;
  stopLossDaily: number | null;
  stopLossHit: boolean;
}

export function DashboardTrackers(): JSX.Element {
  const [data, setData] = useState<Trackers | null>(null);
  const [editing, setEditing] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [stopLossInput, setStopLossInput] = useState('');

  function refresh(): void {
    pokerApi.getDashboardTrackers().then((d) => {
      setData(d);
      if (d.stopLossHit) toast.warn(`Stop-loss atteint aujourd'hui: ${d.todayNet.toFixed(2)}€. Arrête de jouer.`, 5000);
    });
  }

  useEffect(() => {
    refresh();
    pokerApi.getSettings().then((s) => {
      setGoalInput(s.goalAnnualNet?.toString() ?? '');
      setStopLossInput(s.stopLossDaily?.toString() ?? '');
    });
  }, []);

  async function save(): Promise<void> {
    const partial: Record<string, number | undefined> = {};
    partial.goalAnnualNet = goalInput ? Number(goalInput) : undefined;
    partial.stopLossDaily = stopLossInput ? Number(stopLossInput) : undefined;
    await pokerApi.updateSettings(partial);
    setEditing(false);
    toast.success('Objectifs sauvegardés');
    refresh();
  }

  if (!data) return <div className="card muted">Chargement des trackers…</div>;

  return (
    <div className="card trackers-card">
      <div className="trackers-header">
        <h3 className="card-title">Suivi temps réel</h3>
        <button className="copy-btn" onClick={() => setEditing(!editing)}>
          {editing ? 'Annuler' : <><Icon.Settings size={12} /> Configurer</>}
        </button>
      </div>

      {editing ? (
        <div className="trackers-edit">
          <label className="filter-field">
            <span className="muted">Objectif net annuel (€)</span>
            <input type="number" value={goalInput} onChange={(e) => setGoalInput(e.target.value)} placeholder="ex: 500" />
          </label>
          <label className="filter-field">
            <span className="muted">Stop-loss journalier (€)</span>
            <input type="number" value={stopLossInput} onChange={(e) => setStopLossInput(e.target.value)} placeholder="ex: 30" />
          </label>
          <button className="ohmy-btn primary" onClick={save}>Sauvegarder</button>
        </div>
      ) : (
        <div className="trackers-grid">
          <div className={`tracker-stat streak-${data.streak.type}`}>
            <span className="muted">Série en cours</span>
            <strong className="streak-strong">
              {data.streak.length > 0 ? (
                <>
                  {data.streak.length}{' '}
                  {data.streak.type === 'winning' ? <Icon.Check size={16} /> : <Icon.X size={16} />}
                </>
              ) : (
                '—'
              )}
            </strong>
          </div>
          <div className="tracker-stat">
            <span className="muted">Aujourd'hui</span>
            <strong className={data.todayNet >= 0 ? 'positive' : 'negative'}>
              {data.todayNet >= 0 ? '+' : ''}{data.todayNet.toFixed(2)}€
            </strong>
          </div>
          <div className="tracker-stat">
            <span className="muted">YTD ({new Date().getFullYear()})</span>
            <strong className={data.ytdNet >= 0 ? 'positive' : 'negative'}>
              {data.ytdNet >= 0 ? '+' : ''}{data.ytdNet.toFixed(2)}€
            </strong>
          </div>
          {data.goalAnnualNet != null && (
            <div className="tracker-stat goal">
              <span className="muted">Objectif {data.goalAnnualNet}€</span>
              <div className="goal-bar">
                <div
                  className="goal-bar-fill"
                  style={{ width: `${Math.max(0, Math.min(100, data.goalPct))}%` }}
                />
              </div>
              <strong>{data.goalPct.toFixed(1)}%</strong>
            </div>
          )}
          {data.stopLossDaily != null && (
            <div className={`tracker-stat ${data.stopLossHit ? 'stoploss-hit' : ''}`}>
              <span className="muted">Stop-loss -{data.stopLossDaily}€</span>
              <strong>
                {data.stopLossHit ? <><Icon.AlertTriangle size={14} /> Atteint</> : `${(data.stopLossDaily + data.todayNet).toFixed(2)}€ avant`}
              </strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
