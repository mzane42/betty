import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseHandHistoryFile } from '../../src/parser/hand-parser.js';
import { parseSummaryFile } from '../../src/parser/summary-parser.js';
import { scanHistoryDirectory } from '../../src/parser/file-scanner.js';

const HISTORY_DIR = join(homedir(), 'Documents', 'Winamax Poker', 'accounts', 'mzane42', 'history');

describe('integration: full mzane42 history', () => {
  it('parses all hand files without crashing', () => {
    const { handFiles, summaryFiles } = scanHistoryDirectory(HISTORY_DIR);
    expect(handFiles.length).toBeGreaterThan(700);
    expect(summaryFiles.length).toBeGreaterThan(700);

    let totalHands = 0;
    let parseErrors = 0;
    const uniqueOpponents = new Set<string>();

    for (const file of handFiles) {
      const content = readFileSync(file, 'utf-8');
      const hands = parseHandHistoryFile(content, 'mzane42');
      if (hands.length === 0 && content.includes('Winamax Poker')) {
        parseErrors++;
      }
      totalHands += hands.length;
      for (const hand of hands) {
        for (const p of hand.players) {
          if (p.name !== 'mzane42') uniqueOpponents.add(p.name);
        }
      }
    }

    console.log(`Total hands parsed: ${totalHands}`);
    console.log(`Unique opponents: ${uniqueOpponents.size}`);
    console.log(`Files with parse issues: ${parseErrors}`);

    expect(totalHands).toBeGreaterThan(10000);
    expect(uniqueOpponents.size).toBeGreaterThan(1000);
    expect(parseErrors).toBeLessThan(handFiles.length * 0.05);
  });

  it('parses all summary files without crashing', () => {
    const { summaryFiles } = scanHistoryDirectory(HISTORY_DIR);
    let parsed = 0;
    let failed = 0;
    for (const file of summaryFiles) {
      const content = readFileSync(file, 'utf-8');
      const s = parseSummaryFile(content);
      if (s) parsed++;
      else failed++;
    }
    console.log(`Summaries parsed: ${parsed}, failed: ${failed}`);
    expect(parsed).toBeGreaterThan(700);
    expect(failed).toBeLessThan(10);
  });
});
