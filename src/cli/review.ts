#!/usr/bin/env tsx
import { defaultDbPath, openDatabase } from '../db/index.js';
import {
  loadBasePrompt,
  loadSessionPrompt,
  renderHandForReview,
  renderSessionForReview,
  reviewHand,
  reviewSession
} from '../reviewer/index.js';

async function main(): Promise<void> {
  const mode = process.argv[2] ?? '--help';

  if (mode === '--help' || mode === '-h') {
    process.stdout.write(`Usage:
  bun run review hand <hand_id>          Review a single hand
  bun run review session <YYYY-MM-DD>    Review a session by date
  bun run review last-loss               Review hero's biggest losing hand
`);
    return;
  }

  const db = openDatabase({ dbPath: defaultDbPath() });
  const heroAccount = 'mzane42';

  if (mode === 'hand') {
    const handId = process.argv[3];
    if (!handId) {
      process.stderr.write('Missing hand_id\n');
      process.exit(1);
    }
    process.stdout.write(`Reviewing hand ${handId}…\n\n`);
    const handText = renderHandForReview(db, handId);
    process.stdout.write(handText + '\n\n--- Claude analysis ---\n\n');
    const result = await reviewHand(loadBasePrompt(), handText);
    printHandReview(result);
  } else if (mode === 'session') {
    const date = process.argv[3];
    if (!date) {
      process.stderr.write('Missing date (YYYY-MM-DD)\n');
      process.exit(1);
    }
    process.stdout.write(`Reviewing session ${date}…\n\n`);
    const sessionText = renderSessionForReview(db, date, heroAccount);
    process.stdout.write(sessionText + '\n\n--- Claude analysis ---\n\n');
    const result = await reviewSession(loadSessionPrompt(), sessionText);
    printSessionReview(result);
  } else if (mode === 'last-loss') {
    const row = db
      .prepare(
        `SELECT hand_id, (hero_won - hero_invested) as net FROM hands
         WHERE hero_account = ? ORDER BY (hero_won - hero_invested) ASC LIMIT 1`
      )
      .get(heroAccount) as { hand_id: string; net: number } | undefined;
    if (!row) {
      process.stderr.write('No hands found\n');
      process.exit(1);
    }
    process.stdout.write(`Reviewing biggest loss (${row.net.toFixed(0)} chips, hand ${row.hand_id})…\n\n`);
    const handText = renderHandForReview(db, row.hand_id);
    process.stdout.write(handText + '\n\n--- Claude analysis ---\n\n');
    const result = await reviewHand(loadBasePrompt(), handText);
    printHandReview(result);
  } else {
    process.stderr.write(`Unknown mode: ${mode}\n`);
    process.exit(1);
  }

  db.close();
}

function printHandReview(r: { verdict: string; overall: string; keyMoments: { street: string; issue: string; suggestion: string }[]; alternativeLine: string; lessons: string[] }): void {
  process.stdout.write(`Verdict: ${r.verdict.toUpperCase()}\n`);
  process.stdout.write(`Overall: ${r.overall}\n\n`);
  if (r.keyMoments.length > 0) {
    process.stdout.write('Key moments:\n');
    for (const m of r.keyMoments) {
      process.stdout.write(`  [${m.street}] ${m.issue}\n`);
      process.stdout.write(`    → ${m.suggestion}\n`);
    }
    process.stdout.write('\n');
  }
  process.stdout.write(`Alternative line: ${r.alternativeLine}\n\n`);
  if (r.lessons.length > 0) {
    process.stdout.write('Lessons:\n');
    for (const l of r.lessons) process.stdout.write(`  • ${l}\n`);
  }
}

function printSessionReview(r: { sessionVerdict: string; summary: string; patterns: { pattern: string; impact: string; advice: string }[]; lessons: string[]; nextSessionFocus: string }): void {
  process.stdout.write(`Session verdict: ${r.sessionVerdict.toUpperCase()}\n`);
  process.stdout.write(`Summary: ${r.summary}\n\n`);
  if (r.patterns.length > 0) {
    process.stdout.write('Patterns:\n');
    for (const p of r.patterns) {
      process.stdout.write(`  [${p.impact}] ${p.pattern}\n`);
      process.stdout.write(`    → ${p.advice}\n`);
    }
    process.stdout.write('\n');
  }
  if (r.lessons.length > 0) {
    process.stdout.write('Lessons:\n');
    for (const l of r.lessons) process.stdout.write(`  • ${l}\n`);
    process.stdout.write('\n');
  }
  process.stdout.write(`Next session focus: ${r.nextSessionFocus}\n`);
}

main().catch((err) => {
  process.stderr.write(`Review failed: ${(err as Error).message}\n`);
  process.exit(1);
});
