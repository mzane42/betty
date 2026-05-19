import { useState } from 'react';
import { pokerApi } from '../api.js';
import { Icon } from './Icon.js';
import { toast } from '../lib/toast.js';

interface Props {
  matchId: string;
  label?: string;
  compact?: boolean;
}

const cache = new Map<string, { fallback: string; matchLabel: string }>();

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
      // Unibet's router requires its internal numeric event id; slug-only
      // deep links 404. Open the tournament landing page (always works) and
      // copy the match label to clipboard so the user can Cmd+F to find it
      // fast on the tournament page.
      if (urls.matchLabel) {
        try {
          await navigator.clipboard.writeText(urls.matchLabel);
          toast.success(`Match copié : "${urls.matchLabel}" — Cmd+F sur la page`);
        } catch {
          /* clipboard API may be unavailable; ignore */
        }
      }
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
