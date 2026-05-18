import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface ScannedFiles {
  handFiles: string[];
  summaryFiles: string[];
}

/**
 * Scan a Winamax history directory and return the absolute paths of hand files
 * and tournament summary files. Ignores `.dat` positioning files and similar.
 */
export function scanHistoryDirectory(dirPath: string): ScannedFiles {
  const entries = readdirSync(dirPath);
  const handFiles: string[] = [];
  const summaryFiles: string[] = [];

  for (const name of entries) {
    if (!name.endsWith('.txt')) continue;
    const full = join(dirPath, name);
    try {
      if (!statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    if (name.includes('_summary.txt')) {
      summaryFiles.push(full);
    } else {
      handFiles.push(full);
    }
  }

  handFiles.sort();
  summaryFiles.sort();
  return { handFiles, summaryFiles };
}

/**
 * Given a hand file path, derive the expected summary file path.
 */
export function summaryPathFor(handFilePath: string): string {
  return handFilePath.replace(/\.txt$/, '_summary.txt');
}
