---
name: electron-ipc
description: Use when adding a new IPC channel, IPC handler, or renderer-facing API method. Documents the main ↔ preload ↔ renderer triangle with concrete file pointers.
---

# Electron IPC Pattern (poker-coach)

Three files **must** stay in sync for every new channel.

## 1. Main — register handler

`src/main/index.ts` (or domain-specific `src/tennis/ipc-tennis.ts`, `src/poker/ipc-poker.ts`):

```ts
ipcMain.handle('tennis:bets:delete', async (_evt, betId: string) => {
  return repo.deleteBet(betId);
});
```

Long-running handlers (Claude review): respond fast, then `webContents.send('tennis:bets:review-ready', payload)` async.

## 2. Preload — whitelist channel

`src/preload/index.ts` via `contextBridge.exposeInMainWorld('pokerApi', { … })`:

```ts
tennisDeleteBet: (betId: string) => ipcRenderer.invoke('tennis:bets:delete', betId),
onTennisReviewReady: (cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on('tennis:bets:review-ready', handler);
  return () => ipcRenderer.off('tennis:bets:review-ready', handler);
},
```

Push events return an **unsubscribe** function. Renderer doit cleanup en effect.

## 3. Renderer — typed API surface

`src/renderer/api.ts` exporte `PokerApi` interface + `pokerApi` const. Renderer **n'utilise jamais `window.pokerApi` directement** — toujours via le type:

```ts
export interface PokerApi {
  tennisDeleteBet: (betId: string) => Promise<{ ok: boolean }>;
  onTennisReviewReady: (cb: (payload: TennisReviewReadyDto) => void) => () => void;
  // ...
}
```

Dtos (`TennisBetRow`, `TennisPickRow`, `TennisPickAuditRowDto`) sont **plats / serializable** — pas de Date, pas de Buffer. Convertir en string ISO côté main avant `return`.

## Gotchas

- Channel names: `<domain>:<noun>:<verb>` (`tennis:bets:settle`).
- Un handler unique par channel — `ipcMain.handle` throw si dupe.
- Renderer side: vérifier `window.pokerApi != null` au boot — préventif si preload casse.
- Terminal methods (`createTerminal`, `writeTerminal`, etc.) sont **sur** `PokerApi` interface, pas dans un `declare global` séparé.
