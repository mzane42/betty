import { spawn } from 'node:child_process';
import type {
  HandReviewResult,
  HandVerdict,
  KeyMoment,
  SessionPattern,
  SessionReviewResult,
  SessionVerdict
} from './review-types.js';

const CLAUDE_BIN = process.env.POKER_CLAUDE_BIN || '/Users/bubblz/.nvm/versions/node/v23.3.0/bin/claude';
const DEFAULT_TIMEOUT_MS = 180_000;

export interface ClaudeReviewOptions {
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
  model?: string;
}

/**
 * Invoke `claude -p` with the given system prompt and user prompt. Returns the raw text response.
 * Uses execFile semantics (no shell), arguments are passed as an array.
 */
export async function invokeClaude(opts: ClaudeReviewOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--dangerously-skip-permissions',
      '--model',
      opts.model ?? 'sonnet',
      '--append-system-prompt',
      opts.systemPrompt,
      '--output-format',
      'text'
    ];

    console.log('[claude-reviewer] spawning', CLAUDE_BIN, 'with', opts.userPrompt.length, 'chars');
    const child = spawn(CLAUDE_BIN, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, HOME: process.env.HOME ?? '/Users/bubblz' }
    });

    let stdout = '';
    let stderr = '';
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Claude CLI timed out after ${timeoutMs}ms. stderr: ${stderr.slice(0, 500)}`));
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      console.error('[claude-reviewer:stderr]', d.toString());
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      console.error('[claude-reviewer:error]', err);
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}. Path: ${CLAUDE_BIN}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      console.log('[claude-reviewer] exited code=', code, 'stdout len=', stdout.length);
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}. stderr: ${stderr.slice(0, 500)}`));
        return;
      }
      resolve(stdout.trim());
    });

    child.stdin.write(opts.userPrompt);
    child.stdin.end();
  });
}

export async function reviewHand(
  systemPrompt: string,
  handText: string
): Promise<HandReviewResult> {
  const raw = await invokeClaude({
    systemPrompt,
    userPrompt: `Review this hand and respond ONLY with a JSON object as specified.\n\n${handText}`
  });

  const json = extractJson(raw);
  return {
    verdict: (json['verdict'] as HandVerdict) ?? 'okay',
    overall: (json['overall'] as string) ?? '',
    keyMoments: (json['key_moments'] as KeyMoment[]) ?? [],
    alternativeLine: (json['alternative_line'] as string) ?? '',
    lessons: (json['lessons'] as string[]) ?? [],
    rawResponse: raw
  };
}

export async function reviewSession(
  systemPrompt: string,
  sessionText: string
): Promise<SessionReviewResult> {
  const raw = await invokeClaude({
    systemPrompt,
    userPrompt: `Review this session and respond ONLY with a JSON object as specified.\n\n${sessionText}`,
    timeoutMs: 240_000
  });

  const json = extractJson(raw);
  return {
    sessionVerdict: (json['session_verdict'] as SessionVerdict) ?? 'even',
    summary: (json['summary'] as string) ?? '',
    patterns: (json['patterns'] as SessionPattern[]) ?? [],
    biggestMistake: (json['biggest_mistake'] as { handId: string; description: string } | null) ?? null,
    biggestWin: (json['biggest_win'] as { handId: string; description: string } | null) ?? null,
    lessons: (json['lessons'] as string[]) ?? [],
    nextSessionFocus: (json['next_session_focus'] as string) ?? '',
    rawResponse: raw
  };
}

function extractJson(text: string): Record<string, unknown> {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1]! : text;
  // Find first { and last }
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object found in Claude response: ${text.slice(0, 200)}`);
  }
  const candidate = body.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Failed to parse JSON response: ${(err as Error).message}\n${candidate.slice(0, 200)}`);
  }
}
