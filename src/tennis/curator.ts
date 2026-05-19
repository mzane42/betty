/**
 * Daily curator pass — takes every PLAY+STRONG pick generated today across
 * tournaments, asks Claude to rank the top 3-6, and emits a single ordered
 * "tonight's plays" list with FR rationale.
 *
 * Output is persisted on each pick (tennis_picks.claude_review_json already
 * holds the per-pick review; the curator selection is stored separately at
 * ~/.poker-coach/cache/curator/<YYYY-MM-DD>.json so the UI can read the
 * ordering without recomputing).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '../db/database.js';
import { invokeClaude } from '../reviewer/claude-reviewer.js';
import { pushTelegramMessage } from './telegram-bot.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CURATOR_CACHE_DIR = join(homedir(), '.poker-coach', 'cache', 'curator');

export interface CuratorSelectedPick {
  pick_id: string;
  rank: number;
  confidence: 'high' | 'medium';
  tldr: string;
  why: string;
}

export interface CuratorSkippedPick {
  pick_id: string;
  reason: string;
}

export interface CuratorOutput {
  selected_picks: CuratorSelectedPick[];
  skipped_picks: CuratorSkippedPick[];
  daily_message: string;
  generated_at: string;
}

export async function runCurator(
  db: Database,
  options: { dateIso?: string; minVerdict?: 'STRONG' | 'PLAY'; pushTelegram?: boolean } = {}
): Promise<CuratorOutput> {
  const dateIso = options.dateIso ?? new Date().toISOString().slice(0, 10);
  const minVerdict = options.minVerdict ?? 'PLAY';

  const candidates = db
    .prepare(
      `SELECT p.*, m.tournament, m.round, m.surface, m.scheduled_at,
              m.player1_id, m.player2_id,
              p1.name as p1_name, p2.name as p2_name
       FROM tennis_picks p
       JOIN tennis_matches m ON m.match_id = p.match_id
       LEFT JOIN tennis_players p1 ON p1.player_id = m.player1_id
       LEFT JOIN tennis_players p2 ON p2.player_id = m.player2_id
       WHERE DATE(m.scheduled_at) = ?
         AND p.verdict IN (${minVerdict === 'STRONG' ? "'STRONG'" : "'STRONG', 'PLAY'"})
       ORDER BY p.signal_score DESC, p.edge_pct DESC`
    )
    .all(dateIso) as Array<Record<string, unknown>>;

  if (candidates.length === 0) {
    const empty: CuratorOutput = {
      selected_picks: [],
      skipped_picks: [],
      daily_message: "Aucun pick PLAY/STRONG aujourd'hui. Bankroll preservee.",
      generated_at: new Date().toISOString()
    };
    writeCuratorCache(dateIso, empty);
    return empty;
  }

  const input = {
    candidates: candidates.map((c) => ({
      pick_id: c.pick_id,
      match: {
        tournament: c.tournament,
        round: c.round,
        surface: c.surface,
        scheduled_at: c.scheduled_at,
        player1: c.p1_name,
        player2: c.p2_name
      },
      selection: c.selection,
      book_decimal_odds: c.book_decimal_odds,
      best_book: c.best_book,
      model_prob: c.model_prob,
      fair_decimal_odds: c.fair_decimal_odds,
      edge_pct: c.edge_pct,
      signal_score: c.signal_score,
      verdict: c.verdict,
      kelly_stake_pct: c.kelly_stake_pct
    }))
  };

  let parsed: CuratorOutput;
  try {
    const systemPrompt = loadPrompt('tennis-curator.md');
    const raw = await invokeClaude({
      systemPrompt,
      userPrompt: JSON.stringify(input, null, 2),
      timeoutMs: 180_000
    });
    parsed = {
      ...extractCuratorJson(raw),
      generated_at: new Date().toISOString()
    };
  } catch (err) {
    console.error('[curator] Claude pass failed, falling back to top-3 by score:', (err as Error).message);
    parsed = fallbackCurator(candidates);
  }

  writeCuratorCache(dateIso, parsed);

  if (options.pushTelegram && parsed.selected_picks.length > 0) {
    const lines = [
      `Tonight's plays — ${dateIso}`,
      ...parsed.selected_picks.map(
        (p) => `#${p.rank} [${p.confidence.toUpperCase()}] ${p.tldr}`
      ),
      '',
      parsed.daily_message
    ];
    await pushTelegramMessage(lines.join('\n')).catch(() => undefined);
  }

  return parsed;
}

export function readCuratorCache(dateIso: string): CuratorOutput | null {
  const path = join(CURATOR_CACHE_DIR, `${dateIso}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as CuratorOutput;
  } catch {
    return null;
  }
}

function writeCuratorCache(dateIso: string, payload: CuratorOutput): void {
  mkdirSync(CURATOR_CACHE_DIR, { recursive: true });
  writeFileSync(join(CURATOR_CACHE_DIR, `${dateIso}.json`), JSON.stringify(payload, null, 2), 'utf-8');
}

function loadPrompt(name: string): string {
  const candidates = [
    join(__dirname, '../../prompts', name),
    join(__dirname, '../../../prompts', name),
    join(process.cwd(), 'prompts', name)
  ];
  for (const c of candidates) {
    try {
      return readFileSync(c, 'utf-8');
    } catch {
      // try next
    }
  }
  throw new Error(`Prompt file not found: ${name}`);
}

function extractCuratorJson(raw: string): Omit<CuratorOutput, 'generated_at'> {
  const trimmed = raw.trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fenced = /```json\s*\n([\s\S]*?)\n```/m.exec(trimmed);
    if (fenced) {
      parsed = JSON.parse(fenced[1]) as Record<string, unknown>;
    } else {
      const open = trimmed.indexOf('{');
      const close = trimmed.lastIndexOf('}');
      if (open < 0 || close < open) {
        throw new Error('Curator response missing JSON');
      }
      parsed = JSON.parse(trimmed.slice(open, close + 1)) as Record<string, unknown>;
    }
  }
  return {
    selected_picks: (parsed.selected_picks as CuratorSelectedPick[]) ?? [],
    skipped_picks: (parsed.skipped_picks as CuratorSkippedPick[]) ?? [],
    daily_message: (parsed.daily_message as string) ?? ''
  };
}

function fallbackCurator(candidates: Array<Record<string, unknown>>): CuratorOutput {
  const top = candidates.slice(0, 3);
  return {
    selected_picks: top.map((c, i) => ({
      pick_id: c.pick_id as string,
      rank: i + 1,
      confidence: (c.verdict as string) === 'STRONG' ? 'high' : 'medium',
      tldr: `${c.selection} @${(c.book_decimal_odds as number).toFixed(2)} sur ${c.best_book} (${c.tournament}, ${c.round}) — edge ${((c.edge_pct as number) * 100).toFixed(1)}%`,
      why: 'Curator Claude indisponible — selection par score signaux decroissant.'
    })),
    skipped_picks: candidates.slice(3).map((c) => ({
      pick_id: c.pick_id as string,
      reason: 'Hors top 3 par score signaux (mode fallback).'
    })),
    daily_message: `${top.length} picks selectionnes en mode fallback (Claude indisponible).`,
    generated_at: new Date().toISOString()
  };
}
