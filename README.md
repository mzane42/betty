# Coach

Multi-domain post-session analytics. Two domains today, more later:

- **♠️ Poker** — Winamax Expresso hand history import → bankroll, sessions, players, leaks, Claude reviews
- **🎾 Paris sportifs** — Tennis (Roland Garros 2026 + ATP/WTA tour) +EV pick suggestions on Unibet, daily Claude curator, bankroll, CLV tracking, Telegram push

The Electron app boots on a **home selector** — pick the domain you want to work in. Each domain has its own header, navigation, Claude Code terminal sidebar, and dashboard. The poker side is untouched; the tennis side lives under "Paris".

## Setup

```bash
# Install deps (use npm, not bun for the initial install — Bun installs x86_64 Electron)
npm install

# Import all your Winamax history into SQLite (both legacy + new dirs)
npm run import
```

The import scans **both** Winamax history locations automatically:
- Legacy: `~/Documents/Winamax Poker/accounts/<account>/history/`
- Current: `~/Library/Application Support/winamax/documents/accounts/<account>/history/`

### Environment (`.env.local`, gitignored)

Optional but enables the autonomous tennis flow:

```env
ODDS_API_KEY=your_key_here                # the-odds-api.com free tier 500 req/mo
TELEGRAM_BOT_TOKEN=123:abc                # token from @BotFather
TELEGRAM_ALLOWED_USER_IDS=123456789       # your Telegram user_id (csv supported)
```

Without these the app still runs — picks just become manual-entry only and Telegram push silently no-ops.

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

## Paris (Tennis MVP — Roland Garros 2026 + tour)

Post-session tennis analytics: +EV pick suggestions on Unibet, daily Claude curator, bankroll, CLV tracking, optional Telegram bot. Same compliance posture as poker — picks are suggestions you place manually on Unibet, no automation crosses the wallet boundary, no auto-bet on any French operator.

### Daily flow

```bash
# 1. (Optional) Refresh picks from the terminal — same pipeline the daemon runs
bun run tennis-scan

# 2. Open Coach → Paris → "🤖 Aujourd'hui"
#    Claude curator's top 3-6 picks across all active tournaments, with Kelly-sized stake suggestions

# 3. Place the bet on Unibet (manually — no auto-bet). Copy the ticket text.

# 4. Log the bet via terminal — Claude parses the Unibet/Winamax/Betclic ticket
pbpaste | bun run tennis-paste-bet
# or: bun run tennis-paste-bet "<paste ticket text>"

# 5. Match starts → the signal daemon auto-snapshots closing odds (CLV).
#    Manual trigger if daemon isn't running:
bun run tennis-capture-closing

# 6. After match — settle via UI (Paris → Historique → ✓/✗/⊘) or via CLI:
bun run tennis-settle <bet_id> <won|lost|void> [closing_odds]
# Claude post-match review fires automatically and shows up in the Review column
```

### Tennis CLIs

| Command | Purpose |
|---|---|
| `bun run tennis-scan [--reddit] [--window=N]` | Run full pipeline (auto-scorer + curator) from terminal. Same as the daemon's T-6h batch. |
| `bun run tennis-paste-bet "<ticket>"` | Claude parses Unibet/Winamax/Betclic ticket, fuzzy-matches players against DB, inserts bet. |
| `bun run tennis-capture-closing [--before=N --after=N]` | Snapshot closing odds for unsettled bets near match start (CLV). |
| `bun run tennis-settle <bet_id> <won\|lost\|void> [closing_odds]` | Settle bet + fire post-match Claude review. |
| `bun run tennis-telegram-test [--getme\|--strong\|--digest\|--getupdates\|"text"]` | Raw Telegram Bot API tester. |

### CLV (Closing Line Value)

Variance-free measure of edge: `(your_odds - closing_odds) / closing_odds × 100`.

Positive CLV across many bets means your timing/model consistently beats the market consensus at match start — even when individual results vary. Pros track CLV more than win-rate. The signal daemon snapshots closing odds at `*/30 * * * *` for any unsettled bet whose match is within `[-5min, +30min]` of start; CLV computes automatically in the Historique table.

### Optional: clay-Elo cache

```bash
# Build clay-Elo cache from JeffSackmann/tennis_atp + tennis_wta (~30s, one-time)
npx tsx src/cli/tennis-load-elo.ts
# Re-run with --force after grand slams; --atp-only / --wta-only available
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
Electron main                       Renderer (React)
─────────────                       ────────────────
ipc-handlers ──┐                    App.tsx (mode router: home | poker | paris)
               │                      ├─ Home.tsx (domain selector)
               ├─ tennis-             ├─ PokerShell (Dashboard/Sessions/Players/Leaks/Jeux/Progrès/Recherche)
               │  repository          └─ ParisShell
               │                            ├─ ParisDashboard (KPI tiles + chart)
               ├─ pick-                     ├─ TennisCuratorFeed (Aujourd'hui)
               │  generator                 ├─ TennisAuditTable (Audit)
               │   ├─ kelly                 ├─ TennisNewPickForm (Pick manuel)
               │   ├─ cross-info-scorer     ├─ Historique + BetReviewCell
               │   ├─ model/rating          └─ TennisBankrollHero + Recharts
               │   └─ claude-tennis-reviewer
               │                           Both shells: CoachSidebar (xterm + Claude Code, domain-aware)
               ├─ auto-scorer + curator (Claude CLI)
               ├─ closing-odds capture (CLV)
               ├─ risk-gate (~/.poker-coach/config/tennis-risk.json)
               ├─ telegram-bot (dynamic import, optional)
               ├─ signal-daemon (cron T-24h/T-6h/T-1h + 30min line-poll + 21h digest)
               └─ ingest/{odds-api, pinnacle, reddit, betfair, line-movement}

SQLite (poker.db, shared) — tennis_* tables additive (no ALTER on poker tables)
                            tennis_bets.post_match_review_json + closing_odds added post-MVP
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
