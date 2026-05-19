import { useEffect, useMemo, useState } from 'react';
import { pokerApi, type TennisGeneratePickInput } from '../api.js';

interface Props {
  onSubmit: (input: TennisGeneratePickInput) => Promise<void> | void;
}

interface PreviewState {
  score: number;
  verdict: 'STRONG' | 'PLAY' | 'SKIP';
  edge: number;
  kellyStakePct: number;
  fairDecimalOdds: number;
  modelProb: number;
}

const ROUNDS = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];

export function TennisNewPickForm({ onSubmit }: Props): JSX.Element {
  const [round, setRound] = useState('R128');
  const [scheduledAt, setScheduledAt] = useState(() => new Date().toISOString().slice(0, 16));

  const [p1Name, setP1Name] = useState('');
  const [p1Country, setP1Country] = useState('');
  const [p1Rank, setP1Rank] = useState<string>('');

  const [p2Name, setP2Name] = useState('');
  const [p2Country, setP2Country] = useState('');
  const [p2Rank, setP2Rank] = useState<string>('');

  const [selection, setSelection] = useState<'p1' | 'p2'>('p1');

  // Odds
  const [oddsWinamax, setOddsWinamax] = useState<string>('');
  const [oddsBetclic, setOddsBetclic] = useState<string>('');
  const [oddsUnibet, setOddsUnibet] = useState<string>('');
  const [oddsPinnacle, setOddsPinnacle] = useState<string>('');
  const [oddsBetfair, setOddsBetfair] = useState<string>('');

  // Optional signals
  const [pinnacleProb, setPinnacleProb] = useState<string>('');
  const [betfairVolume, setBetfairVolume] = useState<string>('');
  const [tipsterCount, setTipsterCount] = useState<string>('0');
  const [lineMovementPct, setLineMovementPct] = useState<string>('');

  // Manual override of model prob (useful when user has a strong view)
  const [manualModelProb, setManualModelProb] = useState<string>('');

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const p1Id = useMemo(() => slugId(p1Name), [p1Name]);
  const p2Id = useMemo(() => slugId(p2Name), [p2Name]);

  const placeableOdds = useMemo(() => ({
    winamax: parseOrUndef(oddsWinamax),
    betclic: parseOrUndef(oddsBetclic),
    unibet: parseOrUndef(oddsUnibet)
  }), [oddsWinamax, oddsBetclic, oddsUnibet]);

  const bestPlaceableOdds = useMemo(() => {
    const vals = Object.values(placeableOdds).filter((v): v is number => typeof v === 'number');
    return vals.length > 0 ? Math.max(...vals) : null;
  }, [placeableOdds]);

  // Live preview whenever inputs change.
  useEffect(() => {
    let cancelled = false;
    if (!bestPlaceableOdds || !p1Id || !p2Id) {
      setPreview(null);
      return;
    }

    // Compute model prob: manual override > rank-based.
    let modelProb: number | null = parseOrUndef(manualModelProb) ?? null;
    if (modelProb == null) {
      const r1 = parseOrUndef(p1Rank);
      const r2 = parseOrUndef(p2Rank);
      if (r1 == null && r2 == null) {
        setPreview(null);
        return;
      }
      const r1safe = r1 ?? 999;
      const r2safe = r2 ?? 999;
      const log1 = Math.log10(Math.max(1, r1safe));
      const log2 = Math.log10(Math.max(1, r2safe));
      const p1Win = 1 / (1 + Math.pow(10, (log1 - log2) / 0.85));
      modelProb = selection === 'p1' ? p1Win : 1 - p1Win;
    }

    const signalsObj = {
      pinnacleProb: parseOrUndef(pinnacleProb) ?? null,
      betfairVolume: parseOrUndef(betfairVolume) ?? null,
      tipsterAlignedCount: parseInt(tipsterCount, 10) || 0,
      lineMovementPct: parseOrUndef(lineMovementPct) ?? null
    };

    pokerApi
      .tennisPreviewVerdict({ modelProb, bookDecimalOdds: bestPlaceableOdds, signals: signalsObj })
      .then((res) => {
        if (cancelled) return;
        setPreview({ ...res, modelProb });
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    bestPlaceableOdds,
    p1Id,
    p2Id,
    p1Rank,
    p2Rank,
    selection,
    pinnacleProb,
    betfairVolume,
    tipsterCount,
    lineMovementPct,
    manualModelProb
  ]);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!p1Id || !p2Id || !bestPlaceableOdds) return;
    setSubmitting(true);
    try {
      const input: TennisGeneratePickInput = {
        match: {
          tournament: 'roland_garros_2026',
          surface: 'clay',
          round,
          scheduledAt: new Date(scheduledAt).toISOString(),
          player1: {
            id: p1Id,
            name: p1Name,
            country: p1Country || undefined,
            rank: parseOrUndef(p1Rank)
          },
          player2: {
            id: p2Id,
            name: p2Name,
            country: p2Country || undefined,
            rank: parseOrUndef(p2Rank)
          }
        },
        selection: selection === 'p1' ? p1Id : p2Id,
        oddsByBook: {
          winamax: parseOrUndef(oddsWinamax),
          betclic: parseOrUndef(oddsBetclic),
          unibet: parseOrUndef(oddsUnibet),
          pinnacle: parseOrUndef(oddsPinnacle),
          betfair: parseOrUndef(oddsBetfair)
        },
        signals: {
          pinnacleProb: parseOrUndef(pinnacleProb) ?? null,
          betfairVolume: parseOrUndef(betfairVolume) ?? null,
          tipsterAlignedCount: parseInt(tipsterCount, 10) || 0,
          lineMovementPct: parseOrUndef(lineMovementPct) ?? null
        }
      };
      await onSubmit(input);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="tennis-form" onSubmit={(e) => void handleSubmit(e)}>
      <div className="form-row">
        <label>
          Round
          <select value={round} onChange={(e) => setRound(e.target.value)}>
            {ROUNDS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date / Heure
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </label>
      </div>

      <div className="form-group">
        <h4>Joueur 1</h4>
        <div className="form-row">
          <label>
            Nom
            <input value={p1Name} onChange={(e) => setP1Name(e.target.value)} placeholder="Carlos Alcaraz" />
          </label>
          <label>
            Pays
            <input value={p1Country} onChange={(e) => setP1Country(e.target.value)} placeholder="ESP" />
          </label>
          <label>
            Rang ATP/WTA
            <input
              type="number"
              value={p1Rank}
              onChange={(e) => setP1Rank(e.target.value)}
              placeholder="2"
            />
          </label>
        </div>
      </div>

      <div className="form-group">
        <h4>Joueur 2</h4>
        <div className="form-row">
          <label>
            Nom
            <input value={p2Name} onChange={(e) => setP2Name(e.target.value)} placeholder="Grigor Dimitrov" />
          </label>
          <label>
            Pays
            <input value={p2Country} onChange={(e) => setP2Country(e.target.value)} placeholder="BUL" />
          </label>
          <label>
            Rang ATP/WTA
            <input
              type="number"
              value={p2Rank}
              onChange={(e) => setP2Rank(e.target.value)}
              placeholder="16"
            />
          </label>
        </div>
      </div>

      <div className="form-group">
        <h4>Sélection</h4>
        <label>
          <input
            type="radio"
            checked={selection === 'p1'}
            onChange={() => setSelection('p1')}
          />
          {p1Name || 'Joueur 1'}
        </label>
        <label style={{ marginLeft: 16 }}>
          <input
            type="radio"
            checked={selection === 'p2'}
            onChange={() => setSelection('p2')}
          />
          {p2Name || 'Joueur 2'}
        </label>
      </div>

      <div className="form-group">
        <h4>Cotes décimales (sélection)</h4>
        <div className="form-row">
          <label>
            Winamax
            <input
              type="number"
              step={0.01}
              value={oddsWinamax}
              onChange={(e) => setOddsWinamax(e.target.value)}
              placeholder="1.31"
            />
          </label>
          <label>
            Betclic
            <input
              type="number"
              step={0.01}
              value={oddsBetclic}
              onChange={(e) => setOddsBetclic(e.target.value)}
            />
          </label>
          <label>
            Unibet
            <input
              type="number"
              step={0.01}
              value={oddsUnibet}
              onChange={(e) => setOddsUnibet(e.target.value)}
            />
          </label>
          <label>
            Pinnacle (réf)
            <input
              type="number"
              step={0.01}
              value={oddsPinnacle}
              onChange={(e) => setOddsPinnacle(e.target.value)}
            />
          </label>
          <label>
            Betfair (réf)
            <input
              type="number"
              step={0.01}
              value={oddsBetfair}
              onChange={(e) => setOddsBetfair(e.target.value)}
            />
          </label>
        </div>
      </div>

      <details>
        <summary>Signaux avancés (optionnels)</summary>
        <div className="form-row">
          <label>
            Pinnacle no-vig prob (0-1)
            <input
              type="number"
              step={0.001}
              value={pinnacleProb}
              onChange={(e) => setPinnacleProb(e.target.value)}
              placeholder="0.78"
            />
          </label>
          <label>
            Betfair volume direction (-1 à 1)
            <input
              type="number"
              step={0.01}
              value={betfairVolume}
              onChange={(e) => setBetfairVolume(e.target.value)}
              placeholder="0.6"
            />
          </label>
          <label>
            Tipsters alignés (≥3 compte)
            <input
              type="number"
              value={tipsterCount}
              onChange={(e) => setTipsterCount(e.target.value)}
            />
          </label>
          <label>
            Line movement % (positif = en notre faveur)
            <input
              type="number"
              step={0.001}
              value={lineMovementPct}
              onChange={(e) => setLineMovementPct(e.target.value)}
              placeholder="0.05"
            />
          </label>
          <label>
            Override prob modèle (0-1, vide = rank-based)
            <input
              type="number"
              step={0.01}
              value={manualModelProb}
              onChange={(e) => setManualModelProb(e.target.value)}
              placeholder="0.78"
            />
          </label>
        </div>
      </details>

      {preview && (
        <div className={`pick-preview verdict-${preview.verdict.toLowerCase()}`}>
          <h4>Aperçu en direct</h4>
          <ul>
            <li>
              <strong>Verdict :</strong> {preview.verdict}
            </li>
            <li>
              <strong>Score :</strong> {preview.score}/100
            </li>
            <li>
              <strong>Prob modèle :</strong> {(preview.modelProb * 100).toFixed(1)}% (cote juste{' '}
              {preview.fairDecimalOdds.toFixed(2)})
            </li>
            <li>
              <strong>Edge :</strong> {(preview.edge * 100).toFixed(1)}%
            </li>
            <li>
              <strong>Kelly (frac 1/4 borné) :</strong> {(preview.kellyStakePct * 100).toFixed(2)}%
              bankroll
            </li>
          </ul>
        </div>
      )}

      <button type="submit" className="primary" disabled={submitting || !preview}>
        {submitting ? 'Génération…' : 'Générer pick + review Claude'}
      </button>
    </form>
  );
}

function slugId(name: string): string {
  const parts = name.trim().toLowerCase().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '';
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const firstInitial = parts[0][0];
  return `${last}_${firstInitial}`.replace(/[^a-z0-9_]/g, '');
}

function parseOrUndef(s: string): number | undefined {
  if (s.trim() === '') return undefined;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : undefined;
}
