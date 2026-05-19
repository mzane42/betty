---
name: poker-data
description: Use when working with poker import, hand-history parsing, DB queries, or review persistence. Documents schema, CLI entry points, and review caching pattern.
---

# Poker Data & Import Pipeline

## DB

- Path: `~/.poker-coach/poker.db` (WAL mode, `better-sqlite3`).
- 19,562+ mains importées (2018-2026), ~2,057 adversaires uniques avec stats (VPIP/PFR/3-bet/AF/WTSD).
- Schema: `hands`, `actions` (par street + montants + all-in flag), `tournaments`, `players`, `villain_stats`, `hand_reviews`, `tournament_reviews`, `session_reviews`, `bankroll_events` (avec `sub_account = 'poker' | 'tennis'`).

## CLI

```bash
bun run import        # Winamax HH ingest
bun run stats         # joueur stats
bun run leaks         # détection leaks
bun run equity        # equity calc
bun run coach-brief   # brief Claude pré-session
```

Pre-scripts rebuild `better-sqlite3` pour arm64 Node (séparé d'Electron — voir skill `electron-sqlite`).

## Review caching

- Toute review (hand/tournament/session) est sauvegardée immédiatement après génération.
- Re-visite = cache hit, pas de regen Claude.
- Hands taggées `good` / `blunder` dans `hand_reviews.verdict` → utilisées pour ranker "meilleures lignes" dans les listes.

## Prompts

- `prompts/hand_review.md` — review d'une main
- `prompts/tournament_review.md` — review d'un Expresso complet
- `prompts/session_review.md` — synthèse multi-tournois
- Tous produisent **JSON strict** (voir skill `poker-coaching`).

## Invocation Claude

```ts
claude -p --model sonnet --output-format text < prompt.txt
```

Wrapper: `src/main/claude-cli.ts` (réutilisé par tennis via `reviewTennisPostMatch`).

## Bankroll

- Source de vérité: `bankroll_events` (insert-only).
- Chaque tournoi terminé → 1 event (buy-in négatif + gain positif).
- UI Bankroll = somme cumulée filtrée par `sub_account`.
