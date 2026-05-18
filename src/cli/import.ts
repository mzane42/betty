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
  if (!args.dir) {
    args.dir = join(homedir(), 'Documents', 'Winamax Poker', 'accounts', args.account, 'history');
  }
  return args;
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
  process.stdout.write(`Importing from: ${args.dir}\n`);
  process.stdout.write(`Hero account:   ${args.account}\n`);
  process.stdout.write(`Database:       ${args.dbPath}\n`);
  process.stdout.write(`Force re-import: ${args.force}\n\n`);

  const start = Date.now();
  const db = openDatabase({ dbPath: args.dbPath });

  const result = bulkImport(db, {
    historyDir: args.dir!,
    heroAccount: args.account,
    force: args.force,
    onProgress: (p) => {
      if (p.fileIndex % 100 === 0 || p.fileIndex === p.totalFiles) {
        const pct = ((p.fileIndex / p.totalFiles) * 100).toFixed(1);
        process.stdout.write(
          `[${pct}%] ${p.fileIndex}/${p.totalFiles} files — ${p.totalHandsImported} hands imported\n`
        );
      }
    }
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  process.stdout.write(`\n--- Import Complete (${elapsed}s) ---\n`);
  process.stdout.write(`Files processed:       ${result.filesProcessed}\n`);
  process.stdout.write(`Hands imported:        ${result.handsImported}\n`);
  process.stdout.write(`Tournaments imported:  ${result.tournamentsImported}\n`);
  process.stdout.write(`Errors:                ${result.errors.length}\n`);
  if (result.errors.length > 0) {
    for (const e of result.errors.slice(0, 5)) {
      process.stdout.write(`  ${e.file}: ${e.message}\n`);
    }
  }

  db.close();
}

main().catch((err) => {
  process.stderr.write(`Import failed: ${(err as Error).message}\n`);
  process.exit(1);
});
