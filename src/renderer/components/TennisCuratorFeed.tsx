import { useEffect, useState } from 'react';
import {
  pokerApi,
  type TennisCuratorOutput,
  type TennisPickRow
} from '../api.js';
import { toast } from '../lib/toast.js';

interface Props {
  /** Called after any successful action so the parent can refresh siblings. */
  onChange?: () => void | Promise<void>;
  riskStakeMultiplier: number;
  bankrollEur: number;
}

interface EnrichedSelection {
  rank: number;
  confidence: 'high' | 'medium';
  tldr: string;
  why: string;
  pick: TennisPickRow | null;
}

export function TennisCuratorFeed({
  onChange,
  riskStakeMultiplier,
  bankrollEur
}: Props): JSX.Element {
  const [curated, setCurated] = useState<TennisCuratorOutput | null>(null);
  const [enriched, setEnriched] = useState<EnrichedSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadCached(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const cached = await pokerApi.tennisCuratorToday();
      setCurated(cached);
      if (cached) {
        const picks = await Promise.all(
          cached.selected_picks.map((sp) => pokerApi.tennisGetPick(sp.pick_id))
        );
        setEnriched(
          cached.selected_picks.map((sp, i) => ({
            rank: sp.rank,
            confidence: sp.confidence,
            tldr: sp.tldr,
            why: sp.why,
            pick: picks[i]
          }))
        );
      } else {
        setEnriched([]);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCached();
  }, []);

  async function handleRunNow(): Promise<void> {
    setRunning(true);
    try {
      const res = await pokerApi.tennisDaemonAutoScoreNow();
      toast.success(
        `Auto-score: ${res.score.eventsConsidered} events → ` +
          `${res.score.strongPicks} STRONG + ${res.score.playPicks} PLAY. ` +
          `Curator: ${res.curated.selected_picks.length} retenus.`
      );
      await loadCached();
      await onChange?.();
    } catch (err) {
      toast.error(`Erreur: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  async function handlePlace(pick: TennisPickRow, stakeEur: number): Promise<void> {
    try {
      await pokerApi.tennisPlaceBet({
        pickId: pick.pickId,
        matchId: pick.matchId,
        selection: pick.selection,
        book: pick.bestBook,
        decimalOdds: pick.bookDecimalOdds,
        stakeEur
      });
      toast.success(`Bet ${stakeEur.toFixed(2)}€ enregistré sur ${pick.bestBook}`);
      await onChange?.();
    } catch (err) {
      toast.error(`Erreur place bet: ${(err as Error).message}`);
    }
  }

  if (loading) return <div className="loading">Chargement curator…</div>;
  if (error) return <div className="error">Erreur : {error}</div>;

  const hasCurated = curated && curated.selected_picks.length > 0;

  return (
    <section className="tennis-feed">
      <div className="tennis-feed-header">
        <div>
          <h3>Picks du jour — sélectionnés par Claude</h3>
          {curated?.generated_at && (
            <p className="muted">
              Généré {new Date(curated.generated_at).toLocaleString('fr-FR')}
            </p>
          )}
        </div>
        <button
          className="primary"
          disabled={running}
          onClick={() => void handleRunNow()}
          title="Scan Odds API + auto-score + Claude curator"
        >
          {running ? 'Scan en cours…' : '↻ Scanner maintenant'}
        </button>
      </div>

      {curated && (
        <p className="curator-daily-message">{curated.daily_message}</p>
      )}

      {!hasCurated && !running && (
        <div className="empty-state">
          <p>Pas encore de picks pour aujourd'hui.</p>
          <p className="muted">
            Configure <code>ODDS_API_KEY</code> dans l'env, puis clique <strong>Scanner
            maintenant</strong>. Le daemon scanne automatiquement à 08h00.
          </p>
        </div>
      )}

      {hasCurated && (
        <div className="curator-pick-list">
          {enriched.map((s) => (
            <CuratorPickRow
              key={s.pick.pickId}
              selection={s}
              riskStakeMultiplier={riskStakeMultiplier}
              bankrollEur={bankrollEur}
              onPlace={handlePlace}
            />
          ))}
        </div>
      )}

      {curated && curated.skipped_picks.length > 0 && (
        <details className="curator-skipped">
          <summary>
            {curated.skipped_picks.length} pick(s) écarté(s) par le curator
          </summary>
          <ul>
            {curated.skipped_picks.map((s) => (
              <li key={s.pick_id}>
                <code>{s.pick_id}</code> — {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

interface RowProps {
  selection: EnrichedSelection;
  riskStakeMultiplier: number;
  bankrollEur: number;
  onPlace: (pick: TennisPickRow, stakeEur: number) => Promise<void>;
}

function CuratorPickRow({
  selection,
  riskStakeMultiplier,
  bankrollEur,
  onPlace
}: RowProps): JSX.Element | null {
  const pick = selection.pick;
  const [stake, setStake] = useState<string>(() =>
    pick ? (bankrollEur * pick.kellyStakePct * riskStakeMultiplier).toFixed(2) : '0'
  );
  const [busy, setBusy] = useState(false);

  if (!pick) return null;
  const confClass = `confidence-${selection.confidence}`;

  async function place(): Promise<void> {
    const stakeEur = parseFloat(stake);
    if (!Number.isFinite(stakeEur) || stakeEur <= 0) return;
    setBusy(true);
    try {
      await onPlace(pick, stakeEur);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`curator-pick-row ${confClass}`}>
      <div className="curator-pick-rank">#{selection.rank}</div>
      <div className="curator-pick-body">
        <div className="curator-pick-tldr">{selection.tldr}</div>
        <div className="curator-pick-why">{selection.why}</div>
        <div className="curator-pick-meta">
          <span>Modèle {(pick.modelProb * 100).toFixed(1)}%</span>
          <span>·</span>
          <span>Edge {(pick.edgePct * 100).toFixed(1)}%</span>
          <span>·</span>
          <span>Score {pick.signalScore}/100</span>
          <span>·</span>
          <span>Kelly {(pick.kellyStakePct * 100).toFixed(2)}%</span>
          {riskStakeMultiplier < 1 && (
            <span className="muted"> (×{riskStakeMultiplier} risk-gate)</span>
          )}
        </div>
      </div>
      <div className="curator-pick-actions">
        <label>
          Mise (€)
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={stake}
            onChange={(e) => setStake(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy} onClick={() => void place()}>
          Placé sur {pick.bestBook}
        </button>
      </div>
    </article>
  );
}
