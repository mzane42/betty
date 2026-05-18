import { Fragment, useEffect, useState } from 'react';
import { pokerApi, type SessionDetailResult, type SessionHand, type SessionReviewResult, type TournamentReviewResult, type HandReviewResult } from '../api.js';
import { ProfitBadge } from '../components/ProfitBadge.js';
import { CardGroup } from '../components/PlayingCard.js';
import { PositionBadge } from '../components/PositionBadge.js';
import { ResultIcon } from '../components/ResultIcon.js';
import { BoardTextureTags } from '../components/BoardTextureTags.js';
import { HandReplay } from '../components/HandReplay.js';
import { SortHeader, SearchBox } from '../components/SortHeader.js';
import { useTable } from '../lib/use-table.js';

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
  const [reviewElapsed, setReviewElapsed] = useState(0);
  const [expandedHand, setExpandedHand] = useState<string | null>(null);

  useEffect(() => {
    if (!reviewLoading) return;
    setReviewElapsed(0);
    const start = Date.now();
    const interval = setInterval(() => setReviewElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(interval);
  }, [reviewLoading]);

  const [handVerdicts, setHandVerdicts] = useState<Record<string, { verdict: string; overall: string }>>({});
  const [pendingHandReview, setPendingHandReview] = useState<string | null>(null);
  const [tournamentReviews, setTournamentReviews] = useState<Record<string, TournamentReviewResult>>({});
  const [pendingTournament, setPendingTournament] = useState<string | null>(null);
  const [tournamentError, setTournamentError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      pokerApi.getSessionDetail(sessionDate),
      pokerApi.getCachedSessionReview(sessionDate),
      pokerApi.getHandReviewsForSession(sessionDate)
    ])
      .then(([d, cachedReview, handMap]) => {
        setData(d);
        if (cachedReview) setReview(cachedReview);
        setHandVerdicts(handMap);
        // Load any cached tournament reviews for this session
        Promise.all(
          d.tournaments.map((t) => pokerApi.getCachedTournamentReview(t.tournament_id))
        ).then((reviews) => {
          const map: Record<string, TournamentReviewResult> = {};
          reviews.forEach((r, i) => {
            if (r) map[d.tournaments[i]!.tournament_id] = r;
          });
          setTournamentReviews(map);
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message ?? 'Erreur de chargement');
        setLoading(false);
      });
  }, [sessionDate]);

  function runHandReview(handId: string): void {
    setPendingHandReview(handId);
    pokerApi
      .reviewHand(handId)
      .then((r) => {
        setHandVerdicts((prev) => ({ ...prev, [handId]: { verdict: r.verdict, overall: r.overall } }));
        setPendingHandReview(null);
      })
      .catch((err) => {
        console.error('Hand review failed:', err);
        setPendingHandReview(null);
      });
  }

  function runTournamentReview(tournamentId: string): void {
    setTournamentError(null);
    setPendingTournament(tournamentId);
    pokerApi
      .reviewTournament(tournamentId)
      .then((r) => {
        setTournamentReviews((prev) => ({ ...prev, [tournamentId]: r }));
        setPendingTournament(null);
      })
      .catch((err) => {
        setTournamentError(`${tournamentId}: ${err?.message ?? 'Erreur'}`);
        setPendingTournament(null);
      });
  }

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

  const VERDICT_ORDER: Record<string, number> = { blunder: 0, mistake: 1, okay: 2, good: 3 };
  const handsTable = useTable<SessionHand>(data?.hands ?? [], {
    defaultSort: { key: 'hand_number', dir: 'asc' },
    getValue: (h, key) => {
      if (key === 'hero_cards') return h.hero_cards_parsed?.join('') ?? '';
      if (key === 'board') return h.board_parsed.join('');
      if (key === 'review_verdict') {
        const v = handVerdicts[h.hand_id]?.verdict;
        return v ? VERDICT_ORDER[v] ?? 4 : 4;
      }
      return (h as unknown as Record<string, unknown>)[key] as string | number | null;
    },
    searchFn: (h, q) => {
      const cards = (h.hero_cards_parsed ?? []).join('').toLowerCase();
      const board = h.board_parsed.join('').toLowerCase();
      const pos = (h.hero_position ?? '').toLowerCase();
      const v = handVerdicts[h.hand_id]?.verdict ?? '';
      return cards.includes(q) || board.includes(q) || pos.includes(q) || v.includes(q);
    }
  });

  const tournamentsTable = useTable(data?.tournaments ?? [], {
    defaultSort: { key: 'start_time', dir: 'asc' },
    searchFn: (t, q) => t.name.toLowerCase().includes(q)
  });

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
          {reviewLoading ? `Claude analyse… ${reviewElapsed}s` : 'Analyse IA avec Claude'}
        </button>
        {reviewLoading && (
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Sessions longues = 60-180s. Patiente.
          </p>
        )}

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
        <div className="card-title-row">
          <h3 className="card-title">Tournois</h3>
          <SearchBox value={tournamentsTable.search} onChange={tournamentsTable.setSearch} placeholder="Type de tournoi…" />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <SortHeader label="Tournoi" sortKey="name" activeKey={tournamentsTable.sortKey} dir={tournamentsTable.sortDir} onClick={tournamentsTable.toggleSort} />
              <SortHeader label="Buy-in" sortKey="buy_in" activeKey={tournamentsTable.sortKey} dir={tournamentsTable.sortDir} onClick={tournamentsTable.toggleSort} numeric />
              <SortHeader label="Position" sortKey="hero_finish_position" activeKey={tournamentsTable.sortKey} dir={tournamentsTable.sortDir} onClick={tournamentsTable.toggleSort} numeric />
              <SortHeader label="Gain" sortKey="hero_winnings" activeKey={tournamentsTable.sortKey} dir={tournamentsTable.sortDir} onClick={tournamentsTable.toggleSort} numeric />
              <th className="num">Net</th>
              <th>Analyse</th>
            </tr>
          </thead>
          <tbody>
            {tournamentsTable.rows.map((t) => {
              const cost = t.buy_in + t.rake;
              const won = t.hero_winnings ?? 0;
              const tReview = tournamentReviews[t.tournament_id];
              const isPending = pendingTournament === t.tournament_id;
              return (
                <Fragment key={t.tournament_id}>
                  <tr>
                    <td>{t.name}</td>
                    <td className="num">{cost.toFixed(2)}€</td>
                    <td className="num">{t.hero_finish_position}</td>
                    <td className="num">{won.toFixed(2)}€</td>
                    <td className="num">
                      <ProfitBadge value={won - cost} size="sm" />
                    </td>
                    <td>
                      <button
                        className="mini-sparkle-btn"
                        onClick={() => runTournamentReview(t.tournament_id)}
                        disabled={isPending}
                        title={tReview ? 'Re-analyser' : 'Analyser ce tournoi'}
                      >
                        <MiniSparkle />
                        {isPending ? '…' : tReview ? '↻' : 'Analyser'}
                      </button>
                    </td>
                  </tr>
                  {tReview && (
                    <tr className="review-inline-row">
                      <td colSpan={6}>
                        <TournamentReviewBlock review={tReview} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {tournamentError && <div className="error" style={{ marginTop: 8 }}>{tournamentError}</div>}
      </div>

      <div className="card">
        <div className="card-title-row">
          <h3 className="card-title">Mains ({handsTable.rows.length}/{data.hands.length})</h3>
          <SearchBox value={handsTable.search} onChange={handsTable.setSearch} placeholder="Position, cartes, board…" />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <SortHeader label="#" sortKey="hand_number" activeKey={handsTable.sortKey} dir={handsTable.sortDir} onClick={handsTable.toggleSort} />
              <SortHeader label="Pos" sortKey="hero_position" activeKey={handsTable.sortKey} dir={handsTable.sortDir} onClick={handsTable.toggleSort} />
              <SortHeader label="Cartes" sortKey="hero_cards" activeKey={handsTable.sortKey} dir={handsTable.sortDir} onClick={handsTable.toggleSort} />
              <SortHeader label="Board" sortKey="board" activeKey={handsTable.sortKey} dir={handsTable.sortDir} onClick={handsTable.toggleSort} />
              <SortHeader label="Pot (jetons)" sortKey="total_pot" activeKey={handsTable.sortKey} dir={handsTable.sortDir} onClick={handsTable.toggleSort} numeric />
              <SortHeader label="Investi (jetons)" sortKey="hero_invested" activeKey={handsTable.sortKey} dir={handsTable.sortDir} onClick={handsTable.toggleSort} numeric />
              <SortHeader label="Net (jetons)" sortKey="hero_net" activeKey={handsTable.sortKey} dir={handsTable.sortDir} onClick={handsTable.toggleSort} numeric />
              <th></th>
              <SortHeader label="IA" sortKey="review_verdict" activeKey={handsTable.sortKey} dir={handsTable.sortDir} onClick={handsTable.toggleSort} />
            </tr>
          </thead>
          <tbody>
            {handsTable.rows.map((h) => {
              const expanded = expandedHand === h.hand_id;
              return (
                <Fragment key={h.hand_id}>
                  <tr className={expanded ? 'row-expanded' : ''}>
                    <td>
                      <button
                        className="expand-btn"
                        onClick={() => setExpandedHand(expanded ? null : h.hand_id)}
                        aria-label="Voir le replay"
                      >
                        {expanded ? '▾' : '▸'}
                      </button>
                    </td>
                    <td>{h.hand_number}</td>
                    <td><PositionBadge position={h.hero_position} /></td>
                    <td><CardGroup cards={h.hero_cards_parsed} size="sm" withStrength /></td>
                    <td>
                      <div className="board-cell">
                        <CardGroup cards={h.board_parsed} size="sm" />
                        <BoardTextureTags board={h.board_parsed} />
                      </div>
                    </td>
                    <td className="num"><ChipNumber value={h.total_pot} /></td>
                    <td className="num"><ChipNumber value={h.hero_invested} /></td>
                    <td className="num">
                      <ProfitBadge value={h.hero_net} size="sm" unit="chips" />
                    </td>
                    <td>
                      <ResultIcon net={h.hero_net} invested={h.hero_invested} />
                    </td>
                    <td>
                      <HandVerdictCell
                        handId={h.hand_id}
                        verdict={handVerdicts[h.hand_id]}
                        pending={pendingHandReview === h.hand_id}
                        onAnalyze={() => runHandReview(h.hand_id)}
                      />
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="replay-row">
                      <td colSpan={10}>
                        <HandReplay handId={h.hand_id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
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
          <span className="hand-cards"><CardGroup cards={h.hero_cards_parsed} size="sm" withStrength /></span>
          <PositionBadge position={h.hero_position} />
          <ProfitBadge value={h.hero_net} size="sm" unit="chips" />
        </li>
      ))}
    </ul>
  );
}

function translateVerdict(v: 'winning' | 'even' | 'losing'): string {
  return { winning: 'SESSION GAGNANTE', even: 'SESSION ÉQUILIBRÉE', losing: 'SESSION PERDANTE' }[v];
}

function ChipNumber({ value }: { value: number }): JSX.Element {
  return (
    <span className="chip-number">
      {Math.round(value).toLocaleString('fr-FR')}
      <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden style={{ verticalAlign: '-1px', marginLeft: 3, opacity: 0.7 }}>
        <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.18" />
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1" />
        <line x1="8" y1="0.6" x2="8" y2="3" stroke="currentColor" strokeWidth="1.2" />
        <line x1="8" y1="13" x2="8" y2="15.4" stroke="currentColor" strokeWidth="1.2" />
        <line x1="0.6" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1.2" />
        <line x1="13" y1="8" x2="15.4" y2="8" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </span>
  );
}

function MiniSparkle(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="12" height="12" aria-hidden>
      <path
        d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function HandVerdictCell({
  handId,
  verdict,
  pending,
  onAnalyze
}: {
  handId: string;
  verdict: { verdict: string; overall: string } | undefined;
  pending: boolean;
  onAnalyze: () => void;
}): JSX.Element {
  if (pending) return <span className="muted">…</span>;
  if (!verdict) {
    return (
      <button
        className="mini-sparkle-btn"
        onClick={onAnalyze}
        title={`Analyser main ${handId}`}
      >
        <MiniSparkle />
      </button>
    );
  }
  return (
    <span className={`hand-verdict v-${verdict.verdict}`} title={verdict.overall}>
      {translateHandVerdict(verdict.verdict)}
    </span>
  );
}

function translateHandVerdict(v: string): string {
  return { good: 'Bon', okay: 'OK', mistake: 'Erreur', blunder: 'Blunder' }[v] ?? v;
}

function TournamentReviewBlock({ review }: { review: TournamentReviewResult }): JSX.Element {
  return (
    <div className="tournament-review-inline">
      <div className={`verdict-badge t-verdict-${review.tournamentVerdict}`}>
        {translateTournamentVerdict(review.tournamentVerdict)}
      </div>
      <p className="ai-summary">{review.summary}</p>

      {review.phaseAnalysis.length > 0 && (
        <div className="phase-grid">
          {review.phaseAnalysis.map((p, i) => (
            <div key={i} className={`phase-card phase-${p.play_quality}`}>
              <div className="phase-header">
                <span className="phase-name">{translatePhase(p.phase)}</span>
                <span className="phase-stack muted">{p.stack_range}</span>
              </div>
              <p className="phase-comment">{p.comment}</p>
            </div>
          ))}
        </div>
      )}

      {review.pivotHand && (
        <div className="review-callout review-mistake">
          <strong>Main pivot {review.pivotHand.hand_number}:</strong> {review.pivotHand.description}
        </div>
      )}

      {review.keyDecisions.length > 0 && (
        <>
          <h4>Décisions clés</h4>
          <ul className="key-decisions-list">
            {review.keyDecisions.map((d, i) => (
              <li key={i} className={`decision v-${d.verdict}`}>
                <span className="decision-hand">#{d.hand_number}</span>
                <span className="decision-text">
                  <strong>{translateHandVerdict(d.verdict)}:</strong> {d.decision}. {d.lesson}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {review.lessons.length > 0 && (
        <>
          <h4>Leçons</h4>
          <ul className="lesson-list">
            {review.lessons.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

function translateTournamentVerdict(v: string): string {
  return { won: 'TOURNOI GAGNÉ', deep: 'BELLE PROGRESSION', 'early-bust': 'BUST PRÉCOCE' }[v] ?? v;
}

function translatePhase(p: string): string {
  return { early: 'Début', mid: 'Milieu', late: 'Push/fold', 'heads-up': 'Heads-up' }[p] ?? p;
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
