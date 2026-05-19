/**
 * Telegram bot — push picks + accept commands.
 *
 * Boot conditions (any missing = silent no-op):
 *   - TELEGRAM_BOT_TOKEN env var set (token from @BotFather)
 *   - TELEGRAM_ALLOWED_USER_IDS env var set (comma-separated numeric Telegram user IDs)
 *
 * Push events:
 *   - STRONG pick available (called from pick-generator on STRONG verdict)
 *   - Daily PLAY digest at 09:00 Europe/Paris
 *   - Line moved against placed bet (>3% drift)
 *   - Daily summary at 21:00 Europe/Paris
 *   - Stop-loss / take-profit hit
 *
 * Commands accepted:
 *   /picks                            → today's STRONG + PLAY picks
 *   /placed <pick_id> <stake_eur>     → log placement
 *   /skip <pick_id>                   → mark skipped (informational; we keep the row)
 *   /bankroll                         → current totals
 *   /stop                             → pause picks for 24h
 *   /resume                           → clear pause
 *
 * Uses dynamic import so the absence of `node-telegram-bot-api` in `bun.lock`
 * doesn't crash boot. Module is only loaded when both env vars are present.
 */

import { randomBytes } from 'node:crypto';
import type { Database } from '../db/database.js';
import {
  getPick,
  getTennisBankrollSummary,
  insertBet,
  listPicksForDay
} from '../db/repositories/tennis-repository.js';
import { manualPause, manualResume, evaluateRiskGate, loadRiskConfig } from './risk-gate.js';

const TOURNAMENT = 'roland_garros_2026';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BotInstance = any;

let bot: BotInstance | null = null;
let allowedUserIds: Set<number> = new Set();

export interface TelegramBootResult {
  enabled: boolean;
  reason?: string;
}

export async function startTelegramBot(getDb: () => Database): Promise<TelegramBootResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const idsCsv = process.env.TELEGRAM_ALLOWED_USER_IDS;
  if (!token) return { enabled: false, reason: 'TELEGRAM_BOT_TOKEN not set' };
  if (!idsCsv) return { enabled: false, reason: 'TELEGRAM_ALLOWED_USER_IDS not set' };

  allowedUserIds = new Set(
    idsCsv
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n))
  );
  if (allowedUserIds.size === 0) {
    return { enabled: false, reason: 'TELEGRAM_ALLOWED_USER_IDS parsed to empty set' };
  }

  let TelegramBot: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import('node-telegram-bot-api' as any)) as {
      default: new (token: string, options: { polling: boolean }) => BotInstance;
    };
    TelegramBot = mod.default;
  } catch (err) {
    return {
      enabled: false,
      reason: `node-telegram-bot-api not installed: ${(err as Error).message}. Run: bun add node-telegram-bot-api`
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BotCtor = TelegramBot as any;
  bot = new BotCtor(token, { polling: true });
  registerHandlers(getDb);
  // eslint-disable-next-line no-console
  console.log(`[telegram] bot started, ${allowedUserIds.size} allowed user(s)`);
  return { enabled: true };
}

function registerHandlers(getDb: () => Database): void {
  if (!bot) return;

  bot.onText(/^\/picks$/, (msg: { chat: { id: number }; from?: { id: number } }) => {
    if (!authorize(msg)) return;
    const date = new Date().toISOString().slice(0, 10);
    const picks = listPicksForDay(getDb(), TOURNAMENT, date, 'PLAY');
    if (picks.length === 0) {
      void bot.sendMessage(msg.chat.id, 'Aucun pick pour aujourd\'hui.');
      return;
    }
    const lines = picks.map(
      (p) =>
        `${p.verdict} | ${p.selection} @${p.bookDecimalOdds.toFixed(2)} (${p.bestBook}) | edge ${(
          p.edgePct * 100
        ).toFixed(1)}% | score ${p.signalScore} | Kelly ${(p.kellyStakePct * 100).toFixed(2)}%\n/placed ${p.pickId} <stake_eur>`
    );
    void bot.sendMessage(msg.chat.id, `Picks du jour (${picks.length}):\n\n${lines.join('\n\n')}`);
  });

  bot.onText(
    /^\/placed (\S+) (\S+)$/,
    (
      msg: { chat: { id: number }; from?: { id: number } },
      match: RegExpMatchArray | null
    ) => {
      if (!authorize(msg) || !match) return;
      const pickId = match[1];
      const stakeEur = parseFloat(match[2]);
      if (!Number.isFinite(stakeEur) || stakeEur <= 0) {
        void bot.sendMessage(msg.chat.id, 'Stake invalide.');
        return;
      }
      const pick = getPick(getDb(), pickId);
      if (!pick) {
        void bot.sendMessage(msg.chat.id, `Pick ${pickId} introuvable.`);
        return;
      }
      const bet = {
        betId: `bet_${Date.now()}_${randomBytes(4).toString('hex')}`,
        pickId: pick.pickId,
        matchId: pick.matchId,
        selection: pick.selection,
        book: pick.bestBook,
        decimalOdds: pick.bookDecimalOdds,
        stakeEur,
        placedAt: new Date().toISOString(),
        result: null,
        pnlEur: null,
        closingOdds: null,
        postMatchReviewJson: null
      };
      insertBet(getDb(), bet);
      void bot.sendMessage(
        msg.chat.id,
        `OK. Bet ${stakeEur.toFixed(2)}€ enregistré sur ${pick.bestBook} @${pick.bookDecimalOdds.toFixed(2)}.`
      );
    }
  );

  bot.onText(/^\/bankroll$/, (msg: { chat: { id: number }; from?: { id: number } }) => {
    if (!authorize(msg)) return;
    const s = getTennisBankrollSummary(getDb(), TOURNAMENT);
    const lines = [
      `Bankroll tennis (RG 2026):`,
      `Net all-time: ${s.allTimeNet.toFixed(2)}€`,
      `ROI: ${s.roi.toFixed(1)}%`,
      `Bets: ${s.betsWon}W-${s.betsLost}L-${s.betsVoid}V (${s.betsPending} en cours)`,
      `Win rate: ${(s.winRate * 100).toFixed(1)}%`,
      `CLV moyen: ${s.avgClvPct.toFixed(2)}%`
    ];
    void bot.sendMessage(msg.chat.id, lines.join('\n'));
  });

  bot.onText(/^\/stop$/, (msg: { chat: { id: number }; from?: { id: number } }) => {
    if (!authorize(msg)) return;
    const cfg = manualPause(24);
    void bot.sendMessage(
      msg.chat.id,
      `Picks en pause manuelle jusqu'à ${cfg.pausedUntilIso ?? '?'} (24h).`
    );
  });

  bot.onText(/^\/resume$/, (msg: { chat: { id: number }; from?: { id: number } }) => {
    if (!authorize(msg)) return;
    manualResume();
    void bot.sendMessage(msg.chat.id, 'Picks réactivés.');
  });

  bot.onText(/^\/status$/, (msg: { chat: { id: number }; from?: { id: number } }) => {
    if (!authorize(msg)) return;
    const gate = evaluateRiskGate(getDb());
    const cfg = loadRiskConfig();
    void bot.sendMessage(
      msg.chat.id,
      `État: ${gate.reason}\n${gate.message}\nBankroll réf: ${cfg.bankrollEur}€`
    );
  });
}

function authorize(msg: { chat: { id: number }; from?: { id: number } }): boolean {
  if (!msg.from || !allowedUserIds.has(msg.from.id)) {
    if (bot) void bot.sendMessage(msg.chat.id, 'Accès refusé.');
    return false;
  }
  return true;
}

export async function pushTelegramMessage(text: string): Promise<void> {
  if (!bot) return;
  for (const id of allowedUserIds) {
    try {
      await bot.sendMessage(id, text);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[telegram] push failed:', (err as Error).message);
    }
  }
}

export function isTelegramEnabled(): boolean {
  return bot !== null;
}
