---
name: tennis-phantom-detection
description: Use when debugging "match not found on Unibet", phantom fixtures, qualifying-draw noise, or surface mis-mapping. Documents the cross-source defenses learned the hard way.
---

# Phantom Fixture & Qualifier Detection

The Odds API publishes draws that **may be reshuffled** (lucky losers, withdrawals, walkovers). Several defenses run in parallel.

## Symptoms

- Pick generated but match introuvable sur Unibet / Google
- "Strasbourg Zhang vs Parry" comme PLAY alors qu'aucun bookmaker FR ne propose le match
- Qualifying-round fixtures (Boscardin Dias vs Galarneau) qui polluent l'audit

## Defenses

### 1. Pinnacle-missing warning

Si `pinnacle_prob` est `null` pour un pick → badge `AlertTriangle` "fixture à vérifier" dans `TennisCuratorFeed`.
Pinnacle = sharpe extrême: s'ils ne pricent pas, c'est suspect.

### 2. Status sync (T-2h cron + manual)

`syncMatchStatuses(db, client)` dans `src/tennis/status-sync.ts`:
- Match absent du slate frais Odds API → flip `withdrawn`
- Match >5h après scheduled_at → flip `finished`
- Toute placée bet → marquée `void` au prochain settle

Wiré dans `signal-daemon` line-poll + dispo via `bun run tennis-sync-status`.

### 3. Qualifier filter (UI)

`TennisAuditTable.hideQualifiers` (default ON):
```ts
const r1 = r.player1Rank ?? 0;
const r2 = r.player2Rank ?? 0;
if (r1 > 100 && r2 > 100) return false; // qualifier — masquer
```

Rank chips inline: `#18 vs #142`. Toggle "Cacher qualifs" + compteur des masqués.

### 4. Surface mapping centralisé

`src/tennis/surface.ts` — `CLAY_KEYWORDS` + `GRASS_KEYWORDS` couvrent Hamburg, Monte Carlo, Barcelona, Munich, Estoril, Geneva, Strasbourg, Rabat, etc. `inferSurface(sportKeyOrTournament)` est la **seule** source. Évite curator hallucinant "service-volée sur dur" quand la surface est clay.

### 5. Unibet deep-link minimal

`src/tennis/unibet-url.ts` — slugs grands chelems explicites + fallback tour root (`/paris-tennis/atp` ou `/wta`). On a abandonné le slug-guess (Unibet 404 sur les IDs numériques). Le bouton copie le nom du match dans le presse-papier en plus de l'open.

## Backlog

- Cross-source via flashscore / WTA officiel scraping
- Auto-scorer SKIP automatique si les deux ranks > 100 (actuellement filtre UI seulement)
