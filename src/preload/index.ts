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

  getLeaks: () => ipcRenderer.invoke('analytics:leaks'),
  getGameRecommendations: () => ipcRenderer.invoke('analytics:game-recommendations'),
  getProgress: (granularity?: 'quarter' | 'month') =>
    ipcRenderer.invoke('analytics:progress', granularity)
};

contextBridge.exposeInMainWorld('pokerApi', api);

export type PokerApi = typeof api;
