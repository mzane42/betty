import { useState } from 'react';
import { pokerApi } from '../api.js';
import { Icon } from './Icon.js';

interface Props {
  matchId: string;
  label?: string;
  compact?: boolean;
}

const cache = new Map<string, { guess: string; fallback: string }>();

export function UnibetLink({ matchId, label, compact = false }: Props): JSX.Element {
  const [busy, setBusy] = useState(false);

  async function open(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      let urls = cache.get(matchId);
      if (!urls) {
        urls = await pokerApi.tennisUnibetUrl(matchId);
        cache.set(matchId, urls);
      }
      // Tournament page is the reliable target. Match-slug guess gets opened
      // in a second tab so the user can see if it lands; if it 404s they
      // already have the tournament page tab to work from.
      window.open(urls.guess, '_blank', 'noopener,noreferrer');
      window.open(urls.fallback, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className={`unibet-link ${compact ? 'compact' : ''}`}
      onClick={() => void open()}
      title="Ouvre la page tournoi Unibet + tentative deep-link match"
      disabled={busy}
    >
      <Icon.ExternalLink size={compact ? 12 : 14} />
      {label && <span>{label}</span>}
    </button>
  );
}
