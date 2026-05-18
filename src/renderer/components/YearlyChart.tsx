import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { YearlyBankroll } from '../../types/bankroll.js';

interface Props {
  data: YearlyBankroll[];
}

export function YearlyChart({ data }: Props): JSX.Element {
  return (
    <div className="card">
      <h3 className="card-title">Yearly net</h3>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" />
            <XAxis dataKey="year" stroke="#8b93a7" tick={{ fill: '#8b93a7', fontSize: 12 }} />
            <YAxis stroke="#8b93a7" tick={{ fill: '#8b93a7', fontSize: 12 }} tickFormatter={(v) => `${v}€`} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              contentStyle={{ background: '#1e2230', border: '1px solid #2a2f3d', borderRadius: 8 }}
              labelStyle={{ color: '#e6e9ef' }}
              formatter={(value: number) => [`${value.toFixed(2)}€`, 'Net']}
            />
            <Bar dataKey="net">
              {data.map((entry, idx) => (
                <Cell key={`cell-${idx}`} fill={entry.net >= 0 ? '#4ade80' : '#f87171'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
