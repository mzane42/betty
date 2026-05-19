/**
 * Unibet deep-link builder.
 *
 * Real match URLs look like:
 *   https://www.unibet.fr/paris-tennis/atp/roland-garros-h/3349644/g-bueno-vs-v-sachko
 *
 * The numeric segment is Unibet's internal event id — not exposed by The Odds
 * API, and slug-only URLs without it return 404 on every match we tried. So
 * the deep-link export below is the tournament landing page; the UI pairs it
 * with a clipboard copy of "P1 vs P2" so the user can Cmd+F to the match.
 *
 * Tournament slug map is hand-curated against the live Unibet site. Add
 * entries as we encounter new tournaments in the wild.
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

