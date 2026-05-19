import { useState } from 'react';
import { pokerApi } from '../api.js';
import { CardGroup } from '../components/PlayingCard.js';
import { PositionBadge } from '../components/PositionBadge.js';
import { ProfitBadge } from '../components/ProfitBadge.js';
import { coachBus } from '../lib/coach-bus.js';
import { Icon } from '../components/Icon.js';

interface Row {
  hand_id: string;
  hero_position: string | null;
  hero_cards: string | null;
  big_blind: number;
  board: string | null;
  hero_invested: number;
  hero_won: number;
  total_pot: number;
  hero_net: number;
  played_at: string;
  hero_equity_river: number | null;
  session_date: string;
  tournament_id: string;
  ai_verdict: string | null;
}

export function HandSearch(): JSX.Element {
  const [results, setResults] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState('');
  const [netSign, setNetSign] = useState<'any' | 'positive' | 'negative'>('any');
  const [aiVerdict, setAiVerdict] = useState('');
  const [minPot, setMinPot] = useState('');
  const [maxBb, setMaxBb] = useState('');
  const [minEquity, setMinEquity] = useState('');
  const [maxEquity, setMaxEquity] = useState('');
  const [cardPattern, setCardPattern] = useState('');
  const [boardPattern, setBoardPattern] = useState('');

  async function search(): Promise<void> {
    setLoading(true);
    const filters: Record<string, unknown> = { limit: 200 };
    if (position) filters.position = position;
    if (netSign !== 'any') filters.netSign = netSign;
    if (aiVerdict) filters.aiVerdict = aiVerdict;
    if (minPot) filters.minPot = Number(minPot);
    if (maxBb) filters.maxBb = Number(maxBb);
    if (minEquity) filters.minEquity = Number(minEquity);
    if (maxEquity) filters.maxEquity = Number(maxEquity);
    if (cardPattern) filters.cardPattern = cardPattern;
    if (boardPattern) filters.boardPattern = boardPattern;
    const rows = await pokerApi.searchHands(filters);
    setResults(rows);
    setLoading(false);
  }

  function reset(): void {
    setPosition('');
    setNetSign('any');
    setAiVerdict('');
    setMinPot('');
    setMaxBb('');
    setMinEquity('');
    setMaxEquity('');
    setCardPattern('');
    setBoardPattern('');
    setResults([]);
  }

  return (
    <div className="hand-search-page">
      <h2>Recherche de mains</h2>
      <p className="muted">Filtre toute la DB pour trouver des situations spécifiques.</p>

      <div className="search-filters card">
        <div className="filter-grid">
          <Field label="Position">
            <select value={position} onChange={(e) => setPosition(e.target.value)}>
              <option value="">— toutes —</option>
              <option value="SB">SB</option>
              <option value="BB">BB</option>
              <option value="BTN">BTN</option>
              <option value="CO">CO</option>
              <option value="HJ">HJ</option>
              <option value="MP">MP</option>
              <option value="UTG">UTG</option>
            </select>
          </Field>
          <Field label="Résultat">
            <select value={netSign} onChange={(e) => setNetSign(e.target.value as typeof netSign)}>
              <option value="any">tous</option>
              <option value="positive">gagnées</option>
              <option value="negative">perdues</option>
            </select>
          </Field>
          <Field label="Verdict IA">
            <select value={aiVerdict} onChange={(e) => setAiVerdict(e.target.value)}>
              <option value="">— tous —</option>
              <option value="good">Bon</option>
              <option value="okay">OK</option>
              <option value="mistake">Erreur</option>
              <option value="blunder">Blunder</option>
            </select>
          </Field>
          <Field label="Pot min (jetons)">
            <input type="number" value={minPot} onChange={(e) => setMinPot(e.target.value)} placeholder="ex: 500" />
          </Field>
          <Field label="Investi max (BB)">
            <input type="number" value={maxBb} onChange={(e) => setMaxBb(e.target.value)} placeholder="ex: 12" />
          </Field>
          <Field label="Équity min (%)">
            <input type="number" value={minEquity} onChange={(e) => setMinEquity(e.target.value)} placeholder="0-100" />
          </Field>
          <Field label="Équity max (%)">
            <input type="number" value={maxEquity} onChange={(e) => setMaxEquity(e.target.value)} placeholder="0-100" />
          </Field>
          <Field label="Cartes (motif)">
            <input value={cardPattern} onChange={(e) => setCardPattern(e.target.value)} placeholder='ex: "Ah"' />
          </Field>
          <Field label="Board (motif)">
            <input value={boardPattern} onChange={(e) => setBoardPattern(e.target.value)} placeholder='ex: "Kc"' />
          </Field>
        </div>
        <div className="filter-actions">
          <button className="sparkle-btn" onClick={search} disabled={loading}>
            {loading ? 'Recherche…' : <><Icon.Search size={14} /> Chercher</>}
          </button>
          <button className="ohmy-btn ghost" onClick={reset}>
            Reset
          </button>
          {results.length > 0 && (
            <button
              className="coach-link-btn"
              onClick={() =>
                coachBus.send(
                  `J'ai isolé ${results.length} mains avec ces filtres: position=${position || 'toutes'}, netSign=${netSign}, verdict=${aiVerdict || 'tous'}. Analyse le pattern commun et donne moi 1 conseil global.`
                )
              }
            >
              <Icon.Sparkles size={12} /> Analyser pattern avec coach
            </button>
          )}
        </div>
      </div>

      {results.length > 0 && (
        <div className="card">
          <h3 className="card-title">{results.length} résultats</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Pos</th>
                <th>Cartes</th>
                <th>Board</th>
                <th className="num">Pot</th>
                <th className="num">Net</th>
                <th>Équity</th>
                <th>IA</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const cards = r.hero_cards ? (JSON.parse(r.hero_cards) as string[]) : null;
                const board = r.board ? (JSON.parse(r.board) as string[]) : [];
                return (
                  <tr key={r.hand_id}>
                    <td>{r.session_date}</td>
                    <td><PositionBadge position={r.hero_position} /></td>
                    <td><CardGroup cards={cards} size="sm" withStrength /></td>
                    <td><CardGroup cards={board} size="sm" /></td>
                    <td className="num">{r.total_pot}</td>
                    <td className="num"><ProfitBadge value={r.hero_net} size="sm" unit="chips" /></td>
                    <td>{r.hero_equity_river != null ? `${r.hero_equity_river.toFixed(0)}%` : '—'}</td>
                    <td>{r.ai_verdict ? <span className={`hand-verdict v-${r.ai_verdict}`}>{r.ai_verdict}</span> : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="filter-field">
      <span className="muted">{label}</span>
      {children}
    </label>
  );
}
