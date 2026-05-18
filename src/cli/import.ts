#!/usr/bin/env tsx
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defaultDbPath, openDatabase } from '../db/index.js';
import { bulkImport } from '../importer/bulk-importer.js';

interface Args {
  dir?: string;
  account: string;
  force: boolean;
  dbPath: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    account: 'mzane42',
    force: false,
    dbPath: defaultDbPath()
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir' && argv[i + 1]) {
      args.dir = argv[++i];
    } else if (a === '--account' && argv[i + 1]) {
      args.account = argv[++i]!;
    } else if (a === '--db' && argv[i + 1]) {
      args.dbPath = argv[++i]!;
    } else if (a === '--force') {
      args.force = true;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function getHistoryDirs(account: string, override?: string): string[] {
  if (override) return [override];
  return [
    join(homedir(), 'Documents', 'Winamax Poker', 'accounts', account, 'history'),
    join(
      homedir(),
      'Library',
      'Application Support',
      'winamax',
      'documents',
      'accounts',
      account,
      'history'
    )
  ];
}

function printHelp(): void {
  process.stdout.write(`Usage: bun run import [options]

Options:
  --dir <path>       Path to Winamax history directory
  --account <name>   Hero account name (default: mzane42)
  --db <path>        Path to SQLite DB (default: ~/.poker-coach/poker.db)
  --force            Re-import all files (clears import state)
  --help, -h         Show this help

Example:
  bun run import --account mzane42
  bun run import --account Kappa42 --force
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dirs = getHistoryDirs(args.account, args.dir);
  process.stdout.write(`Hero account:   ${args.account}\n`);
  process.stdout.write(`Database:       ${args.dbPath}\n`);
  process.stdout.write(`Force re-import: ${args.force}\n`);
  process.stdout.write(`History dirs:\n`);
  for (const d of dirs) process.stdout.write(`  - ${d}\n`);
  process.stdout.write('\n');

  const start = Date.now();
  const db = openDatabase({ dbPath: args.dbPath });

  let totalFiles = 0;
  let totalHands = 0;
  let totalTournaments = 0;
  const allErrors: { file: string; message: string }[] = [];

  for (const dir of dirs) {
    try {
      const result = bulkImport(db, {
        historyDir: dir,
        heroAccount: args.account,
        force: args.force,
        onProgress: (p) => {
          if (p.fileIndex % 100 === 0 || p.fileIndex === p.totalFiles) {
            const pct = ((p.fileIndex / p.totalFiles) * 100).toFixed(1);
            process.stdout.write(
              `[${pct}%] ${p.fileIndex}/${p.totalFiles} files — ${p.totalHandsImported} hands imported (${dir.split('/').slice(-3).join('/')})\n`
            );
          }
        }
      });
      totalFiles += result.filesProcessed;
      totalHands += result.handsImported;
      totalTournaments += result.tournamentsImported;
      allErrors.push(...result.errors);
    } catch (err) {
      process.stdout.write(`  skipped ${dir}: ${(err as Error).message}\n`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  process.stdout.write(`\n--- Import Complete (${elapsed}s) ---\n`);
  process.stdout.write(`Files processed:       ${totalFiles}\n`);
  process.stdout.write(`Hands imported:        ${totalHands}\n`);
  process.stdout.write(`Tournaments imported:  ${totalTournaments}\n`);
  process.stdout.write(`Errors:                ${allErrors.length}\n`);
  if (allErrors.length > 0) {
    for (const e of allErrors.slice(0, 5)) {
      process.stdout.write(`  ${e.file}: ${e.message}\n`);
    }
  }

  db.close();
}

main().catch((err) => {
  process.stderr.write(`Import failed: ${(err as Error).message}\n`);
  process.exit(1);
});
