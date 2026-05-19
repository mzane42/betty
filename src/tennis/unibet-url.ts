/**
 * Unibet deep-link builder.
 *
 * Real match URLs look like:
 *   https://www.unibet.fr/paris-tennis/atp/roland-garros-h/3349644/g-bueno-vs-v-sachko
 *
 * The numeric segment is Unibet's internal event id — not exposed by The Odds
 * API. Without it we can't link directly to the bet ticket. Two best-effort
 * fallbacks below:
 *
 *  - `tournamentUrl(tournament, tour)` → tournament landing page (always works
 *     when the tournament slug is known; degrades to /paris-tennis otherwise).
 *  - `matchSlugGuess(...)` → speculative deep link without the numeric id;
 *     Unibet's router may 404 it but worth a try as the visible label is
 *     informative even if the click fails.
 *
 * Tournament slug map below is hand-curated against the live Unibet site.
 * Add entries as we encounter new tournaments in the wild.
 */

type Tour = 'atp' | 'wta';

interface SlugMap {
  atp?: string;
  wta?: string;
}

const TOURNAMENT_SLUGS: Record<string, SlugMap> = {
  french_open: { atp: 'roland-garros-h', wta: 'roland-garros-f' },
  roland_garros_2026: { atp: 'roland-garros-h', wta: 'roland-garros-f' },
  hamburg_open: { atp: 'hamburg-open-h' },
  strasbourg: { wta: 'strasbourg-f' },
  geneva: { atp: 'geneve-h' },
  monte_carlo_masters: { atp: 'monte-carlo-h' },
  rome: { atp: 'rome-h', wta: 'rome-f' },
  italian: { atp: 'rome-h', wta: 'rome-f' },
  madrid: { atp: 'madrid-h', wta: 'madrid-f' },
  mutua_madrid_open: { atp: 'madrid-h', wta: 'madrid-f' },
  barcelona: { atp: 'barcelone-h' },
  munich: { atp: 'munich-h' },
  estoril: { atp: 'estoril-h' },
  marrakech: { atp: 'marrakech-h' },
  houston: { atp: 'houston-h' },
  rabat: { wta: 'rabat-f' },
  wimbledon: { atp: 'wimbledon-h', wta: 'wimbledon-f' },
  queens: { atp: 'queen-s-club-h' },
  halle: { atp: 'halle-h' },
  eastbourne: { atp: 'eastbourne-h', wta: 'eastbourne-f' },
  us_open: { atp: 'us-open-h', wta: 'us-open-f' },
  aus_open: { atp: 'australian-open-h', wta: 'australian-open-f' }
};

const BASE = 'https://www.unibet.fr/paris-tennis';

export function unibetTournamentUrl(tournament: string, tour: Tour): string {
  const map = TOURNAMENT_SLUGS[tournament];
  const slug = map?.[tour];
  if (!slug) return BASE; // degrade to general tennis page
  return `${BASE}/${tour}/${slug}`;
}

/**
 * Speculative match URL — Unibet typically requires its numeric event id, but
 * the slug-only form is still informative for the click target.
 */
export function unibetMatchUrlGuess(
  tournament: string,
  tour: Tour,
  player1Name: string,
  player2Name: string
): string {
  const map = TOURNAMENT_SLUGS[tournament];
  const slug = map?.[tour];
  if (!slug) return BASE;
  const p1 = playerSlug(player1Name);
  const p2 = playerSlug(player2Name);
  return `${BASE}/${tour}/${slug}/${p1}-vs-${p2}`;
}

function playerSlug(name: string): string {
  const parts = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s-]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const initial = parts[0][0];
  return `${initial}-${last}`;
}
