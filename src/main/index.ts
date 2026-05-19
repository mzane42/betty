import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './ipc-handlers.js';
import { registerTerminalIpc, killAllTerminals } from './terminal-manager.js';
import { startTelegramBot } from '../tennis/telegram-bot.js';
import { startSignalDaemon } from '../tennis/signal-daemon.js';
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

  const daemon = await startSignalDaemon(telegramDbHandle);
  if (daemon.enabled) {
    console.log('[main] Signal daemon started');
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
