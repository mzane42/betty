---
name: tennis-pipeline
description: Use when touching tennis scan / pick / curator / bet / settle / review flow. End-to-end map of daily tennis loop and CLI entry points.
---

# Tennis Pipeline — RG 2026 MVP

## Daily loop (Europe/Paris)

```
03:00  T-24h batch   scrape next-day slate, snapshot opening odds
08:00  T-6h batch    refresh odds, score, generate picks + Claude review
09:00  daily digest  Telegram push (STRONG immediate, PLAY batched)
T-2h → start         30min line-poll + closing-odds capture + status sync
post-match           settle → reviewTennisPostMatch → bankroll event
21:00  daily summary Telegram digest
```

Owner: `src/tennis/signal-daemon.ts` (node-cron, TZ explicite).

## CLI entry points

| Script | Purpose |
|--------|---------|
| `bun run tennis-scan` | Full pipeline: status-sync → auto-score → curator |
| `bun run tennis-settle <bet_id> <won\|lost\|void> [closing_odds]` | Settle bet + fire post-match Claude review |
| `bun run tennis-paste-bet` | `pbpaste \| bun run tennis-paste-bet` — parse ticket text via Claude, insert bet |
| `bun run tennis-capture-closing` | Snapshot Unibet odds in [-5min, +30min] window |
| `bun run tennis-sync-status` | Flip rows to finished/withdrawn from Odds API delta |
| `bun run tennis-telegram-test` | Smoke test bot creds |
| `bun run tennis-load-elo` | Backfill clay-Elo from Sackmann CSV |
| `bun run tennis-load-ranks` | Backfill player ranks |

Pre-scripts rebuild `better-sqlite3` for arm64 Node.

## Data tables

- `tennis_players` — Sackmann ids + rank
- `tennis_matches` — `status: scheduled|live|finished|withdrawn`, `winner_id`, `score`
- `odds_snapshots` — per-book per-market timestamped
- `tennis_picks` — model_prob, fair_odds, book_odds, edge_pct, kelly_stake_pct, signal_score, **verdict**, claude_review_json, pinnacle_prob
- `tennis_bets` — pick_id (nullable), stake, decimal_odds, placed_at, result, pnl_eur, closing_odds, **post_match_review_json**

## Settle flow

1. UI ou `tennis-settle` CLI déclenche `tennis:bets:settle`
2. Update `result` + `pnl_eur` + `closing_odds`
3. Insert `bankroll_events` row (`sub_account='tennis'`)
4. **Async** spawn `reviewTennisPostMatch` (Claude CLI)
5. Persiste `post_match_review_json` via `setPostMatchReview`
6. Emit `tennis:bets:review-ready` / `review-failed` (renderer listens)

## Compliance

- ❌ Pas d'auto-bet sur opérateur FR (Winamax/Betclic/Unibet/PMU/Parions — TOS = ban).
- ❌ Pas de live in-play decisioning.
- ✅ Scrape **public** (oddsportal, Reddit JSON, Betfair public REST, Pinnacle no-vig).
- ✅ Picks = suggestions, user clique "Placé" manuellement.

## Bankroll unifié

`bankroll_events.sub_account` ∈ {`poker`, `tennis`}. UI Home agrège les deux.
