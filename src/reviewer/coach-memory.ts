import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { SessionReviewResult, TournamentReviewResult, HandReviewResult } from './review-types.js';

export function memoryPath(): string {
  return join(homedir(), '.poker-coach', 'coach-memory.md');
}

function ensureFile(): string {
  const p = memoryPath();
  mkdirSync(dirname(p), { recursive: true });
  if (!existsSync(p)) {
    writeFileSync(
      p,
      `# Poker Coach Memory — mzane42\n\nResumes auto-générés des sessions/tournois/mains analysées par l'IA.\nLes entrées les plus récentes en haut.\n\n---\n\n`
    );
  }
  return p;
}

export function appendSessionMemory(sessionDate: string, review: SessionReviewResult): void {
  const p = ensureFile();
  const entry = [
    `## Session ${sessionDate} — ${review.sessionVerdict}`,
    review.summary,
    review.biggestMistake ? `- Erreur clé: ${review.biggestMistake.description}` : null,
    review.biggestWin ? `- Bon coup: ${review.biggestWin.description}` : null,
    review.nextSessionFocus ? `- Focus suivant: ${review.nextSessionFocus}` : null,
    review.lessons.length > 0 ? `- Leçons: ${review.lessons.join(' · ')}` : null,
    `_(saved ${new Date().toISOString()})_`,
    ''
  ]
    .filter(Boolean)
    .join('\n');
  prepend(p, entry + '\n');
}

export function appendTournamentMemory(tournamentId: string, review: TournamentReviewResult): void {
  const p = ensureFile();
  const entry = [
    `## Tournoi ${tournamentId} — ${review.tournamentVerdict}`,
    review.summary,
    review.pivotHand ? `- Main pivot #${review.pivotHand.hand_number}: ${review.pivotHand.description}` : null,
    review.lessons.length > 0 ? `- Leçons: ${review.lessons.join(' · ')}` : null,
    `_(saved ${new Date().toISOString()})_`,
    ''
  ]
    .filter(Boolean)
    .join('\n');
  prepend(p, entry + '\n');
}

export function appendHandMemory(handId: string, review: HandReviewResult): void {
  if (review.verdict === 'okay') return; // skip noise
  const p = ensureFile();
  const entry = [
    `## Main ${handId} — ${review.verdict}`,
    review.overall,
    review.lessons.length > 0 ? `- ${review.lessons.join(' · ')}` : null,
    `_(saved ${new Date().toISOString()})_`,
    ''
  ]
    .filter(Boolean)
    .join('\n');
  prepend(p, entry + '\n');
}

export function readMemoryExcerpt(maxChars: number = 4000): string {
  const p = ensureFile();
  const content = readFileSync(p, 'utf-8');
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + '\n\n_[…tronqué]_';
}

function prepend(filePath: string, text: string): void {
  const existing = readFileSync(filePath, 'utf-8');
  const headerEnd = existing.indexOf('---\n');
  if (headerEnd === -1) {
    appendFileSync(filePath, text);
    return;
  }
  const before = existing.slice(0, headerEnd + 4);
  const after = existing.slice(headerEnd + 4);
  writeFileSync(filePath, before + '\n' + text + after);
}
