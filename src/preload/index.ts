import { contextBridge, ipcRenderer } from 'electron';

const api = {
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

  getLeaks: () => ipcRenderer.invoke('analytics:leaks'),
  getGameRecommendations: () => ipcRenderer.invoke('analytics:game-recommendations'),
  getProgress: (granularity?: 'quarter' | 'month') =>
    ipcRenderer.invoke('analytics:progress', granularity)
};

contextBridge.exposeInMainWorld('pokerApi', api);

export type PokerApi = typeof api;
