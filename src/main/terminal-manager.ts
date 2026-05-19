import { spawn as spawnPty, type IPty } from 'node-pty';
import { BrowserWindow, ipcMain } from 'electron';
import { homedir } from 'node:os';

interface Session {
  pty: IPty;
  windowId: number;
}

const sessions = new Map<string, Session>();
let nextId = 1;

export function registerTerminalIpc(): void {
  ipcMain.handle('terminal:create', (event, opts: { cwd?: string; cmd?: string; primer?: string } = {}) => {
    const id = `term-${nextId++}`;
    const cwd = opts.cwd ?? '/Users/bubblz/poker';
    const shell = process.env.SHELL ?? '/bin/zsh';
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No window for terminal');

    const pty = spawnPty(shell, [], {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd,
      env: {
        ...process.env,
        HOME: process.env.HOME ?? homedir(),
        TERM: 'xterm-256color',
        LANG: process.env.LANG ?? 'en_US.UTF-8'
      } as { [key: string]: string }
    });

    sessions.set(id, { pty, windowId: win.id });

    pty.onData((data) => {
      const w = BrowserWindow.fromId(win.id);
      if (w && !w.isDestroyed()) w.webContents.send(`terminal:data:${id}`, data);
    });
    pty.onExit(({ exitCode }) => {
      const w = BrowserWindow.fromId(win.id);
      if (w && !w.isDestroyed()) w.webContents.send(`terminal:exit:${id}`, exitCode);
      sessions.delete(id);
    });

    // Send initial command (e.g. "claude '<brief>'")
    if (opts.cmd) {
      // Slight delay so PTY is ready
      setTimeout(() => pty.write(opts.cmd + '\r'), 200);
    }

    return { id };
  });

  ipcMain.handle('terminal:write', (_, id: string, data: string) => {
    const s = sessions.get(id);
    if (s) s.pty.write(data);
  });

  ipcMain.handle('terminal:resize', (_, id: string, cols: number, rows: number) => {
    const s = sessions.get(id);
    if (s) {
      try {
        s.pty.resize(cols, rows);
      } catch (err) {
        console.error('[terminal:resize] failed', err);
      }
    }
  });

  ipcMain.handle('terminal:close', (_, id: string) => {
    const s = sessions.get(id);
    if (s) {
      s.pty.kill();
      sessions.delete(id);
    }
  });
}

export function killAllTerminals(): void {
  for (const [id, s] of sessions) {
    try {
      s.pty.kill();
    } catch {
      // ignore
    }
    sessions.delete(id);
  }
}
