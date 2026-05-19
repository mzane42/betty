import { useState } from 'react';
import { pokerApi, type TennisBetRow } from '../api.js';
import { toast } from '../lib/toast.js';

interface Props {
  bet: TennisBetRow;
  onSettled: () => void | Promise<void>;
}

export function SettleControls({ bet, onSettled }: Props): JSX.Element {
  const [closingOdds, setClosingOdds] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function settle(result: 'won' | 'lost' | 'void'): Promise<void> {
    setBusy(true);
    try {
      // P&L math: won = stake * (odds-1); lost = -stake; void = 0
      let pnl = 0;
      if (result === 'won') pnl = bet.stakeEur * (bet.decimalOdds - 1);
      else if (result === 'lost') pnl = -bet.stakeEur;
      const closing = closingOdds.trim() === '' ? null : parseFloat(closingOdds);
      await pokerApi.tennisSettleBet(bet.betId, result, pnl, closing);
      toast.success(`Bet ${result} — P&L ${pnl.toFixed(2)}€`);
      await onSettled();
    } catch (err) {
      toast.error(`Erreur settle: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settle-controls">
      <input
        type="number"
        step={0.01}
        placeholder="Cote close"
        value={closingOdds}
        onChange={(e) => setClosingOdds(e.target.value)}
        title="Cote de clôture (optionnel — sert au calcul CLV)"
      />
      <button disabled={busy} onClick={() => void settle('won')} className="settle-won">
        ✓
      </button>
      <button disabled={busy} onClick={() => void settle('lost')} className="settle-lost">
        ✗
      </button>
      <button disabled={busy} onClick={() => void settle('void')} className="settle-void">
        ⊘
      </button>
    </div>
  );
}
