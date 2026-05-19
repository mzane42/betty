import { ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import { defaultDbPath, openDatabase, type Database } from '../db/index.js';
import {
  getBankrollSummary,
  getYearlyBankroll,
  getMonthlyBankroll,
  getRoiByFormat,
  getRoiByStake,
  getBankrollChart,
  rebuildPlayerStats,
  findLeaks,
  recommendGames,
  getProgress
} from '../stats/index.js';
import { derivePlayerStats } from '../stats/derived-stats.js';
import type { PlayerStatsRaw } from '../types/player.js';
import { bulkImport } from '../importer/bulk-importer.js';
import {
  saveHandReview,
  saveSessionReview,
  saveTournamentReview,
  getHandReview,
  getSessionReview,
  getTournamentReview,
  getHandReviewsForSession
} from '../db/repositories/review-repository.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HERO_ACCOUNT = 'mzane42';

let dbInstance: Database | null = null;

function db(): Database {
  if (!dbInstance) {
    dbInstance = openDatabase({ dbPath: defaultDbPath() });
  }
  return dbInstance;
}

export function registerIpcHandlers(): void {
  // Bankroll
  ipcMain.handle('bankroll:summary', () => getBankrollSummary(db(), HERO_ACCOUNT));
  ipcMain.handle('bankroll:yearly', () => getYearlyBankroll(db(), HERO_ACCOUNT));
  ipcMain.handle('bankroll:monthly', () => getMonthlyBankroll(db(), HERO_ACCOUNT));
  ipcMain.handle('bankroll:roi-format', () => getRoiByFormat(db(), HERO_ACCOUNT));
  ipcMain.handle('bankroll:roi-stake', () => getRoiByStake(db(), HERO_ACCOUNT));
  ipcMain.handle('bankroll:chart', () => getBankrollChart(db(), HERO_ACCOUNT));

  // Analytics
  ipcMain.handle('analytics:leaks', () => {
    try {
      return findLeaks(db(), HERO_ACCOUNT);
    } catch (err) {
      console.error('[analytics:leaks] failed:', err);
      throw err;
    }
  });
  ipcMain.handle('analytics:game-recommendations', () => {
    try {
      return recommendGames(db(), HERO_ACCOUNT);
    } catch (err) {
      console.error('[analytics:game-recommendations] failed:', err);
      throw err;
    }
  });
  ipcMain.handle('analytics:progress', (_, granularity: 'quarter' | 'month' = 'quarter') => {
    try {
      return getProgress(db(), HERO_ACCOUNT, granularity);
    } catch (err) {
      console.error('[analytics:progress] failed:', err);
      throw err;
    }
  });

  // Sessions
  ipcMain.handle('sessions:list', (_, { limit = 50, offset = 0 } = {}) => {
    return db()
      .prepare(
        `SELECT
          DATE(start_time) as session_date,
          COUNT(*) as tournaments_played,
          COALESCE(SUM(hero_winnings),0) as winnings,
          COALESCE(SUM(buy_in + rake),0) as buy_ins,
          COALESCE(SUM(hero_winnings),0) - COALESCE(SUM(buy_in + rake),0) as net
        FROM tournaments
        WHERE hero_account = ? AND start_time IS NOT NULL
        GROUP BY session_date
        ORDER BY session_date DESC
        LIMIT ? OFFSET ?`
      )
      .all(HERO_ACCOUNT, limit, offset);
  });

  // Players
  ipcMain.handle('players:list', (_, { limit = 50, offset = 0, sortBy = 'hands_played' } = {}) => {
    const validSort = ['hands_played', 'total_won'].includes(sortBy) ? sortBy : 'hands_played';
    const rows = db()
      .prepare(
        `SELECT * FROM player_stats
         WHERE hero_account = ? AND player_name != ?
         ORDER BY ${validSort} DESC
         LIMIT ? OFFSET ?`
      )
      .all(HERO_ACCOUNT, HERO_ACCOUNT, limit, offset) as Array<Record<string, unknown>>;
    return rows.map((r) => derivePlayerStats(rowToRaw(r)));
  });

  ipcMain.handle('players:detail', (_, playerName: string) => {
    const row = db()
      .prepare(`SELECT * FROM player_stats WHERE hero_account = ? AND player_name = ?`)
      .get(HERO_ACCOUNT, playerName) as Record<string, unknown> | undefined;
    if (!row) return null;
    return derivePlayerStats(rowToRaw(row));
  });

  // Equity backfill
  ipcMain.handle('equity:backfill', async (_, opts: { limit?: number } = {}) => {
    const { backfillEquity } = await import('../equity/equity-calculator.js');
    return backfillEquity(db(), { limit: opts.limit });
  });

  ipcMain.handle('equity:stats', () => {
    const row = db()
      .prepare(
        `SELECT COUNT(*) as total,
          SUM(CASE WHEN equity_computed_at IS NOT NULL THEN 1 ELSE 0 END) as computed
         FROM hands WHERE hero_cards IS NOT NULL
           AND EXISTS (SELECT 1 FROM hand_players hp WHERE hp.hand_id = hands.hand_id AND hp.is_hero = 0 AND hp.cards IS NOT NULL)`
      )
      .get() as { total: number; computed: number };
    return row;
  });

  // Hands
  ipcMain.handle('hands:detail', (_, handId: string) => {
    const hand = db().prepare(`SELECT * FROM hands WHERE hand_id = ?`).get(handId);
    if (!hand) return null;
    const players = db().prepare(`SELECT * FROM hand_players WHERE hand_id = ?`).all(handId);
    const actions = db()
      .prepare(`SELECT * FROM actions WHERE hand_id = ? ORDER BY action_order ASC`)
      .all(handId);
    return { hand, players, actions };
  });

  // Sessions detail by date
  ipcMain.handle('sessions:detail', (_, sessionDate: string) => {
    const tournaments = db()
      .prepare(
        `SELECT * FROM tournaments
         WHERE hero_account = ? AND DATE(start_time) = ?
         ORDER BY start_time ASC`
      )
      .all(HERO_ACCOUNT, sessionDate) as Array<{
      tournament_id: string;
      name: string;
      buy_in: number;
      rake: number;
      hero_finish_position: number;
      hero_winnings: number | null;
      start_time: string;
    }>;

    const handsRaw = db()
      .prepare(
        `SELECT
          h.hand_id,
          h.tournament_id,
          h.tournament_name,
          h.hero_position,
          h.hero_cards,
          h.big_blind,
          h.board,
          h.hero_invested,
          h.hero_won,
          h.total_pot,
          h.played_at,
          (h.hero_won - h.hero_invested) as hero_net,
          h.hero_equity_preflop,
          h.hero_equity_flop,
          h.hero_equity_turn,
          h.hero_equity_river
        FROM hands h
        JOIN tournaments t ON h.tournament_id = t.tournament_id
        WHERE t.hero_account = ? AND DATE(t.start_time) = ?
        ORDER BY h.played_at ASC, h.hand_id ASC`
      )
      .all(HERO_ACCOUNT, sessionDate) as Array<{
      hand_id: string;
      tournament_id: string;
      tournament_name: string;
      hero_position: string | null;
      hero_cards: string | null;
      big_blind: number;
      board: string | null;
      hero_invested: number;
      hero_won: number;
      total_pot: number;
      played_at: string;
      hero_net: number;
      hero_equity_preflop: number | null;
      hero_equity_flop: number | null;
      hero_equity_turn: number | null;
      hero_equity_river: number | null;
    }>;

    const hands = handsRaw.map((h, i) => ({
      ...h,
      hand_number: i + 1,
      hero_cards_parsed: h.hero_cards ? (JSON.parse(h.hero_cards) as string[]) : null,
      board_parsed: h.board ? (JSON.parse(h.board) as string[]) : []
    }));

    const sorted = [...hands].sort((a, b) => b.hero_net - a.hero_net);
    const topWins = sorted.filter((h) => h.hero_net > 0).slice(0, 3);
    const topLosses = sorted.filter((h) => h.hero_net < 0).slice(-3).reverse();

    const totals = {
      tournamentsPlayed: tournaments.length,
      buyIns: tournaments.reduce((s, t) => s + t.buy_in + t.rake, 0),
      winnings: tournaments.reduce((s, t) => s + (t.hero_winnings ?? 0), 0),
      net: tournaments.reduce((s, t) => s + (t.hero_winnings ?? 0) - t.buy_in - t.rake, 0),
      handsPlayed: hands.length
    };

    return { sessionDate, tournaments, hands, totals, highlights: { topWins, topLosses } };
  });

  // Import
  ipcMain.handle('import:new-session', () => runImport(false));
  ipcMain.handle('import:all', (_, { force = false } = {}) => runImport(force));

  // Review
  ipcMain.handle('review:hand', async (_, handId: string) => {
    try {
      const { loadBasePrompt, renderHandForReview, reviewHand } = await import('../reviewer/index.js');
      const systemPrompt = loadBasePrompt();
      const handText = renderHandForReview(db(), handId);
      console.log('[review:hand]', handId, 'prompt:', handText.length, 'chars');
      const result = await reviewHand(systemPrompt, handText);
      saveHandReview(db(), handId, result);
      console.log('[review:hand] done, verdict:', result.verdict);
      return result;
    } catch (err) {
      console.error('[review:hand] failed:', err);
      throw err;
    }
  });

  ipcMain.handle('review:session', async (_, sessionDate: string) => {
    try {
      const { loadSessionPrompt, renderSessionForReview, reviewSession } = await import(
        '../reviewer/index.js'
      );
      const systemPrompt = loadSessionPrompt();
      const sessionText = renderSessionForReview(db(), sessionDate, HERO_ACCOUNT);
      console.log('[review:session]', sessionDate, 'prompt:', sessionText.length, 'chars');
      const result = await reviewSession(systemPrompt, sessionText);
      saveSessionReview(db(), sessionDate, HERO_ACCOUNT, result);
      console.log('[review:session] done, verdict:', result.sessionVerdict);
      return result;
    } catch (err) {
      console.error('[review:session] failed:', err);
      throw err;
    }
  });

  ipcMain.handle('review:tournament', async (_, tournamentId: string) => {
    try {
      const { loadTournamentPrompt, renderTournamentForReview, reviewTournament } = await import(
        '../reviewer/index.js'
      );
      const systemPrompt = loadTournamentPrompt();
      const tournamentText = renderTournamentForReview(db(), tournamentId, HERO_ACCOUNT);
      console.log('[review:tournament]', tournamentId, 'prompt:', tournamentText.length, 'chars');
      const result = await reviewTournament(systemPrompt, tournamentText);
      saveTournamentReview(db(), tournamentId, result);
      console.log('[review:tournament] done, verdict:', result.tournamentVerdict);
      return result;
    } catch (err) {
      console.error('[review:tournament] failed:', err);
      throw err;
    }
  });

  // Coach terminal: opens Terminal.app with claude CLI primed by brief
  ipcMain.handle('coach:open-terminal', (_, opts: { clean?: boolean } = {}) => {
    const script = '/Users/bubblz/poker/scripts/open-coach-terminal.sh';
    const args = opts.clean ? ['--clean'] : [];
    const child = spawn(script, args, { detached: true, stdio: 'ignore' });
    child.unref();
    return { spawned: true };
  });

  // Cached review fetches (no Claude call, just DB read)
  ipcMain.handle('reviews:hand-cached', (_, handId: string) => getHandReview(db(), handId));
  ipcMain.handle('reviews:session-cached', (_, sessionDate: string) =>
    getSessionReview(db(), sessionDate, HERO_ACCOUNT)
  );
  ipcMain.handle('reviews:tournament-cached', (_, tournamentId: string) =>
    getTournamentReview(db(), tournamentId)
  );
  ipcMain.handle('reviews:hands-for-session', (_, sessionDate: string) => {
    const map = getHandReviewsForSession(db(), sessionDate, HERO_ACCOUNT);
    return Object.fromEntries(map);
  });
}

function runImport(force: boolean) {
  const dirs = [
    join(homedir(), 'Documents', 'Winamax Poker', 'accounts', HERO_ACCOUNT, 'history'),
    join(
      homedir(),
      'Library',
      'Application Support',
      'winamax',
      'documents',
      'accounts',
      HERO_ACCOUNT,
      'history'
    )
  ];
  let totalFiles = 0;
  let totalHands = 0;
  let totalTournaments = 0;
  const errors: { file: string; message: string }[] = [];
  for (const historyDir of dirs) {
    try {
      const result = bulkImport(db(), { historyDir, heroAccount: HERO_ACCOUNT, force });
      totalFiles += result.filesProcessed;
      totalHands += result.handsImported;
      totalTournaments += result.tournamentsImported;
      errors.push(...result.errors);
    } catch {
      // dir missing — skip
    }
  }
  rebuildPlayerStats(db(), HERO_ACCOUNT);
  return { filesProcessed: totalFiles, handsImported: totalHands, tournamentsImported: totalTournaments, errors };
}

function rowToRaw(r: Record<string, unknown>): PlayerStatsRaw {
  return {
    playerName: r['player_name'] as string,
    heroAccount: r['hero_account'] as string,
    handsPlayed: r['hands_played'] as number,
    vpipOpportunities: r['vpip_opportunities'] as number,
    vpipActions: r['vpip_actions'] as number,
    pfrOpportunities: r['pfr_opportunities'] as number,
    pfrActions: r['pfr_actions'] as number,
    threeBetOpportunities: r['three_bet_opportunities'] as number,
    threeBetActions: r['three_bet_actions'] as number,
    foldTo3betOpportunities: r['fold_to_3bet_opportunities'] as number,
    foldTo3betActions: r['fold_to_3bet_actions'] as number,
    cbetOpportunities: r['cbet_opportunities'] as number,
    cbetActions: r['cbet_actions'] as number,
    foldToCbetOpportunities: r['fold_to_cbet_opportunities'] as number,
    foldToCbetActions: r['fold_to_cbet_actions'] as number,
    totalBets: r['total_bets'] as number,
    totalRaises: r['total_raises'] as number,
    totalCalls: r['total_calls'] as number,
    wentToShowdown: r['went_to_showdown'] as number,
    wonAtShowdown: r['won_at_showdown'] as number,
    totalWon: r['total_won'] as number,
    totalInvested: r['total_invested'] as number,
    firstSeen: (r['first_seen'] as string | null) ?? null,
    lastSeen: (r['last_seen'] as string | null) ?? null
  };
}
