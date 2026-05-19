/**
 * Reddit ingest — pulls fresh posts from `r/sportsbook` and `r/tennis` filtered
 * by Roland Garros keywords, then scores tipster consensus per match.
 *
 * Anonymous JSON endpoint (no OAuth): `https://www.reddit.com/r/SUBREDDIT/new.json`.
 * Rate limit ≈ 1 req / 2s for anonymous reads. We use a User-Agent string per
 * Reddit's policy.
 *
 * Output: a count of aligned posts per (matchId, selection) tuple. The
 * cross-info scorer treats >=3 aligned tipsters as a meaningful signal.
 *
 * MVP scope: text-match on player surnames + bet verbs ("backing", "fade",
 * "lock", "+EV"). Real-world this would benefit from LLM classification of
 * each post, but we defer that to v2.
 */

const REDDIT_USER_AGENT = 'PokerCoachTennis/0.1 (post-session analytics, no automation)';

export interface RedditPost {
  title: string;
  selftext: string;
  created_utc: number;
  permalink: string;
  subreddit: string;
}

export async function fetchSubreddit(
  subreddit: string,
  limit = 50
): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=${limit}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': REDDIT_USER_AGENT }
  });
  if (!res.ok) {
    throw new Error(`Reddit fetch failed ${res.status}: ${url}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  const children = (json?.data?.children ?? []) as Array<{ data: RedditPost }>;
  return children.map((c) => c.data);
}

export interface TipsterCount {
  /** Number of posts that "back" the player (positive sentiment + selection). */
  alignedCount: number;
  /** Number of posts that "fade" / bet against. Subtracts from alignment. */
  fadeCount: number;
  /** Permalinks for the supporting posts (for audit). */
  evidence: string[];
}

const BACK_KEYWORDS = ['back', 'backing', 'lock', 'love', '+ev', 'value', 'fire', 'bang'];
const FADE_KEYWORDS = ['fade', 'against', 'avoid', 'trap', 'overvalued', 'public'];

export function scoreTipsterPosts(
  posts: RedditPost[],
  playerSurname: string,
  oppSurname: string
): TipsterCount {
  const result: TipsterCount = { alignedCount: 0, fadeCount: 0, evidence: [] };
  const playerLower = playerSurname.toLowerCase();
  const oppLower = oppSurname.toLowerCase();

  for (const post of posts) {
    const text = `${post.title} ${post.selftext}`.toLowerCase();
    if (!text.includes(playerLower) && !text.includes(oppLower)) continue;

    const mentionsPlayer = text.includes(playerLower);
    const mentionsOpp = text.includes(oppLower);
    const hasBackVerb = BACK_KEYWORDS.some((k) => text.includes(k));
    const hasFadeVerb = FADE_KEYWORDS.some((k) => text.includes(k));

    // Heuristic: same post mentions our player + back verb → aligned.
    // Mentions opponent + back verb (against us) → fade signal.
    if (mentionsPlayer && hasBackVerb && !hasFadeVerb) {
      result.alignedCount++;
      result.evidence.push(post.permalink);
    } else if (mentionsPlayer && hasFadeVerb) {
      result.fadeCount++;
    } else if (mentionsOpp && hasBackVerb) {
      result.fadeCount++;
    }
  }
  return result;
}

/**
 * Aggregate across all relevant subreddits. Returns net aligned count (aligned − fade).
 * Caller passes the count straight to `CrossInfoInput.tipsterAlignedCount` — fewer
 * than 3 net-aligned tipsters muted by the scorer per design.
 */
export async function ingestTipsterCount(
  playerSurname: string,
  oppSurname: string,
  subreddits: string[] = ['sportsbook', 'tennis']
): Promise<TipsterCount> {
  const combined: TipsterCount = { alignedCount: 0, fadeCount: 0, evidence: [] };
  for (const sub of subreddits) {
    try {
      const posts = await fetchSubreddit(sub);
      const part = scoreTipsterPosts(posts, playerSurname, oppSurname);
      combined.alignedCount += part.alignedCount;
      combined.fadeCount += part.fadeCount;
      combined.evidence.push(...part.evidence);
      // Sleep ~2s between calls to respect anonymous rate limit.
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[reddit] subreddit ${sub} failed:`, (err as Error).message);
    }
  }
  return combined;
}
