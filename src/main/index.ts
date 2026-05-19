import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

// Load env BEFORE any module that reads process.env. `app.getAppPath()` is the
// reliable project-root accessor — works in both dev (`electron-vite dev`) and
// packaged builds, unaffected by cwd. We load both .env.local (secrets) and
// .env (committed defaults); .env.local wins because dotenv with override:false
// keeps the first-set value.
const PROJECT_ROOT = app.getAppPath();
for (const file of ['.env.local', '.env']) {
  const path = join(PROJECT_ROOT, file);
  const result = loadDotenv({ path, override: false });
  if (result.parsed && Object.keys(result.parsed).length > 0) {
    console.log(`[main] env loaded from ${path}: ${Object.keys(result.parsed).length} vars`);
  }
}

import { registerIpcHandlers } from './ipc-handlers.js';
import { registerTerminalIpc, killAllTerminals } from './terminal-manager.js';
import { startTelegramBot } from '../tennis/telegram-bot.js';
import { startSignalDaemon } from '../tennis/signal-daemon.js';
import { createOddsApiScrapers } from '../tennis/ingest/odds-api.js';
import { defaultDbPath, openDatabase, type Database } from '../db/index.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Enable remote debugging when POKER_DEBUG_PORT is set
if (process.env['POKER_DEBUG_PORT']) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env['POKER_DEBUG_PORT']!);
}

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: false,
    title: 'Poker Coach',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// Telegram bot needs its own DB handle since the IPC handlers' db() is a private
// closure. The shared `defaultDbPath()` + WAL mode keep this safe across handles.
let telegramDb: Database | null = null;
function telegramDbHandle(): Database {
  if (!telegramDb) telegramDb = openDatabase({ dbPath: defaultDbPath() });
  return telegramDb;
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  registerTerminalIpc();
  createMainWindow();

  const tg = await startTelegramBot(telegramDbHandle);
  if (tg.enabled) {
    console.log('[main] Telegram bot started');
  } else {
    console.log(`[main] Telegram bot disabled: ${tg.reason}`);
  }

  const oddsApiKey = process.env.ODDS_API_KEY;
  const scrapers = oddsApiKey ? createOddsApiScrapers({ apiKey: oddsApiKey }) : undefined;
  const daemon = await startSignalDaemon(telegramDbHandle, scrapers ? { scrapers } : {});
  if (daemon.enabled) {
    console.log(
      `[main] Signal daemon started${oddsApiKey ? ' with The Odds API' : ' with noop scrapers'}`
    );
  } else {
    console.log(`[main] Signal daemon disabled: ${daemon.reason}`);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  killAllTerminals();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', killAllTerminals);
