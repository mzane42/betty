import { useEffect, useState } from 'react';
import { pokerApi, type SessionDetailResult, type SessionHand, type SessionReviewResult } from '../api.js';
import { ProfitBadge } from '../components/ProfitBadge.js';

interface Props {
  sessionDate: string;
  onBack: () => void;
}

export function SessionDetail({ sessionDate, onBack }: Props): JSX.Element {
  const [data, setData] = useState<SessionDetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [review, setReview] = useState<SessionReviewResult | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    pokerApi
      .getSessionDetail(sessionDate)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message ?? 'Erreur de chargement');
        setLoading(false);
      });
  }, [sessionDate]);

  function runReview(): void {
    setReview(null);
    setReviewError(null);
    setReviewLoading(true);
    pokerApi
      .reviewSession(sessionDate)
      .then((r) => {
        setReview(r);
        setReviewLoading(false);
      })
      .catch((err) => {
        setReviewError(err?.message ?? 'Erreur Claude');
        setReviewLoading(false);
      });
  }

  if (loading) return <div className="loading">Chargement de la session…</div>;
  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="error">Session introuvable</div>;

  return (
    <div className="session-detail-page">
      <button className="back-btn" onClick={onBack}>← Sessions</button>

      <div className="session-header">
        <div>
          <h2>Session du {sessionDate}</h2>
          <p className="muted">
            {data.totals.tournamentsPlayed} tournois · {data.totals.handsPlayed} mains
          </p>
        </div>
        <div className="session-net-hero">
          <span className="muted">Net session</span>
          <ProfitBadge value={data.totals.net} size="lg" />
        </div>
      </div>

      <div className="ai-review-section">
        <button
          className="sparkle-btn"
          onClick={runReview}
          disabled={reviewLoading}
        >
          <SparkleIcon />
          {reviewLoading ? 'Claude analyse…' : 'Analyse IA avec Claude'}
        </button>

        {reviewError && (
          <div className="error" style={{ marginTop: 12 }}>{reviewError}</div>
        )}

        {review && (
          <div className="ai-review-result">
            <div className={`verdict-badge verdict-${review.sessionVerdict}`}>
              {translateVerdict(review.sessionVerdict)}
            </div>
            <p className="ai-summary">{review.summary}</p>

            {review.patterns.length > 0 && (
              <>
                <h4>Patterns détectés</h4>
                <ul className="pattern-list">
                  {review.patterns.map((p, i) => (
                    <li key={i} className={`pattern-${p.impact}`}>
                      <strong>{p.pattern}</strong>
                      <span className="pattern-advice">{p.advice}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {review.biggestMistake && (
              <div className="review-callout review-mistake">
                <strong>Plus grosse erreur:</strong> {review.biggestMistake.description}
              </div>
            )}

            {review.biggestWin && (
              <div className="review-callout review-win">
                <strong>Meilleur coup:</strong> {review.biggestWin.description}
              </div>
            )}

            {review.lessons.length > 0 && (
              <>
                <h4>Leçons</h4>
                <ul className="lesson-list">
                  {review.lessons.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </>
            )}

            {review.nextSessionFocus && (
              <div className="review-callout review-focus">
                <strong>Focus prochaine session:</strong> {review.nextSessionFocus}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="highlights-grid">
        <div className="card">
          <h3 className="card-title">Top gains</h3>
          <HighlightList hands={data.highlights.topWins} />
        </div>
        <div className="card">
          <h3 className="card-title">Top pertes</h3>
          <HighlightList hands={data.highlights.topLosses} />
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Tournois</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Tournoi</th>
              <th className="num">Buy-in</th>
              <th className="num">Position</th>
              <th className="num">Gain</th>
              <th className="num">Net</th>
            </tr>
          </thead>
          <tbody>
            {data.tournaments.map((t) => {
              const cost = t.buy_in + t.rake;
              const won = t.hero_winnings ?? 0;
              return (
                <tr key={t.tournament_id}>
                  <td>{t.name}</td>
                  <td className="num">{cost.toFixed(2)}€</td>
                  <td className="num">{t.hero_finish_position}</td>
                  <td className="num">{won.toFixed(2)}€</td>
                  <td className="num">
                    <ProfitBadge value={won - cost} size="sm" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 className="card-title">Mains ({data.hands.length})</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Position</th>
              <th>Cartes</th>
              <th>Board</th>
              <th className="num">Pot</th>
              <th className="num">Investi</th>
              <th className="num">Net (jetons)</th>
            </tr>
          </thead>
          <tbody>
            {data.hands.map((h) => (
              <tr key={h.hand_id}>
                <td>{h.hand_number}</td>
                <td>{h.hero_position ?? '-'}</td>
                <td>{formatCards(h.hero_cards_parsed)}</td>
                <td>{formatCards(h.board_parsed)}</td>
                <td className="num">{h.total_pot}</td>
                <td className="num">{h.hero_invested}</td>
                <td className="num">
                  <ProfitBadge value={h.hero_net} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HighlightList({ hands }: { hands: SessionHand[] }): JSX.Element {
  if (hands.length === 0) return <p className="muted">Aucune main remarquable.</p>;
  return (
    <ul className="highlight-list">
      {hands.map((h) => (
        <li key={h.hand_id}>
          <span className="hand-num">#{h.hand_number}</span>
          <span className="hand-cards">{formatCards(h.hero_cards_parsed)}</span>
          <span className="hand-pos muted">{h.hero_position ?? '-'}</span>
          <ProfitBadge value={h.hero_net} size="sm" />
        </li>
      ))}
    </ul>
  );
}

function formatCards(cards: string[] | null): string {
  if (!cards || cards.length === 0) return '-';
  return cards.join(' ');
}

function translateVerdict(v: 'winning' | 'even' | 'losing'): string {
  return { winning: 'SESSION GAGNANTE', even: 'SESSION ÉQUILIBRÉE', losing: 'SESSION PERDANTE' }[v];
}

function SparkleIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18" aria-hidden>
      <path
        d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
        fill="currentColor"
      />
      <path d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z" fill="currentColor" />
      <path d="M5 14L5.6 15.4L7 16L5.6 16.6L5 18L4.4 16.6L3 16L4.4 15.4L5 14Z" fill="currentColor" />
    </svg>
  );
}
