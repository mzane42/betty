/**
 * Unibet deep-link builder.
 *
 * Real match URLs look like:
 *   https://www.unibet.fr/paris-tennis/atp/roland-garros-h/3349644/g-bueno-vs-v-sachko
 *
 * The numeric segment is Unibet's internal event id — not exposed by The Odds
 * API, and slug-only URLs without it return 404. Tournament-page slugs are
 * also inconsistent (`roland-garros-h` vs `wta-500-strasbourg` vs `stuttgart`),
 * so maintaining a hand-curated map is fragile.
 *
 * We deliberately keep this dumb: open the ATP or WTA tour root listing the
 * current week's tournaments. The user lands on a page that always exists,
 * sees all live matches and tournaments. The UI pairs the open() with a
 * clipboard copy of "P1 vs P2" so a Cmd+F lands the user on the exact match.
 *
 * Grand slams get a known-good direct slug because they're heavy traffic.
 * Everything else falls back to the tour root.
 */

type Tour = 'atp' | 'wta';

interface SlugMap {
  atp?: string;
  wta?: string;
}

const GRAND_SLAM_SLUGS: Record<string, SlugMap> = {
  french_open: { atp: 'roland-garros-h', wta: 'roland-garros-f' },
  roland_garros_2026: { atp: 'roland-garros-h', wta: 'roland-garros-f' },
  wimbledon: { atp: 'wimbledon-h', wta: 'wimbledon-f' },
  us_open: { atp: 'us-open-h', wta: 'us-open-f' },
  aus_open: { atp: 'australian-open-h', wta: 'australian-open-f' }
};

const BASE = 'https://www.unibet.fr/paris-tennis';

export function unibetTournamentUrl(tournament: string, tour: Tour): string {
  const slug = GRAND_SLAM_SLUGS[tournament]?.[tour];
  if (slug) return `${BASE}/${tour}/${slug}`;
  // Tour-root listing (always exists). Lists every active tournament for the
  // week; user Cmd+Fs the copied match label to jump straight to it.
  return `${BASE}/${tour}`;
}

