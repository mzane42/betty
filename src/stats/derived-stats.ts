import type { PlayerDerivedStats, PlayerStatsRaw, PlayerTendency } from '../types/player.js';

const MIN_HANDS_RELIABLE = 30;

export function derivePlayerStats(raw: PlayerStatsRaw): PlayerDerivedStats {
  const vpip = rate(raw.vpipActions, raw.vpipOpportunities);
  const pfr = rate(raw.pfrActions, raw.pfrOpportunities);
  const threeBet = rate(raw.threeBetActions, raw.threeBetOpportunities);
  const foldTo3bet = rate(raw.foldTo3betActions, raw.foldTo3betOpportunities);
  const cbet = rate(raw.cbetActions, raw.cbetOpportunities);
  const foldToCbet = rate(raw.foldToCbetActions, raw.foldToCbetOpportunities);
  const aggression = raw.totalCalls > 0
    ? (raw.totalBets + raw.totalRaises) / raw.totalCalls
    : null;
  const wtsd = raw.handsPlayed > 0 ? (raw.wentToShowdown / raw.handsPlayed) * 100 : null;
  const wsd = raw.wentToShowdown > 0 ? (raw.wonAtShowdown / raw.wentToShowdown) * 100 : null;
  const netResult = raw.totalWon - raw.totalInvested;

  return {
    playerName: raw.playerName,
    handsPlayed: raw.handsPlayed,
    vpip,
    pfr,
    threeBet,
    foldTo3bet,
    cbet,
    foldToCbet,
    aggressionFactor: aggression,
    wtsd,
    wsd,
    netResult,
    tendency: classifyPlayer(raw, { vpip, pfr, aggression })
  };
}

function rate(actions: number, opportunities: number): number | null {
  if (opportunities === 0) return null;
  return (actions / opportunities) * 100;
}

function classifyPlayer(
  raw: PlayerStatsRaw,
  derived: { vpip: number | null; pfr: number | null; aggression: number | null }
): PlayerTendency {
  if (raw.handsPlayed < MIN_HANDS_RELIABLE) return 'unknown';
  const { vpip, pfr, aggression } = derived;
  if (vpip === null) return 'unknown';

  const tight = vpip < 22;
  const loose = vpip > 38;
  const aggressive = (pfr !== null && pfr > 14) || (aggression !== null && aggression > 1.5);
  const passive = !aggressive;
  const maniac = vpip > 55 && aggressive;
  const nit = vpip < 12;

  if (maniac) return 'maniac';
  if (nit) return 'nit';
  if (tight && aggressive) return 'tight-aggressive';
  if (tight && passive) return 'tight-passive';
  if (loose && aggressive) return 'loose-aggressive';
  if (loose && passive) return 'loose-passive';
  return aggressive ? 'tight-aggressive' : 'tight-passive';
}
