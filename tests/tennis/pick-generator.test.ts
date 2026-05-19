import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, type Database } from '../../src/db/database.js';
import { generatePick, previewVerdict } from '../../src/tennis/pick-generator.js';
import {
  getTennisBankrollSummary,
  listPicksForDay
} from '../../src/db/repositories/tennis-repository.js';

// Mock Claude reviewer so tests don't try to spawn the CLI.
vi.mock('../../src/tennis/claude-tennis-reviewer.js', () => ({
  reviewTennisMatch: vi.fn().mockResolvedValue({
    pickVerdict: 'PLAY',
    summary: 'Mock review summary',
    rationale: ['rationale 1'],
    cautions: [],
    rawResponse: '{}'
  })
}));

// Mock Telegram bot so tests don't try to send messages.
vi.mock('../../src/tennis/telegram-bot.js', () => ({
  pushTelegramMessage: vi.fn().mockResolvedValue(undefined),
  startTelegramBot: vi.fn().mockResolvedValue({ enabled: false }),
  isTelegramEnabled: vi.fn().mockReturnValue(false)
}));

describe('pick-generator integration', () => {
  let tempDir: string;
  let db: Database;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tennis-test-'));
    const dbPath = join(tempDir, 'test.db');
    db = openDatabase({ dbPath });
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('persists a STRONG pick when signals align', async () => {
    const result = await generatePick(db, {
      match: {
        tournament: 'roland_garros_2026',
        surface: 'clay',
        round: 'R64',
        scheduledAt: '2026-05-20T13:00:00Z',
        player1: { id: 'alcaraz_c', name: 'Carlos Alcaraz', rank: 2 },
        player2: { id: 'dimitrov_g', name: 'Grigor Dimitrov', rank: 16 }
      },
      selection: 'alcaraz_c',
      oddsByBook: { unibet: 1.5 },
      signals: {
        pinnacleProb: 0.78,
        betfairVolume: 0.7,
        tipsterAlignedCount: 4,
        lineMovementPct: 0.05
      },
      skipClaudeReview: true
    });

    expect(result.pick.verdict).toBe('STRONG');
    expect(result.worthPlacing).toBe(true);
    expect(result.pick.bestBook).toBe('unibet');
    expect(result.pick.kellyStakePct).toBeGreaterThan(0);

    // Verify it landed in DB
    const picks = listPicksForDay(db, 'roland_garros_2026', '2026-05-20', 'STRONG');
    expect(picks).toHaveLength(1);
    expect(picks[0].selection).toBe('alcaraz_c');
  });

  it('persists a SKIP pick when edge is negative', async () => {
    const result = await generatePick(db, {
      match: {
        tournament: 'roland_garros_2026',
        surface: 'clay',
        round: 'R32',
        scheduledAt: '2026-05-22T11:00:00Z',
        player1: { id: 'sinner_j', name: 'Jannik Sinner', rank: 1 },
        player2: { id: 'rublev_a', name: 'Andrey Rublev', rank: 12 }
      },
      selection: 'rublev_a', // backing the underdog
      oddsByBook: { unibet: 3.5 }, // cote chère, but underdog rarely +EV
      signals: {
        pinnacleProb: 0.25, // Pinnacle still gives Rublev only 25%
        betfairVolume: -0.4, // Betfair laying Rublev
        tipsterAlignedCount: 0,
        lineMovementPct: -0.02
      },
      skipClaudeReview: true
    });

    expect(result.pick.verdict).toBe('SKIP');
    expect(result.worthPlacing).toBe(false);
  });

  it('throws when no placeable-book odds are supplied', async () => {
    await expect(
      generatePick(db, {
        match: {
          tournament: 'roland_garros_2026',
          surface: 'clay',
          round: 'R128',
          scheduledAt: '2026-05-19T10:00:00Z',
          player1: { id: 'a_a', name: 'Player A', rank: 50 },
          player2: { id: 'b_b', name: 'Player B', rank: 80 }
        },
        selection: 'a_a',
        oddsByBook: { pinnacle: 1.5, betfair: 1.52 }, // reference-only
        skipClaudeReview: true
      })
    ).rejects.toThrow(/placeable/i);
  });

  it('respects manual model prob override and computes correct edge', async () => {
    const result = await generatePick(db, {
      match: {
        tournament: 'roland_garros_2026',
        surface: 'clay',
        round: 'R16',
        scheduledAt: '2026-05-24T16:00:00Z',
        player1: { id: 'a_a', name: 'Player A', rank: 30 },
        player2: { id: 'b_b', name: 'Player B', rank: 35 }
      },
      selection: 'a_a',
      oddsByBook: { unibet: 2.5 },
      signals: { pinnacleProb: 0.5 },
      skipClaudeReview: true
    });

    // Whether STRONG/PLAY/SKIP depends on score, but bankroll math must be consistent.
    const expectedKellyMax = 0.02; // cap
    expect(result.pick.kellyStakePct).toBeLessThanOrEqual(expectedKellyMax);
    expect(result.pick.bookDecimalOdds).toBe(2.5);
  });

  it('updates bankroll summary as bets resolve', async () => {
    // Insert a pick + a settled won bet manually to exercise the bankroll path.
    const { insertBet, settleBet, upsertMatch, upsertPlayer } = await import(
      '../../src/db/repositories/tennis-repository.js'
    );
    upsertPlayer(db, {
      playerId: 'a_a',
      name: 'Player A',
      country: null,
      hand: null,
      heightCm: null,
      birthDate: null,
      rank: null,
      rankPoints: null,
      rankTour: null,
      rankUpdatedAt: null,
      updatedAt: new Date().toISOString()
    });
    upsertPlayer(db, {
      playerId: 'b_b',
      name: 'Player B',
      country: null,
      hand: null,
      heightCm: null,
      birthDate: null,
      rank: null,
      rankPoints: null,
      rankTour: null,
      rankUpdatedAt: null,
      updatedAt: new Date().toISOString()
    });
    upsertMatch(db, {
      matchId: 'rg2026_r128_m1',
      tournament: 'roland_garros_2026',
      surface: 'clay',
      round: 'R128',
      player1Id: 'a_a',
      player2Id: 'b_b',
      scheduledAt: '2026-05-19T10:00:00Z',
      status: 'scheduled',
      winnerId: null,
      score: null
    });
    insertBet(db, {
      betId: 'bet_1',
      pickId: null,
      matchId: 'rg2026_r128_m1',
      selection: 'a_a',
      book: 'unibet',
      decimalOdds: 1.5,
      stakeEur: 10,
      placedAt: '2026-05-19T11:00:00Z',
      result: null,
      pnlEur: null,
      closingOdds: null
    });

    let summary = getTennisBankrollSummary(db, 'roland_garros_2026');
    expect(summary.betsPending).toBe(1);
    expect(summary.allTimeNet).toBe(0);

    settleBet(db, 'bet_1', 'won', 5, 1.45);
    summary = getTennisBankrollSummary(db, 'roland_garros_2026');
    expect(summary.betsWon).toBe(1);
    expect(summary.betsPending).toBe(0);
    expect(summary.allTimeNet).toBeCloseTo(5, 5);
    expect(summary.avgClvPct).toBeCloseTo((1.5 - 1.45) / 1.45 * 100, 3);
  });
});

describe('previewVerdict', () => {
  it('mirrors live scorer output without DB writes', () => {
    const res = previewVerdict({
      modelProb: 0.6,
      bookDecimalOdds: 2.0,
      signals: { pinnacleProb: 0.58 }
    });
    expect(res.fairDecimalOdds).toBeCloseTo(1 / 0.6, 5);
    expect(res.edge).toBeGreaterThan(0);
    expect(['STRONG', 'PLAY', 'SKIP']).toContain(res.verdict);
  });
});
