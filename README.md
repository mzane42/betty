# Poker Coach

Post-session poker analytics platform with bankroll focus. Built for mzane42 on Winamax.

## Setup

```bash
# Install deps (use npm, not bun — Bun installs x86_64 Electron)
npm install

# Import all your Winamax history into SQLite (both legacy + new dirs)
npm run import
```

The import scans **both** Winamax history locations automatically:
- Legacy: `~/Documents/Winamax Poker/accounts/<account>/history/`
- Current: `~/Library/Application Support/winamax/documents/accounts/<account>/history/`

## Run

```bash
# Dev mode (auto-rebuild on save)
npm run dev

# Production build
npm run build

# Package as macOS .dmg
npm run package:mac
```

## CLI tools

```bash
# View bankroll + stats summary
npm run stats

# Find leaks + game recommendations
npm run leaks

# Force re-import everything
npx tsx src/cli/import.ts --force

# Review a hand or session with Claude AI (slow — uses claude CLI)
npx tsx src/cli/review.ts hand <hand_id>
npx tsx src/cli/review.ts session <YYYY-MM-DD>
npx tsx src/cli/review.ts last-loss
```

CLI scripts auto-rebuild better-sqlite3 for Node ABI. `npm run dev` auto-rebuilds for Electron ABI. They use different ABIs — switching tools triggers a rebuild (~2 seconds).

## Tests

```bash
npm test
```

## Architecture

- **Main** (Electron, Node): SQLite, IPC handlers, file I/O
- **Renderer** (React, Vite): Dashboard pages, charts (Recharts)
- **Preload** (contextBridge): Exposes `window.pokerApi` to renderer
- **Parser** (`src/parser/`): Winamax hand history text → typed structures
- **Stats** (`src/stats/`): VPIP/PFR/3-bet/AF, bankroll, leak finder, game selector
- **Reviewer** (`src/reviewer/`): Post-session Claude CLI integration

## Troubleshooting

**Error: "module compiled against different Node.js version" (ABI 131 vs 132)**

This means you're trying to use Electron after running a CLI (or vice versa). The native module was compiled for a different runtime. Fix:

```bash
# For Electron dev/build
npx electron-rebuild -f -w better-sqlite3

# For CLI tools
npm rebuild better-sqlite3 --target_arch=arm64
```

These are also wired as `prerun` hooks for `npm run dev`/`build` and `npm run stats`/`leaks`/`import`.

**Error: "incompatible architecture x86_64 / arm64"**

```bash
rm -rf node_modules
npm install
```

## Tennis (Roland Garros 2026 sub-project)

The Tennis tab adds post-session tennis analytics: +EV pick suggestions, manual
bet logging, CLV + ROI tracking, and an optional Telegram bot. Same compliance
posture as poker — picks are suggestions you place manually, no automation
crosses the wallet boundary, no auto-bet on any French operator.

### Quick start

```bash
# 1. Open the Tennis tab (🎾 Tennis in the top nav)
# 2. Go to "Nouveau pick", enter players + ranks + Winamax/Betclic/Unibet odds
#    Optional: Pinnacle odds for BOTH players → no-vig prob auto-computed
# 3. Verdict (STRONG/PLAY/SKIP) + Kelly stake previewed live
# 4. Submit → Claude FR review attached → pick saved
# 5. Place the bet on the book of choice, click "Placé X€"
# 6. After the match: settle (won/lost/void) in Historique → bankroll updates
```

### Optional features

```bash
# Build clay-Elo cache from JeffSackmann/tennis_atp + tennis_wta (~30s, one-time)
npx tsx src/cli/tennis-load-elo.ts
# Re-run with --force after grand slams; --atp-only / --wta-only available

# Enable Telegram bot (skip if you don't want push notifications)
bun add node-telegram-bot-api    # or: npm install node-telegram-bot-api
export TELEGRAM_BOT_TOKEN="123:abc"     # token from @BotFather
export TELEGRAM_ALLOWED_USER_IDS="123456789"   # your Telegram user_id (csv supported)
npm run dev                       # bot auto-starts; silent no-op otherwise

# Enable the signal daemon (cron jobs T-24h / T-6h / T-1h + 30min line-poll)
bun add node-cron                 # or: npm install node-cron
npm run dev                       # daemon starts automatically once installed

# Wire in real odds via The Odds API (free tier 500 req/mo; sign up at the-odds-api.com)
export ODDS_API_KEY="your_key"    # daemon auto-uses createOddsApiScrapers when set
# Otherwise daemon runs with NOOP_SCRAPERS (manual pick entry only)
```

Telegram commands once enabled:

| Command | What it does |
|---|---|
| `/picks` | Today's STRONG + PLAY picks with rationale |
| `/placed <pick_id> <stake_eur>` | Log a placement |
| `/bankroll` | Net all-time, ROI, win rate, CLV moyen |
| `/stop` | Pause picks for 24h |
| `/resume` | Cancel pause |
| `/status` | Current risk-gate state |

### Risk gate (stop-loss / take-profit)

`~/.poker-coach/config/tennis-risk.json` (auto-created on first read):

```json
{
  "bankrollEur": 200,
  "dailyStopLossPct": -0.03,
  "tournamentTakeProfitPct": 0.15,
  "drawdownCircuitBreakerPct": -0.1,
  "circuitBreakerPauseHours": 48,
  "activeTournament": "roland_garros_2026"
}
```

- Daily P&L worse than `dailyStopLossPct` → picks paused until next day
- Tournament cumulative > `tournamentTakeProfitPct` → half-stake mode (Kelly fraction halved)
- Peak-to-trough drawdown < `drawdownCircuitBreakerPct` → forced 48h pause

The risk banner at the top of the Tennis tab shows the current state.

### Architecture

```
Electron main                  Renderer (React)
─────────────                  ────────────────
ipc-handlers ──┐               pages/Tennis.tsx
               │                 ├─ TennisRiskBanner
               ├─ tennis-       ├─ TennisPickCard
               │  repository      ├─ TennisNewPickForm (live preview)
               │                 ├─ TennisSettleControls
               ├─ pick-          └─ TennisBankrollHero
               │  generator
               │   ├─ kelly       Claude CLI (reused)
               │   ├─ cross-info-scorer
               │   ├─ model/rating + sackmann-loader
               │   └─ claude-tennis-reviewer
               │
               ├─ risk-gate (~/.poker-coach/config/tennis-risk.json)
               ├─ telegram-bot (dynamic import, optional)
               ├─ signal-daemon (cron, dynamic node-cron, optional)
               └─ ingest/{pinnacle,reddit,betfair,line-movement}

SQLite (poker.db, shared) — tennis_* tables added additively (no ALTER on poker tables)
```

## CGU Compliance

This is a **post-session** tool only. Never run during play.
- No overlay
- No global hotkey
- No screen capture during play
- No file watcher during live sessions
- All AI analysis on completed hands only
- **Tennis**: no auto-bet on any French operator (Winamax/Betclic/Unibet/PMU/Parions).
  Picks are suggestions the user places manually. No automation crosses the wallet
  boundary. Public odds pages (oddsportal.com) and public APIs (Reddit JSON,
  Betfair Exchange public REST) only — never authenticated book accounts.
