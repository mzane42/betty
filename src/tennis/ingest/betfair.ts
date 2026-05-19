/**
 * Betfair Exchange volume signal.
 *
 * Implementation strategy:
 *   - Public Betfair Exchange data is behind an app key (free tier exists but
 *     requires registration). For MVP we expose a clean interface that accepts
 *     a `(back_volume, lay_volume)` tuple from any source and normalizes to a
 *     directional volume in [-1, 1].
 *   - Daemons that integrate with the real Betfair API populate the inputs;
 *     until then, the cross-info scorer treats Betfair signal as null and
 *     redistributes its weight.
 *
 * Normalization:
 *   net = back - lay
 *   total = back + lay
 *   directional = total > 0 ? net / total : 0  →  [-1, 1]
 *   Positive = market is buying our selection.
 */

export interface BetfairVolumeInput {
  /** EUR volume staked backing the selection. */
  backVolume: number;
  /** EUR volume staked laying (betting against) the selection. */
  layVolume: number;
}

export function directionalVolume(input: BetfairVolumeInput): number {
  const back = Math.max(0, input.backVolume);
  const lay = Math.max(0, input.layVolume);
  const total = back + lay;
  if (total <= 0) return 0;
  return (back - lay) / total;
}

/**
 * Placeholder for the real Betfair API integration.
 * Returns null so the cross-info scorer treats Betfair as inactive.
 */
export async function fetchBetfairVolume(
  _matchId: string,
  _selection: string
): Promise<number | null> {
  if (!process.env.BETFAIR_APP_KEY || !process.env.BETFAIR_SESSION_TOKEN) {
    return null;
  }
  // TODO: implement real Betfair Exchange `listMarketBook` call with the
  // PRICES_INCL_DEPTH price projection. Requires logged-in session.
  // See: https://developer.betfair.com/en/sports-api-docs/exchange-api/listmarketbook/
  return null;
}
