import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';

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

export function Coach(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'running' | 'exited'>('idle');

  function start(cmd: string): void {
    if (!containerRef.current) return;
    setStatus('connecting');

    if (!termRef.current) {
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 13,
        theme: {
          background: '#0f1115',
          foreground: '#e6e8ee',
          cursor: '#a855f7',
          selectionBackground: 'rgba(168, 85, 247, 0.3)',
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
      term.open(containerRef.current);
      fit.fit();
      termRef.current = term;
      fitRef.current = fit;
    }

    void window.pokerApi.createTerminal({ cwd: '/Users/bubblz/poker', cmd }).then(({ id }) => {
      termIdRef.current = id;
      setStatus('running');

      window.pokerApi.onTerminalData(id, (data) => termRef.current?.write(data));
      window.pokerApi.onTerminalExit(id, () => {
        setStatus('exited');
        termIdRef.current = null;
      });

      termRef.current?.onData((data) => {
        if (termIdRef.current) void window.pokerApi.writeTerminal(termIdRef.current, data);
      });

      const term = termRef.current;
      if (term) {
        const { cols, rows } = term;
        void window.pokerApi.resizeTerminal(id, cols, rows);
      }
    });
  }

  function startWithBrief(): void {
    start('bun run coach-brief && claude');
  }

  function startClean(): void {
    start('claude');
  }

  function reset(): void {
    if (termIdRef.current) {
      void window.pokerApi.closeTerminal(termIdRef.current);
      termIdRef.current = null;
    }
    termRef.current?.clear();
    setStatus('idle');
  }

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

  useEffect(() => {
    return () => {
      if (termIdRef.current) void window.pokerApi.closeTerminal(termIdRef.current);
      termRef.current?.dispose();
    };
  }, []);

  return (
    <div className="coach-page">
      <div className="coach-header">
        <div>
          <h2>Coach</h2>
          <p className="muted">Terminal Claude Code intégré, pré-chargé avec brief de session.</p>
        </div>
        <div className="coach-actions">
          {status === 'idle' && (
            <>
              <button className="sparkle-btn" onClick={startWithBrief}>✨ Lancer avec brief</button>
              <button className="coach-btn coach-clean" onClick={startClean}>Lancer vierge</button>
            </>
          )}
          {(status === 'running' || status === 'connecting') && (
            <button className="coach-btn coach-clean" onClick={reset}>Reset terminal</button>
          )}
          {status === 'exited' && (
            <>
              <span className="muted">Session terminée</span>
              <button className="sparkle-btn" onClick={startWithBrief}>✨ Nouvelle session</button>
              <button className="coach-btn coach-clean" onClick={reset}>Clean</button>
            </>
          )}
        </div>
      </div>
      <div className="coach-terminal-container" ref={containerRef} />
      {status === 'idle' && (
        <div className="coach-empty muted">
          Clique "Lancer avec brief" pour démarrer Claude Code dans le projet avec un récap de bankroll, dernière session, et focus du moment.
        </div>
      )}
    </div>
  );
}
