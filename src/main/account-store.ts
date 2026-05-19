import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const STORE_PATH = join(homedir(), '.poker-coach', 'settings.json');
const DEFAULT_ACCOUNT = 'mzane42';

interface Settings {
  activeAccount: string;
  goalAnnualNet?: number;
  stopLossDaily?: number;
}

let cache: Settings | null = null;

function load(): Settings {
  if (cache) return cache;
  try {
    if (existsSync(STORE_PATH)) {
      cache = JSON.parse(readFileSync(STORE_PATH, 'utf-8')) as Settings;
      if (!cache.activeAccount) cache.activeAccount = DEFAULT_ACCOUNT;
      return cache;
    }
  } catch (err) {
    console.error('settings load failed', err);
  }
  cache = { activeAccount: DEFAULT_ACCOUNT };
  return cache;
}

function save(s: Settings): void {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(s, null, 2), 'utf-8');
  cache = s;
}

export function getActiveAccount(): string {
  return load().activeAccount;
}

export function setActiveAccount(account: string): void {
  const s = load();
  s.activeAccount = account;
  save(s);
}

export function getSettings(): Settings {
  return { ...load() };
}

export function updateSettings(partial: Partial<Settings>): Settings {
  const s = { ...load(), ...partial };
  save(s);
  return s;
}
