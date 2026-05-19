import { useState } from 'react';
import { btnShoveVerdict, sbShoveVerdict, bbCallVerdict } from '../../nash/nash-3max.js';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

type Mode = 'sb-shove' | 'btn-shove' | 'bb-call';

export function RangeGrid(): JSX.Element {
  const [stackBb, setStackBb] = useState(10);
  const [mode, setMode] = useState<Mode>('sb-shove');

  function code(r: number, c: number): string {
    if (r === c) return RANKS[r]! + RANKS[c]!;
    const high = r < c ? RANKS[r]! : RANKS[c]!;
    const low = r < c ? RANKS[c]! : RANKS[r]!;
    return high + low + (r < c ? 's' : 'o');
  }

  function verdictFor(handCode: string): 'in' | 'marginal' | 'out' {
    if (mode === 'sb-shove') return sbShoveVerdict(handCode, stackBb);
    if (mode === 'btn-shove') return btnShoveVerdict(handCode, stackBb);
    return bbCallVerdict(handCode, stackBb);
  }

  let inCount = 0;
  let marginalCount = 0;
  for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 13; c++) {
      const v = verdictFor(code(r, c));
      if (v === 'in') inCount++;
      else if (v === 'marginal') marginalCount++;
    }
  }

  return (
    <div className="card range-grid-card">
      <h3 className="card-title">Range Nash push/fold</h3>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        Visualise quelles mains tu dois shover/caller selon stack + position en 3-max Expresso.
      </p>
      <div className="range-controls">
        <label className="filter-field">
          <span className="muted">Décision</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="sb-shove">SB shove (heads-up vs BB)</option>
            <option value="btn-shove">BTN shove (3-max)</option>
            <option value="bb-call">BB call vs shove</option>
          </select>
        </label>
        <label className="filter-field">
          <span className="muted">Stack {stackBb} BB</span>
          <input
            type="range"
            min={4}
            max={25}
            step={1}
            value={stackBb}
            onChange={(e) => setStackBb(Number(e.target.value))}
          />
        </label>
        <span className="muted" style={{ fontSize: 11, alignSelf: 'flex-end' }}>
          Range: {((inCount / 169) * 100).toFixed(0)}% (+{((marginalCount / 169) * 100).toFixed(0)}% marginal)
        </span>
      </div>

      <div className="range-grid">
        {RANKS.map((_, r) => (
          <div key={r} className="range-row">
            {RANKS.map((_, c) => {
              const c_ = code(r, c);
              const v = verdictFor(c_);
              return (
                <div key={c} className={`range-cell range-${v}`} title={c_}>
                  {c_}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="range-legend">
        <span><span className="range-cell range-in inline" /> In range</span>
        <span><span className="range-cell range-marginal inline" /> Marginal</span>
        <span><span className="range-cell range-out inline" /> Fold</span>
      </div>
    </div>
  );
}
