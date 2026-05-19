import { useEffect, useState } from 'react';
import {
  pokerApi,
  type TennisCuratorOutput,
  type TennisPickRow
} from '../api.js';
import { toast } from '../lib/toast.js';
import { PlayerFormHud } from './PlayerFormHud.js';
import { Icon } from './Icon.js';

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
  const [scanLog, setScanLog] = useState<string[]>([]);
  const [enableReddit, setEnableReddit] = useState(false);
  const [lastScanStats, setLastScanStats] = useState<{
    events: number;
    strong: number;
    play: number;
    skip: number;
  } | null>(null);

  useEffect(() => {
    const off = pokerApi.onTennisScanProgress((line) => {
      setScanLog((prev) => [...prev, line]);
    });
    return off;
  }, []);

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
    setScanLog([]); // clear previous run
    setLastScanStats(null);
    try {
      const res = await pokerApi.tennisDaemonAutoScoreNow({ enableReddit });
      setLastScanStats({
        events: res.score.eventsConsidered,
        strong: res.score.strongPicks,
        play: res.score.playPicks,
        skip: res.score.skippedPicks
      });
      toast.success(
        `Auto-score: ${res.score.eventsConsidered} events → ` +
          `${res.score.strongPicks} STRONG + ${res.score.playPicks} PLAY. ` +
          `Curator: ${res.curated.selected_picks.length} retenus.`
      );
      await loadCached();
      await onChange?.();
    } catch (err) {
      toast.error(`Erreur: ${(err as Error).message}`);
      setScanLog((prev) => [...prev, `✗ ERREUR: ${(err as Error).message}`]);
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
        <div className="tennis-feed-controls">
          <label className="reddit-toggle" title="Ajoute le signal Reddit tipsters. Ralentit le scan (~7 min vs ~30s).">
            <input
              type="checkbox"
              checked={enableReddit}
              onChange={(e) => setEnableReddit(e.target.checked)}
              disabled={running}
            />
            <span>Inclure Reddit {enableReddit && '(lent)'}</span>
          </label>
          <button
            className="primary"
            disabled={running}
            onClick={() => void handleRunNow()}
            title="Scan Odds API + auto-score + Claude curator"
          >
            {running ? (
              <>Scan en cours…</>
            ) : (
              <>
                <Icon.RefreshCw size={14} /> Scanner maintenant
              </>
            )}
          </button>
        </div>
      </div>

      {curated && (
        <p className="curator-daily-message">{curated.daily_message}</p>
      )}

      {!hasCurated && !running && scanLog.length === 0 && !lastScanStats && !curated && (
        <div className="empty-state">
          <p>Pas encore de picks pour aujourd'hui.</p>
          <p className="muted">
            Configure <code>ODDS_API_KEY</code> dans l'env, puis clique <strong>Scanner
            maintenant</strong>. Le daemon scanne automatiquement à 08h00.
          </p>
        </div>
      )}

      {!hasCurated && !running && (lastScanStats || curated) && (
        <div className="empty-state empty-state-scanned">
          <p>
            <strong>Scan terminé — aucun pick +EV trouvé aujourd'hui.</strong>
          </p>
          {lastScanStats && (
            <p className="muted">
              {lastScanStats.events} events analysés · {lastScanStats.strong} STRONG ·{' '}
              {lastScanStats.play} PLAY · {lastScanStats.skip} SKIP.
            </p>
          )}
          {curated?.daily_message && (
            <p className="muted curator-daily-message-inline">
              💬 {curated.daily_message}
            </p>
          )}
          <p className="muted">
            Cela arrive : Unibet alignée sur Pinnacle (cotes serrées sur les têtes de
            série, marges élevées sur les outsiders). Réessaie demain ou plus tard
            dans la journée — les cotes bougent.
          </p>
          <details>
            <summary className="muted">Pourquoi tout SKIP ?</summary>
            <ul>
              <li><strong>Edge négatif</strong> = Unibet propose moins que la cote juste Pinnacle no-vig.</li>
              <li>Sur les têtes de série R1 RG, les books ont la même info → pas de mispricing.</li>
              <li>Les opportunités +EV apparaissent souvent en cours de tournoi (R3+) ou sur ATP 250 / Challengers (non couverts par l'API gratuit).</li>
              <li>Active <em>Inclure Reddit</em> pour ajouter le signal tipsters (~7 min de scan).</li>
            </ul>
          </details>
        </div>
      )}

      {scanLog.length > 0 && (
        <details className="scan-log" open={running}>
          <summary>
            Journal du scan ({scanLog.length} ligne{scanLog.length > 1 ? 's' : ''})
            {running && ' — en cours'}
          </summary>
          <pre>
            {scanLog.map((line, i) => (
              <span key={i} className={logLineClass(line)}>
                {line}
                {'\n'}
              </span>
            ))}
          </pre>
        </details>
      )}

      {hasCurated && (
        <div className="curator-pick-list">
          {enriched
            .filter((s): s is EnrichedSelection & { pick: TennisPickRow } => s.pick != null)
            .map((s) => (
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
  selection: EnrichedSelection & { pick: TennisPickRow };
  riskStakeMultiplier: number;
  bankrollEur: number;
  onPlace: (pick: TennisPickRow, stakeEur: number) => Promise<void>;
}

function logLineClass(line: string): string {
  if (line.startsWith('✗') || line.includes('ERROR') || line.includes('ERREUR')) return 'log-error';
  if (line.startsWith('✔') || line.startsWith('✓')) return 'log-success';
  if (line.startsWith('▶') || line.startsWith('💬')) return 'log-info';
  if (line.includes('STRONG')) return 'log-strong';
  if (line.includes('PLAY')) return 'log-play';
  if (line.includes('SKIP')) return 'log-skip';
  return '';
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
    if (!pick) return;
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
        <div className="curator-pick-form">
          <PlayerFormHud playerName={pick.selection} compact />
        </div>
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
