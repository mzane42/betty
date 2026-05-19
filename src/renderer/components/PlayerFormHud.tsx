import { useEffect, useState } from 'react';
import { pokerApi, type TennisPlayerFormRow } from '../api.js';

interface Props {
  playerName: string;
  compact?: boolean;
}

const formCache = new Map<string, TennisPlayerFormRow>();
const inflight = new Map<string, Promise<TennisPlayerFormRow>>();

async function loadForm(playerName: string): Promise<TennisPlayerFormRow> {
  const cached = formCache.get(playerName);
  if (cached) return cached;
  const flying = inflight.get(playerName);
  if (flying) return flying;
  const p = pokerApi.tennisPlayerForm(playerName).then((res) => {
    formCache.set(playerName, res);
    inflight.delete(playerName);
    return res;
  });
  inflight.set(playerName, p);
  return p;
}

export function PlayerFormHud({ playerName, compact = false }: Props): JSX.Element {
  const [form, setForm] = useState<TennisPlayerFormRow | null>(() => formCache.get(playerName) ?? null);
  const [loading, setLoading] = useState(!form);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (form) return;
    setLoading(true);
    void loadForm(playerName)
      .then((res) => {
        setForm(res);
        setError(null);
      })
      .catch((err: unknown) => {
        setError((err as Error).message);
      })
      .finally(() => setLoading(false));
  }, [playerName, form]);

  if (loading && !form) return <span className="form-hud-loading">form…</span>;
  if (error) return <span className="form-hud-error" title={error}>form?</span>;
  if (!form || form.matchesPlayed === 0) {
    return <span className="form-hud-empty" title="No Sackmann match history found">no data</span>;
  }

  const fatigue = form.daysSinceLast != null && form.daysSinceLast <= 3;
  return (
    <div className={`form-hud ${compact ? 'compact' : ''}`}>
      <div className="form-hud-pills">
        {form.last5.map((m, i) => (
          <span
            key={i}
            className={`form-pill form-${m.result === 'W' ? 'w' : 'l'}`}
            title={`${m.date} · ${m.surface} · ${m.round} vs ${m.opponentName}`}
          >
            {m.result}
          </span>
        ))}
      </div>
      <div className="form-hud-meta">
        <span title={`${form.clayMatches} match(s) carrière sur terre battue`}>
          terre {form.clayWinPct.toFixed(0)}%
        </span>
        {form.daysSinceLast != null && (
          <span className={fatigue ? 'fatigue' : ''} title={`Dernier match: ${form.lastMatchDate}`}>
            j-{form.daysSinceLast}
          </span>
        )}
      </div>
    </div>
  );
}
