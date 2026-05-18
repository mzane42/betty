# Poker Coach App — Design Spec

## Overview

macOS desktop app (Electron + TypeScript) that provides real-time poker coaching. Captures the screen via global hotkey, sends screenshot to Claude CLI (vision) using existing subscription, returns voice decision + overlay popup. Persists player profiles in SQLite across sessions. Supports Sit&Go, Expresso 3-max, and MTT game modes.

**Platform:** macOS only
**Runtime:** Electron (Node.js)
**AI Backend:** `claude` CLI in print mode (subscription, not API)
**Target poker client:** Winamax desktop app

## Architecture

```
┌─────────────┐     F12      ┌──────────────┐
│  Winamax    │──────────────▶│  Electron    │
│  Desktop    │               │  Main Process│
└─────────────┘               └──────┬───────┘
                                     │
                              ┌──────▼───────┐
                              │ screencapture │
                              │ (macOS natif) │
                              └──────┬───────┘
                                     │ /tmp/poker_shot.png
                              ┌──────▼───────┐
                              │  claude -p    │
                              │  (CLI vision) │
                              └──────┬───────┘
                                     │ JSON response
                        ┌────────────┼────────────┐
                        │            │            │
                 ┌──────▼──┐  ┌─────▼─────┐ ┌───▼────────┐
                 │ macOS   │  │ Overlay   │ │ SQLite     │
                 │ say TTS │  │ Window    │ │ Profils    │
                 │ (FR)    │  │ (détail)  │ │ Joueurs    │
                 └─────────┘  └───────────┘ └────────────┘
```

## Components

### 1. Hotkey & Screen Capture

- Electron `globalShortcut.register('F12')` for triggering analysis
- `screencapture -x /tmp/poker_shot.png` (silent, full screen)
- Short audio feedback when capture completes
- Debounce: ignore repeated F12 within 2 seconds

### 2. Claude CLI Analysis

Invocation:
```bash
claude -p --dangerously-skip-permissions --model sonnet --system-prompt "<poker_prompt>"
```

Prompt includes:
- Active game mode (SNG/Expresso/MTT)
- Known player profiles from SQLite for players currently at the table
- Recent hand history context (last 3-5 hands)
- Instructions to output structured JSON

Response format:
```typescript
interface PokerAnalysis {
  decision: "SHOVE" | "FOLD" | "CALL" | "RAISE" | "CHECK" | "BET";
  voice: string;         // spoken text: decision + reason + player context
  detail: string;        // full analysis for overlay
  players: PlayerUpdate[];
  tournament: {
    stage: string;       // "early" | "mid" | "bubble" | "itm" | "final_table"
    position: string;    // "5/13"
    avg_stack_bb: number;
  };
  hand: {
    cards: string;       // "AKs"
    position: string;    // "BTN" | "SB" | "BB" | "CO" | "UTG" | etc.
    stack_bb: number;
    pot_bb: number;
    street: string;      // "preflop" | "flop" | "turn" | "river"
    board: string;       // "Ah 7c 2d"
  };
}

interface PlayerUpdate {
  name: string;
  stack_bb: number;
  tendency: string;
  note: string;
}
```

### 3. Text-to-Speech (Voice)

- macOS `say` command: `say -v Thomas -r 200 "<voice_text>"`
- Voice: Thomas (fr_FR, masculine)
- Rate: 200 wpm (fast but clear)
- Content: decision first, then reason, then player context if relevant
- Example: "SHOVE. As-Roi suited, 12 blindes, au bouton. PuertAA est tight, il fold souvent."
- Runs async — does not block overlay display

### 4. Notifications & Overlay

**macOS Notification:**
- Title: decision (e.g., "SHOVE")
- Body: short reason (e.g., "AKs, 12 BB, BTN")
- Disappears after 5 seconds

**Overlay Window:**
- Electron BrowserWindow with `alwaysOnTop: true`, frameless, transparent background
- Positioned bottom-right corner of screen
- Content:
  - Decision in large text with color coding (green=SHOVE/RAISE/BET, red=FOLD, yellow=CALL/CHECK)
  - Reason line
  - Player profiles visible at table
  - Tournament situation (stage, position, avg stack)
  - Full detail text
- Dismiss: click anywhere on overlay or press Escape
- Auto-dismiss after 30 seconds

### 5. Player Profiles (SQLite)

Database: `~/.poker-coach/players.db`

```sql
CREATE TABLE players (
  name TEXT PRIMARY KEY,
  hands_seen INTEGER DEFAULT 0,
  tendency TEXT,
  notes TEXT,
  vpip_estimate REAL,
  aggression_estimate REAL,
  last_seen TEXT,
  created_at TEXT
);

CREATE TABLE hand_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  game_mode TEXT NOT NULL,
  hand_number INTEGER,
  my_cards TEXT,
  board TEXT,
  my_decision TEXT,
  result TEXT,
  pot_bb REAL,
  net_bb REAL,
  players_json TEXT,
  analysis_json TEXT,
  timestamp TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  game_mode TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  hands_played INTEGER DEFAULT 0,
  net_result REAL
);
```

Player profiles are updated automatically after each Claude analysis. Profiles persist across sessions and are injected into the prompt for context.

### 6. Game Modes

| Mode | Hotkey | Prompt Focus |
|------|--------|-------------|
| Sit & Go | F9 | ICM, bubble pressure, stack-based ranges, position vs remaining players |
| Expresso | F10 | Push/fold charts, 3-max ICM, hyper-turbo adjustments, prize multiplier |
| MTT | F11 | Early/mid/late phases, antes, pay jumps, table dynamics |

Mode persists until changed. Shown in tray menu and overlay.

### 7. Tray App (Main Window)

- Lives in macOS menu bar (tray icon: poker chip emoji or card icon)
- Tray menu items:
  - Current mode indicator (SNG/Expresso/MTT) with sub-menu to switch
  - "Session active" / "Start session" toggle
  - View player profiles (opens small window)
  - Session stats (hands played, net result)
  - Quit
- No main window — all interaction via hotkey + overlay

## File Structure

```
poker/
├── package.json
├── tsconfig.json
├── electron-builder.yml
├── src/
│   ├── main/
│   │   ├── index.ts              # Electron main process entry
│   │   ├── hotkey.ts             # Global shortcut registration
│   │   ├── capture.ts            # Screen capture via screencapture
│   │   ├── analyzer.ts           # Claude CLI invocation & response parsing
│   │   ├── tts.ts                # macOS say command wrapper
│   │   ├── tray.ts               # Tray menu management
│   │   ├── overlay.ts            # Overlay window management
│   │   ├── db.ts                 # SQLite database (players, history, sessions)
│   │   └── prompt.ts             # Poker prompt builder per game mode
│   ├── overlay/
│   │   ├── index.html            # Overlay window HTML
│   │   ├── overlay.ts            # Overlay renderer script
│   │   └── overlay.css           # Overlay styles
│   └── types.ts                  # Shared TypeScript interfaces
├── prompts/
│   ├── base.md                   # Base poker coaching prompt
│   ├── sng.md                    # Sit & Go specific prompt
│   ├── expresso.md               # Expresso 3-max specific prompt
│   └── mtt.md                    # MTT specific prompt
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-05-18-poker-coach-design.md
```

## Flow: F12 Press to Decision

1. User presses F12
2. `hotkey.ts` triggers, debounce check passes
3. `capture.ts` runs `screencapture -x /tmp/poker_shot.png`
4. Short beep confirms capture
5. `prompt.ts` builds prompt with: game mode context + player profiles from DB + recent history
6. `analyzer.ts` spawns `claude -p` with prompt, referencing the screenshot path
7. Claude reads the image, analyzes the poker situation, returns JSON
8. `analyzer.ts` parses JSON response
9. In parallel:
   a. `tts.ts` speaks the `voice` field via `say`
   b. `overlay.ts` displays the full analysis
   c. macOS notification fires with decision
   d. `db.ts` updates player profiles and hand history
10. Overlay stays visible until dismissed (click/Escape/30s timeout)

## Performance Target

- F12 to voice start: < 8 seconds
- F12 to overlay display: < 8 seconds
- TTS duration: 3-7 seconds depending on content

## Dependencies

- `electron` — desktop app framework
- `better-sqlite3` — SQLite driver (synchronous, fast)
- `electron-builder` — packaging

No other external dependencies. Uses macOS native `screencapture` and `say`.
