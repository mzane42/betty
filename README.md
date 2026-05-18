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

## CGU Compliance

This is a **post-session** tool only. Never run during play.
- No overlay
- No global hotkey
- No screen capture during play
- No file watcher during live sessions
- All AI analysis on completed hands only
