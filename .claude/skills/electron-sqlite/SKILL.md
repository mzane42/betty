---
name: electron-sqlite
description: Use when better-sqlite3 throws ABI mismatch, when adding a DB column, or when running tests vs Electron locally. Documents the rebuild dance and idempotent migration pattern.
---

# better-sqlite3 ABI + Migration Pattern

## ABI dance

Electron and Node use **different ABIs** (Electron 34 = ABI 132, Node 22 = ABI 131). `better-sqlite3` est natif → un seul binaire compilé à la fois.

| Context | Command |
|---------|---------|
| Avant `bun run dev` / `bun run build` | `electron-rebuild -f -w better-sqlite3` (auto via `predev` / `prebuild`) |
| Avant `bun test` / `bun run import` / tout CLI Node | `npm rebuild better-sqlite3 --target_arch=arm64` |

Tous les scripts CLI (`import`, `stats`, `tennis-scan`, etc.) ont un `pre<script>` qui force le rebuild Node. Erreur typique: `Error: The module 'better_sqlite3' was compiled against a different Node.js version`. Solution = rebuild côté ciblé.

`node-pty` a un piège similaire (`postinstall` chmod le `spawn-helper`).

## Migrations idempotentes

Pas de framework migration. `src/db/database.ts` lance des `ALTER TABLE` au boot, **catch** sur "duplicate column":

```ts
try {
  runSql(db, `ALTER TABLE tennis_bets ADD COLUMN post_match_review_json TEXT`);
} catch (e) {
  if (!String(e).includes('duplicate column')) throw e;
}
```

Toujours:
1. Ajouter la colonne en `ALTER TABLE` (jamais `DROP`).
2. Default `NULL` ou valeur backfill-safe.
3. Update du repo: insert + `rowTo<Entity>` mapping.
4. Update du DTO côté `api.ts` (l'IPC dto doit refléter la colonne).

## WAL mode

`PRAGMA journal_mode = WAL` activé au boot. Les CLI Node lisent le **même fichier** que Electron en simultané sans corruption (lectures concurrentes OK, une seule écriture à la fois).

DB path: `~/.poker-coach/poker.db` (résolu via `defaultDbPath()` dans `src/db/index.ts`).

## Repository pattern

Un fichier par domaine: `src/db/repositories/tennis-repository.ts`, `poker-repository.ts`. Toute requête SQL passe par un repo — pas de `db.prepare()` au milieu d'un IPC handler.
