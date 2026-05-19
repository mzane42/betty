/**
 * Tennis IPC handlers. Registered from main/index.ts alongside the poker handlers.
 *
 * Channel naming: `tennis:<noun>:<verb>` or `tennis:<verb>`.
 */

import { randomBytes } from 'node:crypto';
import { ipcMain } from 'electron';
import type { Database } from '../db/database.js';
import { generatePick, previewVerdict, type GeneratePickInput } from './pick-generator.js';
import {
  getBet,
  getPick,
  getTennisBankrollChart,
  getTennisBankrollSummary,
  insertBet,
  listAllBets,
  listMatchesByDate,
  listPicksForDay,
  listUpcomingMatches,
  setPostMatchReview,
  settleBet,
  setMatchStatus
} from '../db/repositories/tennis-repository.js';
import {
  reviewTennisPostMatch,
  type TennisPostMatchContext
} from './claude-tennis-reviewer.js';
import {
  evaluateRiskGate,
  loadRiskConfig,
  manualPause,
  manualResume,
  saveRiskConfig,
  type RiskConfig
} from './risk-gate.js';
import type {
  BetResult,
  PickVerdict,
  TennisBet,
  TennisBook,
  TennisMatchStatus
} from '../types/tennis.js';

export function registerTennisIpc(getDb: () => Database): void {
  ipcMain.handle('tennis:picks:today', (_, tournament: string, dateIso?: string) => {
    const date = dateIso ?? new Date().toISOString().slice(0, 10);
    return listPicksForDay(getDb(), tournament, date, 'PLAY');
  });

  ipcMain.handle('tennis:picks:get', (_, pickId: string) => getPick(getDb(), pickId));

  ipcMain.handle('tennis:matches:upcoming', (_, tournament: string) =>
    listUpcomingMatches(getDb(), tournament)
  );

  ipcMain.handle('tennis:matches:by-date', (_, tournament: string, dateIso: string) =>
    listMatchesByDate(getDb(), tournament, dateIso)
  );

  ipcMain.handle(
    'tennis:matches:set-status',
    (
      _,
      matchId: string,
      status: TennisMatchStatus,
      winnerId: string | null,
      score: string | null
    ) => {
      setMatchStatus(getDb(), matchId, status, winnerId, score);
      return { ok: true };
    }
  );

  ipcMain.handle('tennis:generate-pick', async (_, input: GeneratePickInput) => {
    return generatePick(getDb(), input);
  });

  ipcMain.handle(
    'tennis:preview-verdict',
    (
      _,
      params: {
        modelProb: number;
        bookDecimalOdds: number;
        signals?: {
          pinnacleProb?: number | null;
          betfairVolume?: number | null;
          tipsterAlignedCount?: number;
          lineMovementPct?: number | null;
        };
      }
    ) => previewVerdict(params)
  );

  ipcMain.handle(
    'tennis:bets:place',
    (
      _,
      input: {
        pickId: string | null;
        matchId: string;
        selection: string;
        book: TennisBook;
        decimalOdds: number;
        stakeEur: number;
      }
    ) => {
      const bet: TennisBet = {
        betId: `bet_${Date.now()}_${randomBytes(4).toString('hex')}`,
        pickId: input.pickId,
        matchId: input.matchId,
        selection: input.selection,
        book: input.book,
        decimalOdds: input.decimalOdds,
        stakeEur: input.stakeEur,
        placedAt: new Date().toISOString(),
        result: null,
        pnlEur: null,
        closingOdds: null,
        postMatchReviewJson: null
      };
      insertBet(getDb(), bet);
      return bet;
    }
  );

  ipcMain.handle(
    'tennis:bets:settle',
    (event, betId: string, result: BetResult, pnlEur: number, closingOdds: number | null) => {
      const db = getDb();
      settleBet(db, betId, result, pnlEur, closingOdds);

      // Fire post-match Claude review asynchronously — IPC returns immediately,
      // review lands in DB when Claude responds. Renderer can poll via
      // `tennis:bets:get-review` or refresh listAllBets.
      void (async () => {
        try {
          const bet = getBet(db, betId);
          if (!bet) return;
          const match = db
            .prepare(
              `SELECT m.match_id, m.tournament, m.round, m.surface, m.scheduled_at,
                      m.player1_id, m.player2_id, m.winner_id, m.score
               FROM tennis_matches m WHERE m.match_id = ?`
            )
            .get(bet.matchId) as
            | {
                match_id: string;
                tournament: string;
                round: string;
                surface: string;
                scheduled_at: string;
                player1_id: string;
                player2_id: string;
                winner_id: string | null;
                score: string | null;
              }
            | undefined;
          if (!match) return;
          const pick = bet.pickId ? getPick(db, bet.pickId) : null;
          const ctx: TennisPostMatchContext = {
            pick: {
              selection: pick?.selection ?? bet.selection,
              decimalOdds: pick?.bookDecimalOdds ?? bet.decimalOdds,
              bestBook: pick?.bestBook ?? bet.book,
              edgePct: pick?.edgePct ?? 0,
              kellyStakePct: pick?.kellyStakePct ?? 0,
              verdict: pick?.verdict ?? 'SKIP',
              signalScore: pick?.signalScore ?? 0
            },
            bet: {
              stakeEur: bet.stakeEur,
              decimalOdds: bet.decimalOdds,
              result: result as 'won' | 'lost' | 'void',
              pnlEur,
              closingOdds
            },
            matchResult: {
              winnerId: match.winner_id,
              score: match.score
            }
          };
          const review = await reviewTennisPostMatch(ctx);
          setPostMatchReview(db, betId, JSON.stringify(review));
          event.sender.send('tennis:bets:review-ready', { betId });
        } catch (err) {
          console.error('[tennis] post-match review failed', err);
          event.sender.send('tennis:bets:review-failed', {
            betId,
            message: (err as Error).message
          });
        }
      })();

      return { ok: true };
    }
  );

  ipcMain.handle('tennis:bets:get-review', (_, betId: string) => {
    const bet = getBet(getDb(), betId);
    return bet?.postMatchReviewJson ?? null;
  });

  ipcMain.handle('tennis:bets:list', () => listAllBets(getDb()));

  ipcMain.handle('tennis:bankroll:summary', (_, tournament?: string) =>
    getTennisBankrollSummary(getDb(), tournament)
  );

  ipcMain.handle('tennis:bankroll:chart', () => getTennisBankrollChart(getDb()));

  ipcMain.handle(
    'tennis:reviews:post-match',
    async (_, ctx: TennisPostMatchContext) => {
      return reviewTennisPostMatch(ctx);
    }
  );

  ipcMain.handle(
    'tennis:picks:list-day',
    (_, tournament: string, dateIso: string, minVerdict: PickVerdict = 'PLAY') =>
      listPicksForDay(getDb(), tournament, dateIso, minVerdict)
  );

  ipcMain.handle('tennis:picks:audit-day', async (_, dateIso?: string) => {
    const { listAllPicksForDate } = await import(
      '../db/repositories/tennis-repository.js'
    );
    const date = dateIso ?? new Date().toISOString().slice(0, 10);
    return listAllPicksForDate(getDb(), date);
  });

  ipcMain.handle('tennis:picks:prune', async (_, keepDays: number) => {
    const { prunePicksOlderThan } = await import(
      '../db/repositories/tennis-repository.js'
    );
    return prunePicksOlderThan(getDb(), keepDays);
  });

  // ----- Risk gate -----
  ipcMain.handle('tennis:risk:status', () => evaluateRiskGate(getDb()));

  ipcMain.handle('tennis:risk:config', () => loadRiskConfig());

  ipcMain.handle(
    'tennis:risk:save-config',
    (_, partial: Partial<RiskConfig>) => {
      const cfg = { ...loadRiskConfig(), ...partial };
      saveRiskConfig(cfg);
      return cfg;
    }
  );

  ipcMain.handle('tennis:risk:pause', (_, hours: number) => manualPause(hours));

  ipcMain.handle('tennis:risk:resume', () => manualResume());

  // ----- Curator (autonomous feed) -----
  ipcMain.handle('tennis:curator:today', async (_, dateIso?: string) => {
    const { readCuratorCache } = await import('./curator.js');
    const date = dateIso ?? new Date().toISOString().slice(0, 10);
    return readCuratorCache(date);
  });

  ipcMain.handle('tennis:curator:run-now', async () => {
    const { runCurator } = await import('./curator.js');
    return runCurator(getDb(), { pushTelegram: false });
  });

  ipcMain.handle(
    'tennis:daemon:auto-score-now',
    async (event, opts: { enableReddit?: boolean } = {}) => {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ODDS_API_KEY non configure. Pas d'auto-score possible — utilise le formulaire manuel."
      );
    }
    const { createOddsApiClient } = await import('./ingest/odds-api.js');
    const { runAutoScore } = await import('./auto-scorer.js');
    const { runCurator } = await import('./curator.js');
    const client = createOddsApiClient({ apiKey });
    const enableReddit = opts.enableReddit ?? false;

    // Stream progress to the renderer as soon as each line is emitted.
    const send = (line: string): void => {
      event.sender.send('tennis:scan-progress', line);
    };
    send(`▶ Démarrage du scan…`);
    send(`Clé API OK, fenêtre 36h, Reddit ${enableReddit ? 'activé (scan plus lent)' : 'désactivé (rapide)'}`);

    const score = await runAutoScore(getDb(), client, {
      enableReddit,
      windowHours: 36
    });
    for (const line of score.logs) send(line);

    send(`▶ Curator Claude…`);
    const curated = await runCurator(getDb(), { pushTelegram: false });
    send(
      `✔ Curator: ${curated.selected_picks.length} pick(s) retenu(s), ${curated.skipped_picks.length} écarté(s)`
    );
    if (curated.daily_message) send(`💬 ${curated.daily_message}`);
    send(`✓ Scan terminé`);
    return { score, curated };
    }
  );
}
