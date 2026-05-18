import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import {
  parseHandHistoryFile,
  parseSummaryFile,
  scanHistoryDirectory,
  summaryPathFor
} from '../parser/index.js';
import {
  createHandRepository,
  createImportStateRepository,
  createTournamentRepository,
  type Database
} from '../db/index.js';

export interface BulkImportOptions {
  historyDir: string;
  heroAccount: string;
  force?: boolean;
  onProgress?: (msg: ImportProgress) => void;
}

export interface ImportProgress {
  fileIndex: number;
  totalFiles: number;
  fileName: string;
  handsImportedThisFile: number;
  totalHandsImported: number;
}

export interface BulkImportResult {
  filesProcessed: number;
  handsImported: number;
  tournamentsImported: number;
  errors: { file: string; message: string }[];
}

export function bulkImport(db: Database, opts: BulkImportOptions): BulkImportResult {
  const { historyDir, heroAccount, force = false, onProgress } = opts;
  const { handFiles } = scanHistoryDirectory(historyDir);

  const hands = createHandRepository(db);
  const tournaments = createTournamentRepository(db);
  const state = createImportStateRepository(db);

  if (force) state.resetAll();

  let totalHands = 0;
  let totalTournaments = 0;
  const errors: { file: string; message: string }[] = [];

  for (let i = 0; i < handFiles.length; i++) {
    const handFile = handFiles[i]!;
    const fileName = basename(handFile);

    try {
      const stats = statSync(handFile);
      const previous = state.get(handFile);
      if (previous && !force && previous.fileSize === stats.size) {
        // Already fully imported, skip
        continue;
      }

      // Import the summary file FIRST so the tournament row exists before hands reference it
      const summaryFile = summaryPathFor(handFile);
      try {
        const summaryContent = readFileSync(summaryFile, 'utf-8');
        const summary = parseSummaryFile(summaryContent);
        if (summary) {
          tournaments.upsertTournament(summary, heroAccount);
          totalTournaments++;
        }
      } catch {
        // No summary file - cash games don't have one, that's OK
      }

      const content = readFileSync(handFile, 'utf-8');
      const parsedHands = parseHandHistoryFile(content, heroAccount);

      // For tournament hands whose summary is missing, create a minimal tournament row
      // to satisfy the foreign key constraint
      ensureTournamentRowsExist(parsedHands, tournaments, heroAccount);

      const inserted = hands.insertHandBatch(parsedHands, heroAccount);
      totalHands += inserted;

      state.upsert({
        filePath: handFile,
        fileSize: stats.size,
        byteOffset: stats.size,
        handsImported: parsedHands.length,
        lastImportedAt: new Date().toISOString(),
        fileKind: 'hand'
      });

      onProgress?.({
        fileIndex: i + 1,
        totalFiles: handFiles.length,
        fileName,
        handsImportedThisFile: inserted,
        totalHandsImported: totalHands
      });
    } catch (err) {
      errors.push({ file: fileName, message: (err as Error).message });
    }
  }

  return {
    filesProcessed: handFiles.length,
    handsImported: totalHands,
    tournamentsImported: totalTournaments,
    errors
  };
}

function ensureTournamentRowsExist(
  hands: ReturnType<typeof parseHandHistoryFile>,
  tournaments: ReturnType<typeof createTournamentRepository>,
  heroAccount: string
): void {
  const seen = new Set<string>();
  for (const hand of hands) {
    if (!hand.tournamentId || hand.gameType !== 'tournament') continue;
    if (seen.has(hand.tournamentId)) continue;
    seen.add(hand.tournamentId);
    tournaments.insertIfMissing(
      {
        tournamentId: hand.tournamentId,
        tournamentName: hand.tournamentName,
        playerName: hand.heroName,
        buyIn: hand.buyIn,
        rake: hand.rake,
        registeredPlayers: null,
        mode: '',
        type: '',
        speed: '',
        prizepool: null,
        startTime: hand.date,
        duration: null,
        finishPosition: 0,
        winnings: null
      },
      heroAccount
    );
  }
}
