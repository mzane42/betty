import { useEffect, useState } from 'react';
import { pokerApi } from '../api.js';
import { CardGroup } from './PlayingCard.js';
import type { PlayerDerivedStats } from '../../types/player.js';

interface Props {
  handId: string;
}

type StreetName = 'PRE-FLOP' | 'FLOP' | 'TURN' | 'RIVER';
const STREET_ORDER: StreetName[] = ['PRE-FLOP', 'FLOP', 'TURN', 'RIVER'];

interface ActionRow {
  street: string;
  action_order: number;
  player_name: string;
  action_type: string;
  amount: number;
  is_all_in: number;
}

interface PlayerRow {
  player_name: string;
  seat: number;
  position: string;
  stack_start: number;
  is_hero: number;
  cards: string | null;
  won: number;
}

interface HandRow {
  hand_id: string;
  big_blind: number;
  board: string | null;
  total_pot: number;
  hero_cards: string | null;
  hero_equity_preflop: number | null;
  hero_equity_flop: number | null;
  hero_equity_turn: number | null;
  hero_equity_river: number | null;
}

function HudStat({ label, value, flag }: { label: string; value: string; flag?: 'fish' | 'aggro' | null }): JSX.Element {
  return (
    <span className={`hud-stat ${flag ? `hud-flag-${flag}` : ''}`}>
      <span className="hud-stat-label">{label}</span>
      <span className="hud-stat-value">{value}</span>
    </span>
  );
}

function fmtPct(v: number | null): string {
  if (v == null) return '—';
  return `${v.toFixed(0)}%`;
}

function avatarColor(name: string): string {
  // Stable hash → hue
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return `hsl(${h % 360}, 55%, 35%)`;
}

function EquityBadge({ value }: { value: number | null }): JSX.Element | null {
  if (value == null) return null;
  const cls = value >= 65 ? 'eq-strong' : value >= 45 ? 'eq-mid' : value >= 25 ? 'eq-weak' : 'eq-bad';
  return (
    <span className={`equity-badge ${cls}`} title="Hero équity à ce stade">
      {value.toFixed(0)}%
    </span>
  );
}

export function HandReplay({ handId }: Props): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ hand: HandRow; players: PlayerRow[]; actions: ActionRow[] } | null>(null);
  const [hudStats, setHudStats] = useState<Record<string, PlayerDerivedStats | null>>({});
  const [revealed, setRevealed] = useState<number>(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setLoading(true);
    setRevealed(0);
    pokerApi
      .getHand(handId)
      .then((d) => {
        setData(d as unknown as typeof data);
        setLoading(false);

        // Fetch HUD stats for each villain in parallel
        const players = (d as { players?: PlayerRow[] })?.players ?? [];
        const villains = players.filter((p) => p.is_hero === 0).map((p) => p.player_name);
        Promise.all(villains.map((name) => pokerApi.getPlayerDetail(name))).then((rows) => {
          const map: Record<string, PlayerDerivedStats | null> = {};
          villains.forEach((n, i) => (map[n] = rows[i]));
          setHudStats(map);
        });
      })
      .catch(() => setLoading(false));
  }, [handId]);

  useEffect(() => {
    if (!playing) return;
    if (revealed >= STREET_ORDER.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setRevealed((r) => r + 1), 900);
    return () => clearTimeout(t);
  }, [playing, revealed]);

  if (loading) return <div className="replay-loading">Chargement…</div>;
  if (!data) return <div className="replay-loading muted">Main introuvable</div>;

  const board = data.hand.board ? (JSON.parse(data.hand.board) as string[]) : [];
  const heroCards = data.hand.hero_cards ? (JSON.parse(data.hand.hero_cards) as string[]) : null;
  const actionsByStreet = new Map<string, ActionRow[]>();
  for (const a of data.actions) {
    if (!actionsByStreet.has(a.street)) actionsByStreet.set(a.street, []);
    actionsByStreet.get(a.street)!.push(a);
  }

  const streetCards: Record<StreetName, string[]> = {
    'PRE-FLOP': [],
    FLOP: board.slice(0, 3),
    TURN: board.slice(3, 4),
    RIVER: board.slice(4, 5)
  };

  const streetEquity: Record<StreetName, number | null> = {
    'PRE-FLOP': data.hand.hero_equity_preflop,
    FLOP: data.hand.hero_equity_flop,
    TURN: data.hand.hero_equity_turn,
    RIVER: data.hand.hero_equity_river
  };

  return (
    <div className="hand-replay">
      <div className="replay-controls">
        <button onClick={() => { setRevealed(0); setPlaying(true); }} className="replay-play">
          ▶ Rejouer
        </button>
        <div className="replay-progress">
          {STREET_ORDER.map((s, i) => (
            <button
              key={s}
              className={`replay-step ${i === revealed ? 'active' : ''} ${i <= revealed ? 'shown' : ''}`}
              onClick={() => { setPlaying(false); setRevealed(i); }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="replay-hero">
        <span className="muted">Hero:</span>
        <CardGroup cards={heroCards} size="md" withStrength />
      </div>

      {Object.keys(hudStats).length > 0 && (
        <div className="hud-row">
          {data.players
            .filter((p) => p.is_hero === 0)
            .map((p) => {
              const stats = hudStats[p.player_name];
              return (
                <div key={p.player_name} className="hud-card">
                  <div className="hud-name">
                    <span className="hud-avatar" style={{ background: avatarColor(p.player_name) }}>
                      {p.player_name.charAt(0).toUpperCase()}
                    </span>
                    <span>{p.player_name}</span>
                  </div>
                  {stats ? (
                    <div className="hud-stats">
                      <HudStat label="Mains" value={stats.handsPlayed.toString()} />
                      <HudStat label="VPIP" value={fmtPct(stats.vpip)} flag={stats.vpip && stats.vpip > 55 ? 'fish' : null} />
                      <HudStat label="PFR" value={fmtPct(stats.pfr)} />
                      <HudStat label="3b" value={fmtPct(stats.threeBet)} flag={stats.threeBet && stats.threeBet > 10 ? 'aggro' : null} />
                      <HudStat label="AF" value={stats.aggressionFactor != null ? stats.aggressionFactor.toFixed(1) : '—'} />
                      <span className={`hud-tendency tendency-${stats.tendency}`}>{stats.tendency}</span>
                    </div>
                  ) : (
                    <span className="muted">Pas de stats (nouveau)</span>
                  )}
                </div>
              );
            })}
        </div>
      )}

      <div className="replay-streets">
        {STREET_ORDER.map((street, i) => {
          if (i > revealed) return null;
          const cards = streetCards[street];
          const acts = actionsByStreet.get(street) ?? [];
          return (
            <div key={street} className="replay-street">
              <div className="replay-street-header">
                <span className="replay-street-name">{street}</span>
                {cards.length > 0 && <CardGroup cards={cards} size="md" />}
                <EquityBadge value={streetEquity[street]} />
              </div>
              {acts.length > 0 && (
                <div className="replay-actions">
                  {acts.map((a, j) => {
                    const isHero = data.players.find((p) => p.player_name === a.player_name)?.is_hero === 1;
                    return (
                      <div key={`${a.action_order}-${j}`} className={`replay-action ${isHero ? 'is-hero' : ''}`}>
                        <span className="action-player">{a.player_name}</span>
                        <span className={`action-type action-${a.action_type.toLowerCase()}`}>{a.action_type}</span>
                        {a.amount > 0 && <span className="action-amount">{a.amount}</span>}
                        {a.is_all_in === 1 && <span className="action-allin">ALL-IN</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
