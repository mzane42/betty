import type { ParsedTournamentSummary } from '../types/tournament.js';

const HEADER_RE = /^Winamax Poker - Tournament summary : (.+?)\((\d+)\)(?: - Late Registration)?$/;

/**
 * Parse a Winamax tournament summary file (the `*_summary.txt` variant).
 * Handles the malformed concatenated key like `Mode : sngType : sitngo`.
 */
export function parseSummaryFile(content: string): ParsedTournamentSummary | null {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return null;

  const header = lines[0]!.match(HEADER_RE);
  if (!header) return null;

  const tournamentName = header[1]!.trim();
  const tournamentId = header[2]!;

  const fields = parseKeyValueLines(lines.slice(1));

  const buyInLine = fields['Buy-In'] ?? '0€ + 0€';
  const { buyIn, rake } = parseBuyIn(buyInLine);

  const registeredPlayers = toInt(fields['Registered players']);
  const mode = fields['Mode'] ?? '';
  const type = fields['Type'] ?? '';
  const speed = fields['Speed'] ?? '';
  const prizepool = toFloatEuros(fields['Prizepool']);

  const startTime = parseStartTime(fields['Tournament started'] ?? '');
  const duration = fields['You played'] ?? null;
  const finishLine = fields['You finished in'] ?? '';
  const finishPosition = parseFinishPosition(finishLine);
  const winnings = parseWinnings(fields['You won'] ?? null);
  const playerName = fields['Player'] ?? '';

  return {
    tournamentId,
    tournamentName,
    playerName,
    buyIn,
    rake,
    registeredPlayers,
    mode,
    type,
    speed,
    prizepool,
    startTime,
    duration,
    finishPosition,
    winnings
  };
}

function parseKeyValueLines(lines: string[]): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const raw of lines) {
    // Handle special "You finished in 3rd place" and "You won 5.40€" non-colon lines
    const youFinishMatch = raw.match(/^You finished in (.+)$/);
    if (youFinishMatch) {
      fields['You finished in'] = youFinishMatch[1]!;
      continue;
    }
    const youWonMatch = raw.match(/^You won (.+)$/);
    if (youWonMatch) {
      fields['You won'] = youWonMatch[1]!;
      continue;
    }
    const youPlayedMatch = raw.match(/^You played (.+)$/);
    if (youPlayedMatch) {
      fields['You played'] = youPlayedMatch[1]!;
      continue;
    }
    const tournamentStartedMatch = raw.match(/^Tournament started (.+)$/);
    if (tournamentStartedMatch) {
      fields['Tournament started'] = tournamentStartedMatch[1]!;
      continue;
    }

    // Handle malformed concatenated fields: split on " : " runs
    const segments = raw.split(/\s+:\s+/);
    // Pair them up as key-value
    if (segments.length >= 2) {
      for (let i = 0; i < segments.length - 1; i += 2) {
        const key = segments[i]!.trim();
        let value = segments[i + 1] ?? '';
        // If there are subsequent segments, they may belong to a different key (malformed)
        // Heuristic: detect if next-next looks like another known key
        if (i + 2 < segments.length) {
          const next = segments[i + 2];
          if (next && KNOWN_KEYS.has(next.split(/\s+/)[0] ?? '')) {
            // continue, leave value as-is
          }
        }
        // If value starts with what looks like another known key, split it off
        const valueAndKey = value.match(/^(\S.*?)([A-Z][a-z]+(?: [A-Z][a-z]+)*)$/);
        if (valueAndKey && KNOWN_KEYS.has(valueAndKey[2]!)) {
          fields[key] = valueAndKey[1]!.trim();
          // Inject the trailing key for next iteration (as a degenerate pair)
          segments.splice(i + 2, 0, valueAndKey[2]!);
          continue;
        }
        fields[key] = value.trim();
      }
    }
  }
  return fields;
}

const KNOWN_KEYS = new Set([
  'Player',
  'Buy-In',
  'Registered players',
  'Mode',
  'Type',
  'Speed',
  'Flight ID',
  'Levels',
  'Prizepool'
]);

function parseBuyIn(s: string): { buyIn: number; rake: number } {
  const m = s.match(/(\d+(?:\.\d+)?)\s*€?\s*\+\s*(\d+(?:\.\d+)?)\s*€?/);
  if (!m) return { buyIn: 0, rake: 0 };
  return { buyIn: parseFloat(m[1]!), rake: parseFloat(m[2]!) };
}

function toInt(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function toFloatEuros(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return parseFloat(m[1]!);
}

function parseStartTime(s: string): string {
  const m = s.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return s;
  const [, y, mo, d, h, mi, sec] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${sec}.000Z`;
}

function parseFinishPosition(s: string): number {
  const m = s.match(/^(\d+)(st|nd|rd|th)/);
  if (!m) return 0;
  return parseInt(m[1]!, 10);
}

function parseWinnings(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return parseFloat(m[1]!);
}
