import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BankrollPoint } from '../../types/bankroll.js';

interface Props {
  data: BankrollPoint[];
}

export function BankrollChart({ data }: Props): JSX.Element {
  return (
    <div className="card">
      <h3 className="card-title">Bankroll cumulée</h3>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="bankrollGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4ade80" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="bankrollGradientNeg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f87171" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" />
            <XAxis dataKey="date" stroke="#8b93a7" tick={{ fill: '#8b93a7', fontSize: 11 }} />
            <YAxis stroke="#8b93a7" tick={{ fill: '#8b93a7', fontSize: 11 }} tickFormatter={(v) => `${v}€`} />
            <Tooltip
              contentStyle={{ background: '#1e2230', border: '1px solid #2a2f3d', borderRadius: 8 }}
              labelStyle={{ color: '#e6e9ef' }}
              formatter={(value: number, name: string) => [`${value.toFixed(2)}€`, name === 'cumulativeNet' ? 'Cumulé' : 'Session']}
            />
            <Area
              type="monotone"
              dataKey="cumulativeNet"
              stroke={data.length > 0 && data[data.length - 1]!.cumulativeNet >= 0 ? '#4ade80' : '#f87171'}
              strokeWidth={2}
              fill={data.length > 0 && data[data.length - 1]!.cumulativeNet >= 0 ? 'url(#bankrollGradient)' : 'url(#bankrollGradientNeg)'}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
