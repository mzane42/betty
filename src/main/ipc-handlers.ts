import { ipcMain, dialog } from 'electron';
import { spawn } from 'node:child_process';
import { copyFileSync, writeFileSync } from 'node:fs';
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
  getProgress,
  getEvBankroll,
  analyzeTimeOfDay
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
import { getActiveAccount, setActiveAccount, getSettings, updateSettings } from './account-store.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Resolves the current hero account at call time (changes when user switches). */
function hero(): string {
  return getActiveAccount();
}

let dbInstance: Database | null = null;

function db(): Database {
  if (!dbInstance) {
    dbInstance = openDatabase({ dbPath: defaultDbPath() });
  }
  return dbInstance;
}

export function registerIpcHandlers(): void {
  // Account / settings
  ipcMain.handle('account:list', () => {
    const rows = db()
      .prepare(`SELECT DISTINCT hero_account FROM tournaments ORDER BY hero_account`)
      .all() as Array<{ hero_account: string }>;
    return rows.map((r) => r.hero_account);
  });
  ipcMain.handle('account:get', () => getActiveAccount());
  ipcMain.handle('account:set', (_, account: string) => {
    setActiveAccount(account);
    return getActiveAccount();
  });
  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:update', (_, partial: Record<string, unknown>) => updateSettings(partial));

  // Bankroll
  ipcMain.handle('bankroll:summary', () => getBankrollSummary(db(), hero()));
  ipcMain.handle('bankroll:yearly', () => getYearlyBankroll(db(), hero()));
  ipcMain.handle('bankroll:monthly', () => getMonthlyBankroll(db(), hero()));
  ipcMain.handle('bankroll:roi-format', () => getRoiByFormat(db(), hero()));
  ipcMain.handle('bankroll:roi-stake', () => getRoiByStake(db(), hero()));
  ipcMain.handle('bankroll:chart', () => getBankrollChart(db(), hero()));

  // Analytics
  ipcMain.handle('analytics:leaks', () => {
    try {
      return findLeaks(db(), hero());
    } catch (err) {
      console.error('[analytics:leaks] failed:', err);
      throw err;
    }
  });
  ipcMain.handle('analytics:game-recommendations', () => {
    try {
      return recommendGames(db(), hero());
    } catch (err) {
      console.error('[analytics:game-recommendations] failed:', err);
      throw err;
    }
  });
  ipcMain.handle('analytics:progress', (_, granularity: 'quarter' | 'month' = 'quarter') => {
    try {
      return getProgress(db(), hero(), granularity);
    } catch (err) {
      console.error('[analytics:progress] failed:', err);
      throw err;
    }
  });

  ipcMain.handle('analytics:ev-bankroll', () => {
    try {
      return getEvBankroll(db(), hero());
    } catch (err) {
      console.error('[analytics:ev-bankroll] failed:', err);
      throw err;
    }
  });

  ipcMain.handle('analytics:time-of-day', () => {
    try {
      return analyzeTimeOfDay(db(), hero());
    } catch (err) {
      console.error('[analytics:time-of-day] failed:', err);
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
      .all(hero(), limit, offset);
  });

  // Player notes
  ipcMain.handle('player-notes:get', (_, playerName: string) => {
    const row = db()
      .prepare(`SELECT note, tags_json FROM player_notes WHERE hero_account = ? AND player_name = ?`)
      .get(hero(), playerName) as { note: string | null; tags_json: string | null } | undefined;
    if (!row) return { note: '', tags: [] };
    return { note: row.note ?? '', tags: row.tags_json ? (JSON.parse(row.tags_json) as string[]) : [] };
  });

  ipcMain.handle('player-notes:save', (_, playerName: string, note: string, tags: string[]) => {
    db()
      .prepare(
        `INSERT INTO player_notes (player_name, hero_account, note, tags_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(player_name, hero_account) DO UPDATE SET
           note = excluded.note,
           tags_json = excluded.tags_json,
           updated_at = excluded.updated_at`
      )
      .run(playerName, hero(), note, JSON.stringify(tags), new Date().toISOString());
    return { ok: true };
  });

  ipcMain.handle('player-notes:list', () => {
    const rows = db()
      .prepare(`SELECT player_name, note, tags_json FROM player_notes WHERE hero_account = ?`)
      .all(hero()) as Array<{ player_name: string; note: string | null; tags_json: string | null }>;
    const map: Record<string, { note: string; tags: string[] }> = {};
    for (const r of rows) {
      map[r.player_name] = {
        note: r.note ?? '',
        tags: r.tags_json ? (JSON.parse(r.tags_json) as string[]) : []
      };
    }
    return map;
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
      .all(hero(), hero(), limit, offset) as Array<Record<string, unknown>>;
    return rows.map((r) => derivePlayerStats(rowToRaw(r)));
  });

  ipcMain.handle('players:detail', (_, playerName: string) => {
    const row = db()
      .prepare(`SELECT * FROM player_stats WHERE hero_account = ? AND player_name = ?`)
      .get(hero(), playerName) as Record<string, unknown> | undefined;
    if (!row) return null;
    return derivePlayerStats(rowToRaw(row));
  });

  // Export session as Markdown
  ipcMain.handle('export:session-md', async (_, sessionDate: string) => {
    const tournaments = db()
      .prepare(
        `SELECT * FROM tournaments WHERE hero_account = ? AND DATE(start_time) = ?
         ORDER BY start_time ASC`
      )
      .all(hero(), sessionDate) as Array<{
      tournament_id: string;
      name: string;
      buy_in: number;
      rake: number;
      hero_finish_position: number;
      hero_winnings: number | null;
      start_time: string;
    }>;

    const hands = db()
      .prepare(
        `SELECT h.hand_id, h.hero_position, h.hero_cards, h.board,
          h.hero_invested, h.hero_won, h.total_pot, h.big_blind,
          (h.hero_won - h.hero_invested) as hero_net,
          h.hero_equity_river
         FROM hands h
         JOIN tournaments t ON h.tournament_id = t.tournament_id
         WHERE t.hero_account = ? AND DATE(t.start_time) = ?
         ORDER BY h.played_at ASC, h.hand_id ASC`
      )
      .all(hero(), sessionDate) as Array<{
      hand_id: string;
      hero_position: string | null;
      hero_cards: string | null;
      board: string | null;
      hero_invested: number;
      hero_won: number;
      total_pot: number;
      big_blind: number;
      hero_net: number;
      hero_equity_river: number | null;
    }>;

    const sessionReview = db()
      .prepare(`SELECT * FROM session_reviews WHERE session_date = ? AND hero_account = ?`)
      .get(sessionDate, hero()) as
      | {
          session_verdict: string;
          summary: string;
          patterns_json: string;
          biggest_mistake_json: string;
          biggest_win_json: string;
          lessons_json: string;
          next_session_focus: string;
        }
      | undefined;

    const lines: string[] = [];
    lines.push(`# Session du ${sessionDate}`);
    lines.push('');
    const totalCost = tournaments.reduce((s, t) => s + t.buy_in + t.rake, 0);
    const totalWon = tournaments.reduce((s, t) => s + (t.hero_winnings ?? 0), 0);
    const net = totalWon - totalCost;
    lines.push(`- **Joueur:** ${hero()}`);
    lines.push(`- **Tournois:** ${tournaments.length}`);
    lines.push(`- **Mains:** ${hands.length}`);
    lines.push(`- **Buy-ins:** ${totalCost.toFixed(2)}€`);
    lines.push(`- **Gains:** ${totalWon.toFixed(2)}€`);
    lines.push(`- **Net:** ${net >= 0 ? '+' : ''}${net.toFixed(2)}€`);
    lines.push('');

    if (sessionReview) {
      lines.push('## Analyse IA');
      lines.push('');
      lines.push(`**Verdict:** ${sessionReview.session_verdict}`);
      lines.push('');
      lines.push(sessionReview.summary);
      const patterns = JSON.parse(sessionReview.patterns_json || '[]');
      if (patterns.length > 0) {
        lines.push('');
        lines.push('### Patterns');
        for (const p of patterns) {
          lines.push(`- **${p.pattern}** _(${p.impact})_ — ${p.advice}`);
        }
      }
      const mistake = JSON.parse(sessionReview.biggest_mistake_json || 'null');
      if (mistake) {
        lines.push('');
        lines.push('### Plus grosse erreur');
        lines.push(mistake.description);
      }
      const win = JSON.parse(sessionReview.biggest_win_json || 'null');
      if (win) {
        lines.push('');
        lines.push('### Meilleur coup');
        lines.push(win.description);
      }
      const lessons = JSON.parse(sessionReview.lessons_json || '[]');
      if (lessons.length > 0) {
        lines.push('');
        lines.push('### Leçons');
        for (const l of lessons) lines.push(`- ${l}`);
      }
      if (sessionReview.next_session_focus) {
        lines.push('');
        lines.push(`### Focus prochaine session`);
        lines.push(sessionReview.next_session_focus);
      }
      lines.push('');
    }

    lines.push('## Tournois');
    lines.push('');
    lines.push('| Tournoi | Buy-in | Position | Gain | Net |');
    lines.push('|---------|--------|----------|------|-----|');
    for (const t of tournaments) {
      const cost = t.buy_in + t.rake;
      const won = t.hero_winnings ?? 0;
      lines.push(`| ${t.name} | ${cost.toFixed(2)}€ | ${t.hero_finish_position} | ${won.toFixed(2)}€ | ${(won - cost).toFixed(2)}€ |`);
    }
    lines.push('');

    lines.push('## Mains');
    lines.push('');
    lines.push('| # | Pos | Cartes | Board | Pot (jetons) | Investi | Net | Équity |');
    lines.push('|---|-----|--------|-------|-------------|---------|-----|--------|');
    hands.forEach((h, i) => {
      const cards = h.hero_cards ? (JSON.parse(h.hero_cards) as string[]).join('') : '—';
      const board = h.board ? (JSON.parse(h.board) as string[]).join(' ') : '—';
      const eq = h.hero_equity_river != null ? `${h.hero_equity_river.toFixed(0)}%` : '—';
      lines.push(
        `| ${i + 1} | ${h.hero_position ?? '?'} | ${cards} | ${board} | ${h.total_pot} | ${h.hero_invested} | ${h.hero_net} | ${eq} |`
      );
    });

    const md = lines.join('\n');

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Exporter session en Markdown',
      defaultPath: `session-${sessionDate}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    if (canceled || !filePath) return { saved: false, markdown: md };
    writeFileSync(filePath, md, 'utf-8');
    return { saved: true, path: filePath, markdown: md };
  });

  // DB backup
  ipcMain.handle('db:backup', async () => {
    const { defaultDbPath } = await import('../db/index.js');
    const src = defaultDbPath();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Sauvegarder la base de données',
      defaultPath: `poker-backup-${ts}.db`,
      filters: [{ name: 'SQLite DB', extensions: ['db'] }]
    });
    if (canceled || !filePath) return { saved: false };
    try {
      copyFileSync(src, filePath);
      return { saved: true, path: filePath };
    } catch (err) {
      console.error('[db:backup] failed', err);
      return { saved: false, error: (err as Error).message };
    }
  });

  // Hand search across DB
  ipcMain.handle('hands:search', (_, filters: {
    position?: string;
    minPot?: number;
    minInvested?: number;
    netSign?: 'positive' | 'negative' | 'any';
    minEquity?: number;
    maxEquity?: number;
    cardPattern?: string;
    boardPattern?: string;
    handStrength?: 'premium' | 'strong' | 'playable' | 'marginal' | 'weak';
    aiVerdict?: 'good' | 'okay' | 'mistake' | 'blunder';
    minBb?: number;
    maxBb?: number;
    limit?: number;
  } = {}) => {
    const where: string[] = ['h.hero_account = ?'];
    const params: (string | number)[] = [hero()];

    if (filters.position) {
      where.push('h.hero_position = ?');
      params.push(filters.position);
    }
    if (filters.minPot != null) {
      where.push('h.total_pot >= ?');
      params.push(filters.minPot);
    }
    if (filters.minInvested != null) {
      where.push('h.hero_invested >= ?');
      params.push(filters.minInvested);
    }
    if (filters.netSign === 'positive') where.push('h.hero_won - h.hero_invested > 0');
    else if (filters.netSign === 'negative') where.push('h.hero_won - h.hero_invested < 0');
    if (filters.minEquity != null) {
      where.push('COALESCE(h.hero_equity_river, h.hero_equity_turn, h.hero_equity_flop, h.hero_equity_preflop) >= ?');
      params.push(filters.minEquity);
    }
    if (filters.maxEquity != null) {
      where.push('COALESCE(h.hero_equity_river, h.hero_equity_turn, h.hero_equity_flop, h.hero_equity_preflop) <= ?');
      params.push(filters.maxEquity);
    }
    if (filters.minBb != null) {
      where.push('h.hero_invested / NULLIF(h.big_blind, 0) >= ?');
      params.push(filters.minBb);
    }
    if (filters.maxBb != null) {
      where.push('h.hero_invested / NULLIF(h.big_blind, 0) <= ?');
      params.push(filters.maxBb);
    }
    if (filters.cardPattern) {
      where.push('h.hero_cards LIKE ?');
      params.push(`%${filters.cardPattern}%`);
    }
    if (filters.boardPattern) {
      where.push('h.board LIKE ?');
      params.push(`%${filters.boardPattern}%`);
    }
    if (filters.aiVerdict) {
      where.push('hr.verdict = ?');
      params.push(filters.aiVerdict);
    }

    const limit = filters.limit ?? 200;
    params.push(limit);

    const rows = db()
      .prepare(
        `SELECT
          h.hand_id, h.hero_position, h.hero_cards, h.big_blind, h.board,
          h.hero_invested, h.hero_won, h.total_pot,
          (h.hero_won - h.hero_invested) as hero_net,
          h.played_at,
          h.hero_equity_preflop, h.hero_equity_flop, h.hero_equity_turn, h.hero_equity_river,
          DATE(h.played_at) as session_date,
          h.tournament_id,
          hr.verdict as ai_verdict
         FROM hands h
         LEFT JOIN hand_reviews hr ON hr.hand_id = h.hand_id
         WHERE ${where.join(' AND ')}
         ORDER BY h.played_at DESC
         LIMIT ?`
      )
      .all(...params) as Array<Record<string, unknown>>;
    return rows;
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
      .all(hero(), sessionDate) as Array<{
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
      .all(hero(), sessionDate) as Array<{
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
      const { appendHandMemory } = await import('../reviewer/coach-memory.js');
      appendHandMemory(handId, result);
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
      const sessionText = renderSessionForReview(db(), sessionDate, hero());
      console.log('[review:session]', sessionDate, 'prompt:', sessionText.length, 'chars');
      const result = await reviewSession(systemPrompt, sessionText);
      saveSessionReview(db(), sessionDate, hero(), result);
      const { appendSessionMemory } = await import('../reviewer/coach-memory.js');
      appendSessionMemory(sessionDate, result);
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
      const tournamentText = renderTournamentForReview(db(), tournamentId, hero());
      console.log('[review:tournament]', tournamentId, 'prompt:', tournamentText.length, 'chars');
      const result = await reviewTournament(systemPrompt, tournamentText);
      saveTournamentReview(db(), tournamentId, result);
      const { appendTournamentMemory } = await import('../reviewer/coach-memory.js');
      appendTournamentMemory(tournamentId, result);
      console.log('[review:tournament] done, verdict:', result.tournamentVerdict);
      return result;
    } catch (err) {
      console.error('[review:tournament] failed:', err);
      throw err;
    }
  });

  // Session annotations
  ipcMain.handle('session-annotation:get', (_, sessionDate: string) => {
    const row = db()
      .prepare(`SELECT annotation, mood FROM session_annotations WHERE session_date = ? AND hero_account = ?`)
      .get(sessionDate, hero()) as { annotation: string | null; mood: string | null } | undefined;
    return { annotation: row?.annotation ?? '', mood: row?.mood ?? '' };
  });
  ipcMain.handle('session-annotation:save', (_, sessionDate: string, annotation: string, mood: string) => {
    db()
      .prepare(
        `INSERT INTO session_annotations (session_date, hero_account, annotation, mood, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(session_date, hero_account) DO UPDATE SET
           annotation = excluded.annotation,
           mood = excluded.mood,
           updated_at = excluded.updated_at`
      )
      .run(sessionDate, hero(), annotation, mood, new Date().toISOString());
    return { ok: true };
  });

  // Streak detection + goal/stop-loss derived metrics
  ipcMain.handle('dashboard:trackers', () => {
    const sessions = db()
      .prepare(
        `SELECT DATE(start_time) as date,
          COALESCE(SUM(hero_winnings),0) - COALESCE(SUM(buy_in+rake),0) as net
         FROM tournaments WHERE hero_account = ? AND start_time IS NOT NULL
         GROUP BY date ORDER BY date ASC`
      )
      .all(hero()) as Array<{ date: string; net: number }>;

    // Current streak
    let streakLen = 0;
    let streakType: 'winning' | 'losing' | 'neutral' = 'neutral';
    const reversed = [...sessions].reverse();
    if (reversed.length > 0) {
      const sign = Math.sign(reversed[0]!.net);
      if (sign > 0) streakType = 'winning';
      else if (sign < 0) streakType = 'losing';
      for (const s of reversed) {
        if (Math.sign(s.net) === sign && sign !== 0) streakLen++;
        else break;
      }
    }

    // Today net
    const today = new Date().toISOString().slice(0, 10);
    const todayNet = sessions.find((s) => s.date === today)?.net ?? 0;

    // Year-to-date
    const year = today.slice(0, 4);
    const ytdNet = sessions.filter((s) => s.date.startsWith(year)).reduce((a, b) => a + b.net, 0);

    const settings = getSettings();

    // Goal progress
    let goalPct = 0;
    if (settings.goalAnnualNet && settings.goalAnnualNet > 0) {
      goalPct = (ytdNet / settings.goalAnnualNet) * 100;
    }

    // Stop-loss state for today
    const stopLossHit = settings.stopLossDaily ? todayNet <= -settings.stopLossDaily : false;

    return {
      streak: { length: streakLen, type: streakType, latestDate: reversed[0]?.date ?? null },
      todayNet,
      ytdNet,
      goalAnnualNet: settings.goalAnnualNet ?? null,
      goalPct,
      stopLossDaily: settings.stopLossDaily ?? null,
      stopLossHit
    };
  });

  // Compare sessions
  ipcMain.handle('sessions:compare', (_, dateA: string, dateB: string) => {
    const fetch = (d: string) => {
      const totals = db()
        .prepare(
          `SELECT COUNT(*) as tournaments,
            COALESCE(SUM(hero_winnings),0) as winnings,
            COALESCE(SUM(buy_in+rake),0) as buy_ins,
            COALESCE(SUM(hero_winnings),0) - COALESCE(SUM(buy_in+rake),0) as net
           FROM tournaments WHERE hero_account = ? AND DATE(start_time) = ?`
        )
        .get(hero(), d) as { tournaments: number; winnings: number; buy_ins: number; net: number };
      const handsAgg = db()
        .prepare(
          `SELECT COUNT(*) as hands,
            COALESCE(AVG(total_pot),0) as avg_pot,
            COALESCE(SUM(CASE WHEN hero_won - hero_invested > 0 THEN 1 ELSE 0 END), 0) * 100.0 / NULLIF(COUNT(*),0) as win_rate
           FROM hands h JOIN tournaments t ON h.tournament_id = t.tournament_id
           WHERE t.hero_account = ? AND DATE(t.start_time) = ?`
        )
        .get(hero(), d) as { hands: number; avg_pot: number; win_rate: number };
      return { date: d, ...totals, ...handsAgg };
    };
    return { a: fetch(dateA), b: fetch(dateB) };
  });

  // Variance simulator: Monte Carlo bankroll given hero ROI + stake + n tournaments
  ipcMain.handle('analytics:variance-sim', (_, opts: { tournaments?: number; iterations?: number } = {}) => {
    const heroAcc = hero();
    const stats = db()
      .prepare(
        `SELECT
          COALESCE(SUM(hero_winnings),0) - COALESCE(SUM(buy_in+rake),0) as net,
          COALESCE(SUM(buy_in+rake),0) as paid,
          COUNT(*) as n,
          COALESCE(AVG(buy_in+rake),0) as avg_buyin
         FROM tournaments WHERE hero_account = ? AND name != 'CashGame'`
      )
      .get(heroAcc) as { net: number; paid: number; n: number; avg_buyin: number };
    const roi = stats.paid > 0 ? stats.net / stats.paid : 0;
    if (stats.n < 30) return { runs: [], message: 'Pas assez de données', meta: { historicalRoi: roi, n: stats.n } };

    // Get per-tournament net to derive std dev
    const nets = db()
      .prepare(
        `SELECT (COALESCE(hero_winnings,0) - (buy_in+rake)) as net
         FROM tournaments WHERE hero_account = ? AND name != 'CashGame'`
      )
      .all(heroAcc) as Array<{ net: number }>;
    const mean = nets.reduce((a, b) => a + b.net, 0) / nets.length;
    const variance = nets.reduce((a, b) => a + (b.net - mean) ** 2, 0) / nets.length;
    const std = Math.sqrt(variance);

    const tournaments = opts.tournaments ?? 200;
    const iterations = opts.iterations ?? 200;
    const runs: number[][] = [];
    for (let it = 0; it < iterations; it++) {
      const path: number[] = [0];
      let cum = 0;
      for (let i = 0; i < tournaments; i++) {
        const sample = mean + std * normalRandom();
        cum += sample;
        path.push(cum);
      }
      runs.push(path);
    }
    return {
      runs,
      meta: { historicalRoi: roi, perTournamentMean: mean, perTournamentStd: std, n: stats.n }
    };
  });

  // Per-opponent deep dive
  ipcMain.handle('players:deep', (_, playerName: string) => {
    const stats = db()
      .prepare(`SELECT * FROM player_stats WHERE hero_account = ? AND player_name = ?`)
      .get(hero(), playerName) as Record<string, unknown> | undefined;
    const hands = db()
      .prepare(
        `SELECT h.hand_id, h.played_at, h.hero_cards, h.hero_position, h.big_blind,
          h.board, h.hero_invested, h.hero_won, h.total_pot,
          (h.hero_won - h.hero_invested) as hero_net,
          hp.cards as villain_cards, hp.won as villain_won,
          DATE(h.played_at) as session_date
         FROM hands h
         JOIN hand_players hp ON hp.hand_id = h.hand_id AND hp.player_name = ?
         WHERE h.hero_account = ?
         ORDER BY h.played_at DESC LIMIT 200`
      )
      .all(playerName, hero()) as Array<Record<string, unknown>>;
    const note = db()
      .prepare(`SELECT note, tags_json FROM player_notes WHERE hero_account = ? AND player_name = ?`)
      .get(hero(), playerName) as { note: string | null; tags_json: string | null } | undefined;
    return {
      stats,
      hands,
      note: note?.note ?? '',
      tags: note?.tags_json ? (JSON.parse(note.tags_json) as string[]) : []
    };
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
    getSessionReview(db(), sessionDate, hero())
  );
  ipcMain.handle('reviews:tournament-cached', (_, tournamentId: string) =>
    getTournamentReview(db(), tournamentId)
  );
  ipcMain.handle('reviews:hands-for-session', (_, sessionDate: string) => {
    const map = getHandReviewsForSession(db(), sessionDate, hero());
    return Object.fromEntries(map);
  });

  /**
   * List sessions and tournaments that have no AI review yet.
   * Used for auto-review after import.
   */
  // Nash compliance scan
  ipcMain.handle('nash:scan', async () => {
    const { tagNashCompliance, nashStats } = await import('../nash/nash-tagger.js');
    const tags = tagNashCompliance(db(), hero());
    return { tags, stats: nashStats(tags) };
  });

  ipcMain.handle('auto-review:pending', () => {
    const sessions = db()
      .prepare(
        `SELECT DISTINCT DATE(t.start_time) as session_date
         FROM tournaments t
         LEFT JOIN session_reviews sr
           ON sr.session_date = DATE(t.start_time) AND sr.hero_account = t.hero_account
         WHERE t.hero_account = ? AND sr.session_date IS NULL
         ORDER BY session_date DESC`
      )
      .all(hero()) as Array<{ session_date: string }>;

    const tournaments = db()
      .prepare(
        `SELECT t.tournament_id, DATE(t.start_time) as session_date
         FROM tournaments t
         LEFT JOIN tournament_reviews tr ON tr.tournament_id = t.tournament_id
         WHERE t.hero_account = ? AND tr.tournament_id IS NULL
         ORDER BY t.start_time DESC`
      )
      .all(hero()) as Array<{ tournament_id: string; session_date: string }>;

    return { sessions: sessions.map((s) => s.session_date), tournaments };
  });
}

function runImport(force: boolean) {
  const dirs = [
    join(homedir(), 'Documents', 'Winamax Poker', 'accounts', hero(), 'history'),
    join(
      homedir(),
      'Library',
      'Application Support',
      'winamax',
      'documents',
      'accounts',
      hero(),
      'history'
    )
  ];
  let totalFiles = 0;
  let totalHands = 0;
  let totalTournaments = 0;
  const errors: { file: string; message: string }[] = [];
  for (const historyDir of dirs) {
    try {
      const result = bulkImport(db(), { historyDir, heroAccount: hero(), force });
      totalFiles += result.filesProcessed;
      totalHands += result.handsImported;
      totalTournaments += result.tournamentsImported;
      errors.push(...result.errors);
    } catch {
      // dir missing — skip
    }
  }
  rebuildPlayerStats(db(), hero());
  return { filesProcessed: totalFiles, handsImported: totalHands, tournamentsImported: totalTournaments, errors };
}

// Box-Muller for variance sim
function normalRandom(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
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
