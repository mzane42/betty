import { contextBridge, ipcRenderer } from 'electron';

type TerminalListener = (data: string) => void;
type TerminalExitListener = (code: number) => void;

const api = {
  // Terminal (PTY)
  createTerminal: (opts: { cwd?: string; cmd?: string } = {}) =>
    ipcRenderer.invoke('terminal:create', opts) as Promise<{ id: string }>,
  writeTerminal: (id: string, data: string) => ipcRenderer.invoke('terminal:write', id, data),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', id, cols, rows),
  closeTerminal: (id: string) => ipcRenderer.invoke('terminal:close', id),
  onTerminalData: (id: string, listener: TerminalListener) => {
    const ch = `terminal:data:${id}`;
    const wrapped = (_: unknown, data: string): void => listener(data);
    ipcRenderer.on(ch, wrapped);
    return () => ipcRenderer.removeListener(ch, wrapped);
  },
  onTerminalExit: (id: string, listener: TerminalExitListener) => {
    const ch = `terminal:exit:${id}`;
    const wrapped = (_: unknown, code: number): void => listener(code);
    ipcRenderer.on(ch, wrapped);
    return () => ipcRenderer.removeListener(ch, wrapped);
  },
  getBankrollSummary: () => ipcRenderer.invoke('bankroll:summary'),
  getYearlyBankroll: () => ipcRenderer.invoke('bankroll:yearly'),
  getMonthlyBankroll: () => ipcRenderer.invoke('bankroll:monthly'),
  getRoiByFormat: () => ipcRenderer.invoke('bankroll:roi-format'),
  getRoiByStake: () => ipcRenderer.invoke('bankroll:roi-stake'),
  getBankrollChart: () => ipcRenderer.invoke('bankroll:chart'),

  getSessions: (limit?: number, offset?: number) =>
    ipcRenderer.invoke('sessions:list', { limit, offset }),
  getSessionDetail: (sessionId: string) =>
    ipcRenderer.invoke('sessions:detail', sessionId),

  getPlayers: (limit?: number, offset?: number, sortBy?: string) =>
    ipcRenderer.invoke('players:list', { limit, offset, sortBy }),
  getPlayerDetail: (playerName: string) =>
    ipcRenderer.invoke('players:detail', playerName),

  getHand: (handId: string) => ipcRenderer.invoke('hands:detail', handId),

  importNewSession: () => ipcRenderer.invoke('import:new-session'),
  importAll: (force?: boolean) => ipcRenderer.invoke('import:all', { force }),

  reviewHand: (handId: string) => ipcRenderer.invoke('review:hand', handId),
  reviewSession: (sessionId: string) =>
    ipcRenderer.invoke('review:session', sessionId),
  reviewTournament: (tournamentId: string) =>
    ipcRenderer.invoke('review:tournament', tournamentId),
  getCachedHandReview: (handId: string) =>
    ipcRenderer.invoke('reviews:hand-cached', handId),
  getCachedSessionReview: (sessionDate: string) =>
    ipcRenderer.invoke('reviews:session-cached', sessionDate),
  getCachedTournamentReview: (tournamentId: string) =>
    ipcRenderer.invoke('reviews:tournament-cached', tournamentId),
  getHandReviewsForSession: (sessionDate: string) =>
    ipcRenderer.invoke('reviews:hands-for-session', sessionDate),
  backfillEquity: (limit?: number) =>
    ipcRenderer.invoke('equity:backfill', { limit }),
  getEquityStats: () => ipcRenderer.invoke('equity:stats'),
  openCoachTerminal: (clean?: boolean) =>
    ipcRenderer.invoke('coach:open-terminal', { clean }),
  getAutoReviewPending: () => ipcRenderer.invoke('auto-review:pending'),
  scanNash: () => ipcRenderer.invoke('nash:scan'),
  getEvBankroll: () => ipcRenderer.invoke('analytics:ev-bankroll'),
  getTimeOfDay: () => ipcRenderer.invoke('analytics:time-of-day'),
  getPlayerNote: (name: string) => ipcRenderer.invoke('player-notes:get', name),
  savePlayerNote: (name: string, note: string, tags: string[]) =>
    ipcRenderer.invoke('player-notes:save', name, note, tags),
  listPlayerNotes: () => ipcRenderer.invoke('player-notes:list'),
  searchHands: (filters: Record<string, unknown>) => ipcRenderer.invoke('hands:search', filters),
  exportSessionMd: (sessionDate: string) => ipcRenderer.invoke('export:session-md', sessionDate),
  backupDb: () => ipcRenderer.invoke('db:backup'),
  listAccounts: () => ipcRenderer.invoke('account:list'),
  getActiveAccount: () => ipcRenderer.invoke('account:get'),
  setActiveAccount: (acc: string) => ipcRenderer.invoke('account:set', acc),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (partial: Record<string, unknown>) =>
    ipcRenderer.invoke('settings:update', partial),
  getSessionAnnotation: (date: string) =>
    ipcRenderer.invoke('session-annotation:get', date),
  saveSessionAnnotation: (date: string, annotation: string, mood: string) =>
    ipcRenderer.invoke('session-annotation:save', date, annotation, mood),
  getDashboardTrackers: () => ipcRenderer.invoke('dashboard:trackers'),
  compareSessions: (a: string, b: string) =>
    ipcRenderer.invoke('sessions:compare', a, b),
  runVarianceSim: (opts: { tournaments?: number; iterations?: number } = {}) =>
    ipcRenderer.invoke('analytics:variance-sim', opts),
  getPlayerDeep: (name: string) => ipcRenderer.invoke('players:deep', name),

  getLeaks: () => ipcRenderer.invoke('analytics:leaks'),
  getGameRecommendations: () => ipcRenderer.invoke('analytics:game-recommendations'),
  getProgress: (granularity?: 'quarter' | 'month') =>
    ipcRenderer.invoke('analytics:progress', granularity),

  // ----- Tennis (Roland Garros 2026 sub-project) -----
  tennisListPicksToday: (tournament: string, dateIso?: string) =>
    ipcRenderer.invoke('tennis:picks:today', tournament, dateIso),
  tennisListPicksForDay: (tournament: string, dateIso: string, minVerdict?: string) =>
    ipcRenderer.invoke('tennis:picks:list-day', tournament, dateIso, minVerdict),
  tennisAuditDay: (dateIso?: string) => ipcRenderer.invoke('tennis:picks:audit-day', dateIso),
  tennisPrunePicks: (keepDays: number) => ipcRenderer.invoke('tennis:picks:prune', keepDays),
  tennisGetPick: (pickId: string) => ipcRenderer.invoke('tennis:picks:get', pickId),
  tennisListUpcomingMatches: (tournament: string) =>
    ipcRenderer.invoke('tennis:matches:upcoming', tournament),
  tennisListMatchesByDate: (tournament: string, dateIso: string) =>
    ipcRenderer.invoke('tennis:matches:by-date', tournament, dateIso),
  tennisSetMatchStatus: (
    matchId: string,
    status: string,
    winnerId: string | null,
    score: string | null
  ) => ipcRenderer.invoke('tennis:matches:set-status', matchId, status, winnerId, score),
  tennisGeneratePick: (input: unknown) => ipcRenderer.invoke('tennis:generate-pick', input),
  tennisPreviewVerdict: (params: unknown) =>
    ipcRenderer.invoke('tennis:preview-verdict', params),
  tennisPlaceBet: (input: unknown) => ipcRenderer.invoke('tennis:bets:place', input),
  tennisSettleBet: (
    betId: string,
    result: 'won' | 'lost' | 'void',
    pnlEur: number,
    closingOdds: number | null
  ) => ipcRenderer.invoke('tennis:bets:settle', betId, result, pnlEur, closingOdds),
  tennisListBets: () => ipcRenderer.invoke('tennis:bets:list'),
  tennisBankrollSummary: (tournament?: string) =>
    ipcRenderer.invoke('tennis:bankroll:summary', tournament),
  tennisBankrollChart: () => ipcRenderer.invoke('tennis:bankroll:chart'),
  tennisPostMatchReview: (ctx: unknown) => ipcRenderer.invoke('tennis:reviews:post-match', ctx),
  tennisRiskStatus: () => ipcRenderer.invoke('tennis:risk:status'),
  tennisRiskConfig: () => ipcRenderer.invoke('tennis:risk:config'),
  tennisRiskSaveConfig: (partial: Record<string, unknown>) =>
    ipcRenderer.invoke('tennis:risk:save-config', partial),
  tennisRiskPause: (hours: number) => ipcRenderer.invoke('tennis:risk:pause', hours),
  tennisRiskResume: () => ipcRenderer.invoke('tennis:risk:resume'),
  tennisCuratorToday: (dateIso?: string) => ipcRenderer.invoke('tennis:curator:today', dateIso),
  tennisCuratorRunNow: () => ipcRenderer.invoke('tennis:curator:run-now'),
  tennisDaemonAutoScoreNow: (opts?: { enableReddit?: boolean }) =>
    ipcRenderer.invoke('tennis:daemon:auto-score-now', opts ?? {}),
  onTennisScanProgress: (listener: (line: string) => void) => {
    const wrapped = (_: unknown, line: string): void => listener(line);
    ipcRenderer.on('tennis:scan-progress', wrapped);
    return () => ipcRenderer.removeListener('tennis:scan-progress', wrapped);
  }
};

contextBridge.exposeInMainWorld('pokerApi', api);

export type PokerApi = typeof api;
