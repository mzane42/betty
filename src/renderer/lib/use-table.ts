import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

export interface TableOptions<T> {
  defaultSort?: { key: string; dir: SortDir };
  getValue?: (row: T, key: string) => string | number | null | undefined;
  searchFn?: (row: T, query: string) => boolean;
}

export interface TableState<T> {
  rows: T[];
  sortKey: string | null;
  sortDir: SortDir;
  toggleSort: (key: string) => void;
  search: string;
  setSearch: (q: string) => void;
}

export function useTable<T>(allRows: T[], opts: TableOptions<T> = {}): TableState<T> {
  const [sortKey, setSortKey] = useState<string | null>(opts.defaultSort?.key ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(opts.defaultSort?.dir ?? 'desc');
  const [search, setSearch] = useState('');

  function toggleSort(key: string): void {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('desc');
      return;
    }
    setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !opts.searchFn) return allRows;
    return allRows.filter((r) => opts.searchFn!(r, q));
  }, [allRows, search, opts.searchFn]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const accessor = opts.getValue ?? ((r: T, k: string) => (r as unknown as Record<string, unknown>)[k] as string | number | null);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = accessor(a, sortKey);
      const vb = accessor(b, sortKey);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filtered, sortKey, sortDir, opts.getValue]);

  return { rows: sorted, sortKey, sortDir, toggleSort, search, setSearch };
}
