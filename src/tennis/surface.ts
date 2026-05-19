/**
 * Court surface inference from The Odds API `sport_key` slugs.
 *
 * The Odds API does not expose surface metadata. We hard-code a mapping from
 * known ATP/WTA tournament slugs to surface. Everything outside the explicit
 * lists defaults to hard — correct for most tour events (most weeks are hard).
 *
 * Calendar reference: 2026 ATP + WTA. Add new tournaments here as we encounter
 * them in the wild.
 */

export type Surface = 'clay' | 'hard' | 'grass';

// Substrings to detect in sport_key or tournament slug. Lowercase, order
// irrelevant. Add aliases when slugs diverge across years (e.g.
// "estoril_open" vs "millennium_estoril").
const CLAY_KEYWORDS = [
  'french_open',
  'roland',
  'rome',
  'italian',
  'madrid',
  'mutua_madrid',
  'monte_carlo',
  'montecarlo',
  'barcelona',
  'munich',
  'bmw_open',
  'hamburg',
  'geneva',
  'estoril',
  'houston',
  'marrakech',
  'casablanca',
  'bastad',
  'umag',
  'gstaad',
  'kitzbuhel',
  'kitzbuehel',
  'cordoba',
  'rio',
  'rio_open',
  'buenos_aires',
  'santiago',
  'charleston',
  'stuttgart_wta',
  'strasbourg',
  'rabat',
  'palermo',
  'lausanne',
  'iasi',
  'cluj',
  'parma',
  'belgrade',
  'prague_clay',
  'merida_clay'
];

const GRASS_KEYWORDS = [
  'wimbledon',
  'queens',
  'queen_s',
  'queen’s', // typographic apostrophe variant
  'halle',
  'eastbourne',
  'newport',
  'mallorca',
  'hertogenbosch',
  's_hertogenbosch',
  'stuttgart_atp', // ATP Stuttgart switched to grass (Boss Open)
  'birmingham',
  'nottingham',
  'ilkley',
  'libema_open'
];

export function inferSurface(sportKeyOrTournament: string): Surface {
  const k = sportKeyOrTournament.toLowerCase();
  if (CLAY_KEYWORDS.some((kw) => k.includes(kw))) return 'clay';
  if (GRASS_KEYWORDS.some((kw) => k.includes(kw))) return 'grass';
  return 'hard';
}
