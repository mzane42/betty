import type { ReactNode } from 'react';
import type { SortDir } from '../lib/use-table.js';

interface Props {
  label: ReactNode;
  sortKey: string;
  activeKey: string | null;
  dir: SortDir;
  onClick: (key: string) => void;
  numeric?: boolean;
}

export function SortHeader({ label, sortKey, activeKey, dir, onClick, numeric }: Props): JSX.Element {
  const active = activeKey === sortKey;
  const arrow = !active ? '↕' : dir === 'desc' ? '↓' : '↑';
  return (
    <th className={`${numeric ? 'num' : ''} sortable ${active ? 'sort-active' : ''}`} onClick={() => onClick(sortKey)}>
      <span className="sort-label">{label}</span>
      <span className={`sort-arrow ${active ? 'active' : ''}`}>{arrow}</span>
    </th>
  );
}

interface SearchProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function SearchBox({ value, onChange, placeholder = 'Filtrer…' }: SearchProps): JSX.Element {
  return (
    <div className="search-box">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button className="search-clear" onClick={() => onChange('')} aria-label="Effacer">
          ✕
        </button>
      )}
    </div>
  );
}
