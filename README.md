# Poker Coach

Post-session poker analytics platform with bankroll focus. Built for mzane42 on Winamax.

## Setup

```bash
# Install deps (use npm, not bun — Bun installs x86_64 Electron)
npm install

# Rebuild native modules for Electron (auto-runs on install)
npm run rebuild

# Import all your Winamax history into SQLite
npm run import
```

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
npx tsx src/cli/stats.ts

# Find leaks + game recommendations
npx tsx src/cli/leaks.ts

# Review a hand or session with Claude AI
npx tsx src/cli/review.ts hand <hand_id>
npx tsx src/cli/review.ts session <YYYY-MM-DD>
npx tsx src/cli/review.ts last-loss

# Force re-import everything
npx tsx src/cli/import.ts --force
```

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

**Error: "module compiled against different Node.js version"**

```bash
npm run rebuild
```

**Error: "incompatible architecture x86_64 / arm64"**

```bash
rm -rf node_modules
npm install
```

## CGU Compliance

This is a **post-session** tool only. Never run during play.
- No overlay
- No global hotkey
- No screen capture during play
- No file watcher during live sessions
- All AI analysis on completed hands only
