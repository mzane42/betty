import { ipcMain } from 'electron';
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
  ipcMain.handle('analytics:leaks', () => findLeaks(db(), HERO_ACCOUNT));
  ipcMain.handle('analytics:game-recommendations', () => recommendGames(db(), HERO_ACCOUNT));
  ipcMain.handle('analytics:progress', (_, granularity: 'quarter' | 'month' = 'quarter') =>
    getProgress(db(), HERO_ACCOUNT, granularity)
  );

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
      .all(HERO_ACCOUNT, sessionDate);
    return { sessionDate, tournaments };
  });

  // Import
  ipcMain.handle('import:new-session', () => runImport(false));
  ipcMain.handle('import:all', (_, { force = false } = {}) => runImport(force));

  // Review
  ipcMain.handle('review:hand', async (_, handId: string) => {
    const { loadBasePrompt, renderHandForReview, reviewHand } = await import('../reviewer/index.js');
    const systemPrompt = loadBasePrompt();
    const handText = renderHandForReview(db(), handId);
    return reviewHand(systemPrompt, handText);
  });

  ipcMain.handle('review:session', async (_, sessionDate: string) => {
    const { loadSessionPrompt, renderSessionForReview, reviewSession } = await import(
      '../reviewer/index.js'
    );
    const systemPrompt = loadSessionPrompt();
    const sessionText = renderSessionForReview(db(), sessionDate, HERO_ACCOUNT);
    return reviewSession(systemPrompt, sessionText);
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
