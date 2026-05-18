import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSummaryFile } from '../../src/parser/summary-parser.js';

const FIXTURES = join(__dirname, '../fixtures');

describe('parseSummaryFile', () => {
  it('parses Expresso summary', () => {
    const content = readFileSync(join(FIXTURES, 'expresso_3max_basic_summary.txt'), 'utf-8');
    const s = parseSummaryFile(content);
    expect(s).not.toBeNull();
    expect(s!.tournamentId).toBe('244457459');
    expect(s!.playerName).toBe('mzane42');
    expect(s!.buyIn).toBeGreaterThan(0);
    expect(s!.rake).toBeGreaterThanOrEqual(0);
    expect(s!.finishPosition).toBeGreaterThan(0);
  });

  it('parses MTT Starting Block summary', () => {
    const content = readFileSync(join(FIXTURES, 'mtt_starting_block_summary.txt'), 'utf-8');
    const s = parseSummaryFile(content);
    expect(s).not.toBeNull();
    expect(s!.tournamentName).toBe('Starting Block WiPT - Déglingos !');
  });

  it('parses freeroll summary with Late Registration', () => {
    const content = readFileSync(join(FIXTURES, 'freeroll_summary.txt'), 'utf-8');
    const s = parseSummaryFile(content);
    expect(s).not.toBeNull();
    expect(s!.tournamentId).toBe('401663935');
    expect(s!.buyIn).toBe(0);
    expect(s!.mode).toBe('tt');
  });
});
