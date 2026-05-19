import { useEffect, useState } from 'react';
import { pokerApi, type TennisBetRow } from '../api.js';
import { Icon } from './Icon.js';

interface Props {
  bet: TennisBetRow;
}

interface PostMatchReview {
  decisionQuality: 'good' | 'okay' | 'mistake';
  resultSummary: string;
  evAssessment: string;
  whatWorked: string[];
  whatFailed: string[];
  lessons: string[];
}

export function BetReviewCell({ bet }: Props): JSX.Element {
  const [review, setReview] = useState<PostMatchReview | null>(() => parse(bet.postMatchReviewJson));
  const [open, setOpen] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    setReview(parse(bet.postMatchReviewJson));
  }, [bet.postMatchReviewJson]);

  useEffect(() => {
    const off = pokerApi.onTennisReviewReady?.(async (betId) => {
      if (betId !== bet.betId) return;
      const json = await pokerApi.tennisGetBetReview(bet.betId);
      setReview(parse(json));
      setWaiting(false);
    });
    return () => off?.();
  }, [bet.betId]);

  useEffect(() => {
    if (bet.result != null && !review && !bet.postMatchReviewJson) {
      setWaiting(true);
    }
  }, [bet.result, review, bet.postMatchReviewJson]);

  if (bet.result == null) return <span className="muted">—</span>;
  if (!review)
    return (
      <span className="muted">
        {waiting ? (
          <>
            <Icon.Clock size={12} /> claude…
          </>
        ) : (
          '—'
        )}
      </span>
    );

  const qualityClass =
    review.decisionQuality === 'good'
      ? 'review-good'
      : review.decisionQuality === 'mistake'
        ? 'review-mistake'
        : 'review-okay';

  return (
    <div className="review-cell">
      <button className={`review-badge ${qualityClass}`} onClick={() => setOpen(!open)}>
        {review.decisionQuality === 'good' ? (
          <>
            <Icon.Check size={12} /> bon
          </>
        ) : review.decisionQuality === 'mistake' ? (
          <>
            <Icon.X size={12} /> erreur
          </>
        ) : (
          <>
            <Icon.Minus size={12} /> okay
          </>
        )}
      </button>
      {open && (
        <div className="review-popover" onClick={() => setOpen(false)}>
          <div className="review-popover-content" onClick={(e) => e.stopPropagation()}>
            <h4>Review post-match</h4>
            <p className="review-summary">{review.resultSummary}</p>
            <p className="review-ev"><strong>EV:</strong> {review.evAssessment}</p>
            {review.whatWorked.length > 0 && (
              <>
                <h5>Ce qui a marché</h5>
                <ul>{review.whatWorked.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>
            )}
            {review.whatFailed.length > 0 && (
              <>
                <h5>Ce qui a échoué</h5>
                <ul>{review.whatFailed.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>
            )}
            {review.lessons.length > 0 && (
              <>
                <h5>Leçons</h5>
                <ul>{review.lessons.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>
            )}
            <button className="review-close" onClick={() => setOpen(false)}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function parse(json: string | null): PostMatchReview | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as PostMatchReview;
  } catch {
    return null;
  }
}
