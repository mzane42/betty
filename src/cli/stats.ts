#!/usr/bin/env tsx
import { defaultDbPath, openDatabase } from '../db/index.js';
import {
  getBankrollSummary,
  getYearlyBankroll,
  getRoiByFormat,
  rebuildPlayerStats
} from '../stats/index.js';
import { derivePlayerStats } from '../stats/derived-stats.js';
import type { PlayerStatsRaw } from '../types/player.js';

async function main(): Promise<void> {
  const heroAccount = process.argv[2] ?? 'mzane42';
  const db = openDatabase({ dbPath: defaultDbPath() });

  process.stdout.write('Rebuilding player stats...\n');
  const start = Date.now();
  rebuildPlayerStats(db, heroAccount);
  process.stdout.write(`Stats rebuilt in ${((Date.now() - start) / 1000).toFixed(2)}s\n\n`);

  // Bankroll summary
  const summary = getBankrollSummary(db, heroAccount);
  process.stdout.write('=== BANKROLL SUMMARY ===\n');
  process.stdout.write(`All-time net:        ${formatEuros(summary.allTimeNet)}\n`);
  process.stdout.write(`Current year net:    ${formatEuros(summary.currentYearNet)}\n`);
  process.stdout.write(`Current month net:   ${formatEuros(summary.currentMonthNet)}\n`);
  process.stdout.write(`Tournaments played:  ${summary.tournamentsPlayed}\n`);
  process.stdout.write(`Hands played:        ${summary.handsPlayed}\n`);
  process.stdout.write(`Buy-ins paid:        ${formatEuros(summary.totalBuyIns)}\n`);
  process.stdout.write(`Winnings collected:  ${formatEuros(summary.totalWinnings)}\n`);
  if (summary.bestYear) {
    process.stdout.write(`Best year:           ${summary.bestYear.year}: ${formatEuros(summary.bestYear.net)}\n`);
  }
  if (summary.worstYear) {
    process.stdout.write(`Worst year:          ${summary.worstYear.year}: ${formatEuros(summary.worstYear.net)}\n`);
  }
  if (summary.bestMonth) {
    process.stdout.write(`Best month:          ${summary.bestMonth.month}: ${formatEuros(summary.bestMonth.net)}\n`);
  }
  if (summary.worstMonth) {
    process.stdout.write(`Worst month:         ${summary.worstMonth.month}: ${formatEuros(summary.worstMonth.net)}\n`);
  }

  // Yearly breakdown
  process.stdout.write('\n=== YEARLY BREAKDOWN ===\n');
  const years = getYearlyBankroll(db, heroAccount);
  for (const y of years) {
    process.stdout.write(`  ${y.year}: ${formatEuros(y.net).padStart(10)} | ${String(y.tournamentsPlayed).padStart(4)} tournaments | ${String(y.handsPlayed).padStart(5)} hands\n`);
  }

  // ROI by format
  process.stdout.write('\n=== ROI BY FORMAT ===\n');
  const formats = getRoiByFormat(db, heroAccount);
  for (const f of formats) {
    const roi = f.roi.toFixed(1);
    process.stdout.write(`  ${f.format.padEnd(18)} ${formatEuros(f.net).padStart(10)}  (${roi}% ROI, ${f.tournamentsPlayed} tournaments)\n`);
  }

  // Top opponents by hands
  process.stdout.write('\n=== TOP OPPONENTS (by hands seen) ===\n');
  const players = db
    .prepare(`SELECT * FROM player_stats WHERE hero_account = ? AND player_name != ? ORDER BY hands_played DESC LIMIT 10`)
    .all(heroAccount, heroAccount) as Array<{
    player_name: string;
    hands_played: number;
    vpip_opportunities: number;
    vpip_actions: number;
    pfr_opportunities: number;
    pfr_actions: number;
    three_bet_opportunities: number;
    three_bet_actions: number;
    fold_to_3bet_opportunities: number;
    fold_to_3bet_actions: number;
    cbet_opportunities: number;
    cbet_actions: number;
    fold_to_cbet_opportunities: number;
    fold_to_cbet_actions: number;
    total_bets: number;
    total_raises: number;
    total_calls: number;
    went_to_showdown: number;
    won_at_showdown: number;
    total_won: number;
    total_invested: number;
    first_seen: string | null;
    last_seen: string | null;
    hero_account: string;
  }>;

  for (const p of players) {
    const raw: PlayerStatsRaw = {
      playerName: p.player_name,
      heroAccount: p.hero_account,
      handsPlayed: p.hands_played,
      vpipOpportunities: p.vpip_opportunities,
      vpipActions: p.vpip_actions,
      pfrOpportunities: p.pfr_opportunities,
      pfrActions: p.pfr_actions,
      threeBetOpportunities: p.three_bet_opportunities,
      threeBetActions: p.three_bet_actions,
      foldTo3betOpportunities: p.fold_to_3bet_opportunities,
      foldTo3betActions: p.fold_to_3bet_actions,
      cbetOpportunities: p.cbet_opportunities,
      cbetActions: p.cbet_actions,
      foldToCbetOpportunities: p.fold_to_cbet_opportunities,
      foldToCbetActions: p.fold_to_cbet_actions,
      totalBets: p.total_bets,
      totalRaises: p.total_raises,
      totalCalls: p.total_calls,
      wentToShowdown: p.went_to_showdown,
      wonAtShowdown: p.won_at_showdown,
      totalWon: p.total_won,
      totalInvested: p.total_invested,
      firstSeen: p.first_seen,
      lastSeen: p.last_seen
    };
    const d = derivePlayerStats(raw);
    const vpip = d.vpip === null ? '—' : d.vpip.toFixed(0);
    const pfr = d.pfr === null ? '—' : d.pfr.toFixed(0);
    const af = d.aggressionFactor === null ? '—' : d.aggressionFactor.toFixed(1);
    process.stdout.write(
      `  ${p.player_name.padEnd(20)} ${String(p.hands_played).padStart(5)} hands  VPIP ${vpip.padStart(3)}%  PFR ${pfr.padStart(3)}%  AF ${af.padStart(4)}  ${d.tendency}\n`
    );
  }

  db.close();
}

function formatEuros(n: number): string {
  const sign = n >= 0 ? '+' : '-';
  return `${sign}${Math.abs(n).toFixed(2)}€`;
}

main().catch((err) => {
  process.stderr.write(`Stats failed: ${(err as Error).message}\n`);
  process.exit(1);
});
