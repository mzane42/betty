import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';
import { coachBus } from '../lib/coach-bus.js';

declare global {
  interface Window {
    pokerApi: {
      createTerminal: (opts?: { cwd?: string; cmd?: string }) => Promise<{ id: string }>;
      writeTerminal: (id: string, data: string) => Promise<void>;
      resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>;
      closeTerminal: (id: string) => Promise<void>;
      onTerminalData: (id: string, l: (data: string) => void) => () => void;
      onTerminalExit: (id: string, l: (code: number) => void) => () => void;
    };
  }
}

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  width: number;
  onResize: (w: number) => void;
}

const STORAGE_AUTOSTART = 'pokerCoach.sidebarAutostart';

export function CoachSidebar({ collapsed, onToggle, width, onResize }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'exited'>('idle');
  const [uptime, setUptime] = useState(0);
  const [autostart, setAutostart] = useState(() => localStorage.getItem(STORAGE_AUTOSTART) === '1');
  const startedAtRef = useRef<number | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  function ensureTerminal(): Terminal {
    if (termRef.current) return termRef.current;
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: '"MesloLGS NF", "JetBrains Mono", "SF Mono", Menlo, monospace',
      fontSize: 12,
      letterSpacing: 0,
      lineHeight: 1.15,
      allowTransparency: true,
      theme: {
        background: '#0a0c12',
        foreground: '#e6e8ee',
        cursor: '#c084fc',
        cursorAccent: '#0a0c12',
        selectionBackground: 'rgba(168, 85, 247, 0.35)',
        black: '#1e2230',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e6e8ee',
        brightBlack: '#475569',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff'
      }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current!);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    return term;
  }

  function start(cmd: string): void {
    if (status === 'running') return;
    if (!containerRef.current) return;
    const term = ensureTerminal();

    void window.pokerApi.createTerminal({ cwd: '/Users/bubblz/poker', cmd }).then(({ id }) => {
      termIdRef.current = id;
      startedAtRef.current = Date.now();
      setStatus('running');

      window.pokerApi.onTerminalData(id, (data) => term.write(data));
      window.pokerApi.onTerminalExit(id, () => {
        setStatus('exited');
        termIdRef.current = null;
        coachBus.unregister();
      });

      term.onData((data) => {
        if (termIdRef.current) void window.pokerApi.writeTerminal(termIdRef.current, data);
      });

      coachBus.registerWrite((text) => {
        if (termIdRef.current) void window.pokerApi.writeTerminal(termIdRef.current, text);
      });
      coachBus.registerOpen(() => {
        // If collapsed, open it.
        if (collapsed) onToggle();
      });

      const { cols, rows } = term;
      void window.pokerApi.resizeTerminal(id, cols, rows);
    });
  }

  function reset(): void {
    if (termIdRef.current) {
      void window.pokerApi.closeTerminal(termIdRef.current);
      termIdRef.current = null;
    }
    coachBus.unregister();
    termRef.current?.clear();
    startedAtRef.current = null;
    setStatus('idle');
    setUptime(0);
  }

  function toggleAutostart(): void {
    const next = !autostart;
    setAutostart(next);
    localStorage.setItem(STORAGE_AUTOSTART, next ? '1' : '0');
  }

  // Autostart on mount if flag set.
  useEffect(() => {
    if (autostart && status === 'idle') {
      // Give the container a tick to render its size.
      const t = setTimeout(() => start('bun run coach-brief && claude'), 200);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Uptime tick.
  useEffect(() => {
    if (status !== 'running' || !startedAtRef.current) return;
    const interval = setInterval(() => {
      if (startedAtRef.current) setUptime(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Refit on width / collapse changes.
  useEffect(() => {
    if (collapsed) return;
    const t = setTimeout(() => {
      if (!fitRef.current || !termRef.current || !termIdRef.current) return;
      fitRef.current.fit();
      const { cols, rows } = termRef.current;
      void window.pokerApi.resizeTerminal(termIdRef.current, cols, rows);
    }, 220);
    return () => clearTimeout(t);
  }, [width, collapsed]);

  // Window resize.
  useEffect(() => {
    const onResize = (): void => {
      if (!fitRef.current || !termRef.current || !termIdRef.current) return;
      fitRef.current.fit();
      const { cols, rows } = termRef.current;
      void window.pokerApi.resizeTerminal(termIdRef.current, cols, rows);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (termIdRef.current) void window.pokerApi.closeTerminal(termIdRef.current);
      termRef.current?.dispose();
      coachBus.unregister();
    };
  }, []);

  // Drag-to-resize handle.
  function onHandleMouseDown(e: React.MouseEvent): void {
    dragRef.current = { startX: e.clientX, startW: width };
    document.addEventListener('mousemove', onHandleMouseMove);
    document.addEventListener('mouseup', onHandleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }
  function onHandleMouseMove(e: MouseEvent): void {
    if (!dragRef.current) return;
    const delta = dragRef.current.startX - e.clientX;
    const next = Math.max(320, Math.min(900, dragRef.current.startW + delta));
    onResize(next);
  }
  function onHandleMouseUp(): void {
    dragRef.current = null;
    document.removeEventListener('mousemove', onHandleMouseMove);
    document.removeEventListener('mouseup', onHandleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  const uptimeLabel = uptime > 0
    ? `${String(Math.floor(uptime / 60)).padStart(2, '0')}:${String(uptime % 60).padStart(2, '0')}`
    : '00:00';

  return (
    <aside className={`coach-sidebar ${collapsed ? 'collapsed' : ''}`} style={{ width: collapsed ? 36 : width }}>
      {!collapsed && <div className="resize-handle" onMouseDown={onHandleMouseDown} />}
      <button className="sidebar-toggle" onClick={onToggle} title={collapsed ? 'Ouvrir le coach' : 'Réduire'}>
        {collapsed ? '✨' : '›'}
      </button>

      {!collapsed && (
        <>
          <div className="sidebar-header">
            <div className="prompt-line">
              <span className="ps-glyph">❯</span>
              <span className="ps-segment ps-user">mzane42</span>
              <span className="ps-arrow ps-arrow-user">▶</span>
              <span className="ps-segment ps-cwd">~/poker</span>
              <span className="ps-arrow ps-arrow-cwd">▶</span>
              <span className="ps-segment ps-branch"> main</span>
              <span className="ps-arrow ps-arrow-branch">▶</span>
              <span className={`ps-status ps-${status}`}>
                <span className="status-dot" />
                {status === 'running' ? `claude · ${uptimeLabel}` : status === 'exited' ? 'exited' : 'idle'}
              </span>
            </div>

            <div className="sidebar-actions">
              {status === 'idle' && (
                <>
                  <button className="ohmy-btn primary" onClick={() => start('bun run coach-brief && claude')}>
                    <span className="btn-glyph">⚡</span> brief + claude
                  </button>
                  <button className="ohmy-btn" onClick={() => start('claude')}>
                    <span className="btn-glyph">◇</span> claude
                  </button>
                  <button className="ohmy-btn" onClick={() => start('')}>
                    <span className="btn-glyph">$</span> shell
                  </button>
                </>
              )}
              {status === 'running' && (
                <button className="ohmy-btn ghost" onClick={reset}>
                  <span className="btn-glyph">✕</span> reset
                </button>
              )}
              {status === 'exited' && (
                <>
                  <span className="muted">session terminée</span>
                  <button className="ohmy-btn primary" onClick={() => start('bun run coach-brief && claude')}>
                    <span className="btn-glyph">↻</span> relancer
                  </button>
                  <button className="ohmy-btn" onClick={reset}>
                    <span className="btn-glyph">✕</span> clean
                  </button>
                </>
              )}
              <label className="autostart-toggle" title="Démarrer auto au prochain lancement">
                <input type="checkbox" checked={autostart} onChange={toggleAutostart} />
                auto
              </label>
            </div>
          </div>

          <div className="sidebar-terminal" ref={containerRef} />
          {status === 'idle' && (
            <div className="sidebar-empty">
              <p>
                <span className="ps-glyph">❯</span> Démarre Claude avec un brief de session, ou en mode vierge.
              </p>
              <p className="muted">
                Depuis n'importe quelle page, clique « Demander coach » pour injecter le contexte dans cette session.
              </p>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
