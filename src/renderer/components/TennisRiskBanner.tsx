import { useState } from 'react';
import { pokerApi, type TennisRiskGateStatus } from '../api.js';
import { toast } from '../lib/toast.js';
import { Icon } from './Icon.js';

interface Props {
  status: TennisRiskGateStatus;
  onChange: () => void | Promise<void>;
}

export function TennisRiskBanner({ status, onChange }: Props): JSX.Element | null {
  const [busy, setBusy] = useState(false);

  const variant = status.blocked
    ? 'risk-banner-blocked'
    : status.stakeMultiplier < 1
      ? 'risk-banner-warning'
      : 'risk-banner-ok';

  async function handlePause(): Promise<void> {
    setBusy(true);
    try {
      await pokerApi.tennisRiskPause(24);
      toast.success('Picks en pause 24h');
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  async function handleResume(): Promise<void> {
    setBusy(true);
    try {
      await pokerApi.tennisRiskResume();
      toast.success('Picks réactivés');
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`tennis-risk-banner ${variant}`}>
      <div className="risk-banner-text">
        <strong>
          {status.blocked ? (
            <>
              <Icon.Ban size={14} /> Picks bloqués
            </>
          ) : status.stakeMultiplier < 1 ? (
            <>
              <Icon.AlertTriangle size={14} /> Mode demi-mise
            </>
          ) : (
            <>
              <Icon.Check size={14} /> OK
            </>
          )}
        </strong>
        <span className="muted">{status.message}</span>
      </div>
      <div className="risk-banner-actions">
        <span className="muted">
          Bankroll réf : {status.config.bankrollEur}€ · Stop-loss j :{' '}
          {(status.config.dailyStopLossPct * 100).toFixed(1)}% · Take-profit :{' '}
          {(status.config.tournamentTakeProfitPct * 100).toFixed(1)}%
        </span>
        {status.config.pausedUntilIso ? (
          <button disabled={busy} onClick={() => void handleResume()}>
            Réactiver
          </button>
        ) : (
          <button disabled={busy} onClick={() => void handlePause()}>
            Pause 24h
          </button>
        )}
      </div>
    </div>
  );
}
