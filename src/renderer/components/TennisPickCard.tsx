import { useState } from 'react';
import type { TennisPickRow } from '../api.js';
import { Icon } from './Icon.js';

interface Props {
  pick: TennisPickRow;
  onPlaceBet: (pick: TennisPickRow, stakeEur: number) => Promise<void> | void;
}

interface ClaudeReview {
  pickVerdict?: string;
  summary?: string;
  rationale?: string[];
  cautions?: string[];
  glossary?: { term: string; def: string }[];
}

const ASSUMED_BANKROLL_EUR = 200; // TODO: wire to real tennis bankroll once seeded

export function TennisPickCard({ pick, onPlaceBet }: Props): JSX.Element {
  const [stake, setStake] = useState<string>(() =>
    (ASSUMED_BANKROLL_EUR * pick.kellyStakePct).toFixed(2)
  );
  const [busy, setBusy] = useState(false);

  let review: ClaudeReview = {};
  if (pick.claudeReviewJson) {
    try {
      review = JSON.parse(pick.claudeReviewJson) as ClaudeReview;
    } catch {
      review = {};
    }
  }

  const verdictClass = `verdict-${pick.verdict.toLowerCase()}`;

  async function handlePlace(): Promise<void> {
    const stakeEur = parseFloat(stake);
    if (!Number.isFinite(stakeEur) || stakeEur <= 0) return;
    setBusy(true);
    try {
      await onPlaceBet(pick, stakeEur);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`tennis-pick-card ${verdictClass}`}>
      <header>
        <span className={`pick-verdict ${verdictClass}`}>{pick.verdict}</span>
        <span className="pick-score">Score {pick.signalScore}/100</span>
        <span className="pick-edge">Edge {(pick.edgePct * 100).toFixed(1)}%</span>
      </header>

      <div className="pick-summary">
        <strong>{pick.selection}</strong> @ {pick.bookDecimalOdds.toFixed(2)} sur{' '}
        <strong>{pick.bestBook}</strong>
        <span className="muted"> (juste : {pick.fairDecimalOdds.toFixed(2)})</span>
      </div>

      <div className="pick-numbers">
        <div>
          <span className="muted">Modèle</span>
          <strong>{(pick.modelProb * 100).toFixed(1)}%</strong>
        </div>
        <div>
          <span className="muted">Kelly</span>
          <strong>{(pick.kellyStakePct * 100).toFixed(2)}%</strong>
        </div>
        <div>
          <span className="muted">Généré</span>
          <strong>{new Date(pick.generatedAt).toLocaleString('fr-FR')}</strong>
        </div>
      </div>

      {review.summary && <p className="pick-claude-summary">{review.summary}</p>}

      {review.rationale && review.rationale.length > 0 && (
        <ul className="pick-rationale">
          {review.rationale.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}

      {review.cautions && review.cautions.length > 0 && (
        <div className="pick-cautions">
          <strong><Icon.AlertTriangle size={14} /> Attention</strong>
          <ul>
            {review.cautions.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {!pick.claudeReviewJson && (
        <p className="muted">
          <em>Review Claude indisponible — réessaie au prochain batch.</em>
        </p>
      )}

      <footer className="pick-actions">
        <label>
          Mise (€) :
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={stake}
            onChange={(e) => setStake(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy} onClick={() => void handlePlace()}>
          Placé sur {pick.bestBook}
        </button>
      </footer>
    </article>
  );
}
