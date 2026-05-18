import type { MonthlyBankroll } from '../../types/bankroll.js';

interface Props {
  data: MonthlyBankroll[];
}

const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

export function MonthlyHeatmap({ data }: Props): JSX.Element {
  if (data.length === 0) {
    return (
      <div className="card">
        <h3 className="card-title">Heatmap mensuelle</h3>
        <div className="muted">Aucune donnée</div>
      </div>
    );
  }

  const years = Array.from(new Set(data.map((d) => d.year))).sort();
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.net)), 1);

  const cellByYearMonth = new Map<string, MonthlyBankroll>();
  for (const d of data) cellByYearMonth.set(`${d.year}-${d.month}`, d);

  return (
    <div className="card">
      <h3 className="card-title">Heatmap mensuelle</h3>
      <div className="heatmap">
        <div className="heatmap-row heatmap-header">
          <div className="heatmap-year-label" />
          {MONTH_NAMES.map((m) => (
            <div key={m} className="heatmap-month-label">
              {m}
            </div>
          ))}
        </div>
        {years.map((year) => (
          <div className="heatmap-row" key={year}>
            <div className="heatmap-year-label">{year}</div>
            {MONTH_NAMES.map((_, idx) => {
              const cell = cellByYearMonth.get(`${year}-${idx + 1}`);
              if (!cell) {
                return <div key={idx} className="heatmap-cell heatmap-empty" title="Pas de jeu" />;
              }
              const intensity = Math.min(1, Math.abs(cell.net) / maxAbs);
              const baseColor = cell.net >= 0 ? '74, 222, 128' : '248, 113, 113';
              return (
                <div
                  key={idx}
                  className="heatmap-cell"
                  style={{ background: `rgba(${baseColor}, ${0.15 + intensity * 0.75})` }}
                  title={`${MONTH_NAMES[idx]} ${year} : ${cell.net.toFixed(2)}€ (${cell.tournamentsPlayed} tournois)`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
