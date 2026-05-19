import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';
import { coachBus } from '../lib/coach-bus.js';
import { Icon } from './Icon.js';

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

type Domain = 'poker' | 'paris';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  width: number;
  onResize: (w: number) => void;
  domain?: Domain;
}

type QuickPrompt = { label: string; iconKey: keyof typeof Icon; prompt: string };

const QUICK_PROMPTS_POKER: QuickPrompt[] = [
  {
    label: 'État bankroll',
    iconKey: 'BarChart',
    prompt: 'Récap bref: où en est ma bankroll, mon top leak actuel, et le focus pour la prochaine session ?'
  },
  {
    label: 'Dernière session',
    iconKey: 'Flame',
    prompt: 'Analyse ma dernière session de jeu: 1 pattern positif, 1 erreur récurrente, 1 conseil concret.'
  },
  {
    label: 'Top leak',
    iconKey: 'Target',
    prompt: "Quel est mon leak #1 actuellement (impact € + impact BB), et donne moi un exemple concret de main où ça s'est manifesté avec la correction."
  },
  {
    label: 'Push/fold Nash',
    iconKey: 'Zap',
    prompt: 'Sur mes décisions push/fold à <12 BB, identifie les 3 ranges où je dévie le plus de Nash et explique comment les corriger.'
  },
  {
    label: 'Adversaires',
    iconKey: 'Spade',
    prompt: "Donne moi les 3 adversaires que j'affronte le plus souvent avec leurs profils (VPIP/PFR/AF) et un conseil tactique contre chacun."
  },
  {
    label: 'ROI par format',
    iconKey: 'Banknote',
    prompt: 'Compare mes ROI par format/buy-in. Sur lequel je suis le plus rentable ? Lequel je devrais arrêter ?'
  }
];

const QUICK_PROMPTS_PARIS: QuickPrompt[] = [
  {
    label: 'Picks du jour',
    iconKey: 'Flame',
    prompt: "Brief court: combien de picks STRONG/PLAY/SKIP sur Roland Garros aujourd'hui, et pourquoi le curator a retenu ceux qu'il a retenus ?"
  },
  {
    label: 'Pourquoi SKIP',
    iconKey: 'Target',
    prompt: "Explique pourquoi la majorité des picks d'aujourd'hui sont SKIP. Edge négatif côté Unibet ? Score signaux trop bas ? Donne 2-3 exemples concrets avec chiffres."
  },
  {
    label: 'Risk status',
    iconKey: 'Zap',
    prompt: "Où en est mon risk-gate tennis ? Stop-loss du jour, take-profit, drawdown peak. Faut-il pauser ou réduire les mises ?"
  },
  {
    label: 'ROI tennis',
    iconKey: 'BarChart',
    prompt: 'Récap bankroll tennis: net all-time, ROI, win rate, CLV moyen. Bench contre objectif 1-3% ROI réaliste sur paris sportifs.'
  },
  {
    label: 'Top tipsters',
    iconKey: 'Spade',
    prompt: 'Quels tipsters Reddit/social ont aligné le plus de signaux gagnants ces 7 derniers jours ? Sur quels matchs ?'
  },
  {
    label: 'Bankroll combinée',
    iconKey: 'Banknote',
    prompt: 'Compare bankroll poker vs paris sportifs sur les 30 derniers jours. Lequel performe mieux ? Faut-il rééquilibrer le split de budget ?'
  }
];

const DOMAIN_CFG: Record<Domain, { prompts: QuickPrompt[]; storageAutostart: string; autostartCmd: string; cwd: string }> = {
  poker: {
    prompts: QUICK_PROMPTS_POKER,
    storageAutostart: 'pokerCoach.sidebarAutostart',
    autostartCmd: 'bun run coach-brief && claude',
    cwd: '/Users/bubblz/poker'
  },
  paris: {
    prompts: QUICK_PROMPTS_PARIS,
    storageAutostart: 'pokerCoach.sidebarAutostart.paris',
    autostartCmd: 'claude',
    cwd: '/Users/bubblz/poker'
  }
};

function QuickPrompts({ prompts }: { prompts: QuickPrompt[] }): JSX.Element {
  return (
    <div className="quick-prompts">
      <div className="qp-label">prompts rapides</div>
      <div className="qp-list">
        {prompts.map((qp) => {
          const IconComp = Icon[qp.iconKey];
          return (
            <button key={qp.label} className="qp-btn" onClick={() => coachBus.send(qp.prompt)} title={qp.prompt}>
              <IconComp size={12} /> {qp.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CoachSidebar({ collapsed, onToggle, width, onResize, domain = 'poker' }: Props): JSX.Element {
  const cfg = DOMAIN_CFG[domain];
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'exited'>('idle');
  const [uptime, setUptime] = useState(0);
  const [autostart, setAutostart] = useState(() => localStorage.getItem(cfg.storageAutostart) === '1');
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

  function start(cmd: string, claudeMode: boolean): void {
    if (status === 'running') return;
    if (!containerRef.current) return;
    const term = ensureTerminal();

    void window.pokerApi.createTerminal({ cwd: cfg.cwd, cmd }).then(({ id }) => {
      termIdRef.current = id;
      startedAtRef.current = Date.now();
      setStatus('running');
      coachBus.setClaudeRunning(claudeMode);

      window.pokerApi.onTerminalData(id, (data) => term.write(data));
      window.pokerApi.onTerminalExit(id, () => {
        setStatus('exited');
        termIdRef.current = null;
        coachBus.setClaudeRunning(false);
      });

      term.onData((data) => {
        if (termIdRef.current) void window.pokerApi.writeTerminal(termIdRef.current, data);
      });

      const { cols, rows } = term;
      void window.pokerApi.resizeTerminal(id, cols, rows);
    });
  }

  function escapeForShell(s: string): string {
    return s.replace(/'/g, `'\\''`);
  }

  function startClaudeWithPrompt(initialPrompt: string): void {
    if (status === 'running') {
      // Should be handled by the write path before reaching here, but as a fallback inject.
      if (termIdRef.current) {
        void window.pokerApi.writeTerminal(termIdRef.current, initialPrompt + '\r');
      }
      return;
    }
    const cmd = `claude '${escapeForShell(initialPrompt)}'`;
    start(cmd, true);
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
    localStorage.setItem(cfg.storageAutostart, next ? '1' : '0');
  }

  // Register coach-bus handlers once on mount.
  useEffect(() => {
    coachBus.registerWrite((text) => {
      if (termIdRef.current) void window.pokerApi.writeTerminal(termIdRef.current, text);
    });
    coachBus.registerOpen(() => {
      if (collapsed) onToggle();
    });
    coachBus.registerStartClaude((prompt) => {
      if (collapsed) onToggle();
      startClaudeWithPrompt(prompt);
    });
    return () => coachBus.unregister();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  // Autostart on mount if flag set.
  useEffect(() => {
    if (autostart && status === 'idle') {
      const t = setTimeout(() => start(cfg.autostartCmd, true), 200);
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
        {collapsed ? <Icon.Sparkles size={14} /> : <Icon.ChevronRight size={14} />}
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
                  <button className="ohmy-btn primary" onClick={() => start(cfg.autostartCmd, true)}>
                    <Icon.Zap size={12} /> brief + claude
                  </button>
                  <button className="ohmy-btn" onClick={() => start('claude', true)}>
                    <Icon.Diamond size={12} /> claude
                  </button>
                  <button className="ohmy-btn" onClick={() => start('', false)}>
                    <Icon.MessageCircle size={12} /> shell
                  </button>
                </>
              )}
              {status === 'running' && (
                <button className="ohmy-btn ghost" onClick={reset}>
                  <Icon.X size={12} /> reset
                </button>
              )}
              {status === 'exited' && (
                <>
                  <span className="muted">session terminée</span>
                  <button className="ohmy-btn primary" onClick={() => start(cfg.autostartCmd, true)}>
                    <Icon.RefreshCw size={12} /> relancer
                  </button>
                  <button className="ohmy-btn" onClick={reset}>
                    <Icon.X size={12} /> clean
                  </button>
                </>
              )}
              <label className="autostart-toggle" title="Démarrer auto au prochain lancement">
                <input type="checkbox" checked={autostart} onChange={toggleAutostart} />
                auto
              </label>
            </div>

            <QuickPrompts prompts={cfg.prompts} />
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
