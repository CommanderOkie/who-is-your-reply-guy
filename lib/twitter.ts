/**
 * Twitter/X authenticated scraper.
 *
 * Uses burner account cookies (TWITTER_COOKIES env var) to make authenticated
 * requests to X's internal GraphQL API — no official API key needed.
 *
 * Features:
 * - Query IDs auto-discovered from X's JS bundles and cached 2h
 * - Results cached 10 min per username
 * - Parallel reply fetching (3 concurrent) for speed
 * - Handles 15 tweets by default
 */

import { queryIdCache, QUERY_ID_TTL } from "./cache";
import { unstable_cache } from "next/cache";

const BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const TWEETS_TO_ANALYZE = 50;  // Deep Accuracy Mode: Enhanced depth for better precision
const CONCURRENCY = 5;           // Optimized for 50-tweet batches to stay under 30s limit

// --- Auto-Heal Load Balancer State ---
const burnedCookies = new Map<string, number>();

export function markCookieBurned(cookie: string) {
  burnedCookies.set(cookie, Date.now());
  console.warn("🔥 Burned cookie auto-identified! Rotating out of pool for 15 minutes.");
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReplyGuy {
  user: string;
  score: number;
  replies: number;
  tweets_replied: number;
  dominance: number;
  loyaltyScore: number;
  badge: string;
  badgeEmoji: string;
  color: string;
}

export interface AnalyzeResult {
  username: string;
  displayName: string;
  avatarUrl: string;
  top_reply_guys: ReplyGuy[];
  total_replies_analyzed: number;
  tweets_analyzed: number;
  disclaimer: string;
  cached?: boolean;
}

export interface ReplyInstance {
  handle: string;
  createdAt: number;
  authorRepliedBack: boolean;
}

// ─── Query ID management ──────────────────────────────────────────────────────

const DEFAULT_IDS = {
  UserByScreenName: "IGgvgiOx4QZndDHuD3x9TQ",
  UserTweets: "x3B_xLqC0yZawOB7WQhaVQ",
  TweetDetail: "rU08O-YiXdr0IZfE7qaUMg",
};

type QueryIds = typeof DEFAULT_IDS;

async function getQueryIds(): Promise<QueryIds> {
  const cached = queryIdCache.get("ids") as QueryIds | null;
  if (cached) return cached;

  let ids = { ...DEFAULT_IDS };
  try {
    const html = await fetch("https://x.com", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(5000),
    }).then((r) => r.text());

    const bundles = [
      ...new Set(
        html.match(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/[a-zA-Z0-9._-]+\.js/g) ?? []
      ),
    ];

    const found: Partial<QueryIds> = {};
    for (const url of bundles.slice(0, 10)) {
      try {
        const js = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(4000),
        }).then((r) => r.text());

        for (const op of Object.keys(ids) as (keyof QueryIds)[]) {
          if (found[op]) continue;
          const m = js.match(new RegExp(`queryId:"([^"]+)",operationName:"${op}"`));
          if (m) found[op] = m[1];
        }
        if (Object.keys(found).length >= Object.keys(ids).length) break;
      } catch { /* skip */ }
    }

    if (Object.keys(found).length >= 2) ids = { ...ids, ...found };
  } catch (e) {
    console.warn("[scraper] Query ID refresh skipped:", (e as Error).message);
  }

  queryIdCache.set("ids", ids, QUERY_ID_TTL);
  console.log("[scraper] Query IDs:", ids);
  return ids;
}

// ─── Headers ─────────────────────────────────────────────────────────────────

function getServerCookies(): string {
  // 1. Auto-Discovery: Find ALL variables starting with TWITTER_COOKIES
  const envKeys = Object.keys(process.env).filter(k => k.startsWith("TWITTER_COOKIES"));
  
  let allRawCookies = "";
  envKeys.forEach(k => {
    allRawCookies += (process.env[k] || "") + "\n";
  });

  const c = allRawCookies.trim();

  if (!c || c.length < 20 || c.includes("PASTE_YOUR")) {
    throw new Error("TWITTER_COOKIES_NOT_SET");
  }

  // 2. Initial split by newlines (standard)
  let pools = c.split(/\\n|\n/).map(l => l.trim()).filter(l => l.length > 20);
  
  console.log(`[Cookie Farm] Auto-Discovered ${envKeys.length} variables. Total raw length: ${c.length} chars.`);

  // 3. Fallback: If we only found 1 line but it contains many accounts smashed together
  if (pools.length === 1) {
    const candidate = pools[0];
    const tokenMatches = (candidate.match(/auth_token=/g) || []).length;
    
    if (tokenMatches > 1) {
      console.log(`[Cookie Farm] Smashed cookie mode. Found ${tokenMatches} auth_token markers.`);
      // Split by common separators or markers
      pools = candidate.split(/(?=guest_id=)|(?=auth_token=)/g)
        .map(l => l.trim())
        .filter(l => l.length > 50 && l.includes("auth_token="));
    }
  }

  if (pools.length === 0) throw new Error("TWITTER_COOKIES_NOT_SET");
  
  // Exclude cookies that hit 429 within the last 15 minutes
  const now = Date.now();
  const available = pools.filter(c => {
    const burnedAt = burnedCookies.get(c);
    if (!burnedAt) return true;
    if (now - burnedAt > 15 * 60 * 1000) {
      burnedCookies.delete(c);
      return true;
    }
    return false;
  });
  
  const availableCount = available.length;
  const burnedCount = pools.length - availableCount;

  console.log(`[Cookie Farm] 🟢 ${availableCount}/${pools.length} active | 🔥 ${burnedCount} resting`);
  
  return available[Math.floor(Math.random() * available.length)];
}

function buildHeaders(cookies: string): Record<string, string> {
  const ct0 = cookies.match(/ct0=([^;]+)/)?.[1]?.trim() ?? "";
  return {
    Authorization: `Bearer ${BEARER_TOKEN}`,
    Cookie: cookies,
    "x-csrf-token": ct0,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "x-twitter-client-language": "en",
    "x-twitter-active-user": "yes",
    "x-twitter-auth-type": "OAuth2Session",
    Referer: "https://x.com/",
    Origin: "https://x.com",
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };
}

// ─── GQL helpers ──────────────────────────────────────────────────────────────

// Features that make TweetDetail return 200 (422 without these)
const GQL_FEATURES = encodeURIComponent(
  JSON.stringify({
    rweb_lists_timeline_redesign_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    tweetypie_unmention_optimization_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    freedom_of_speech_not_reach_the_voters_act_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: false,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: false,
    interactive_text_enabled: true,
    responsive_web_text_conversations_enabled: false,
    responsive_web_enhance_cards_enabled: false,
  })
);

// fieldToggles required by TweetDetail
const FIELD_TOGGLES = encodeURIComponent(
  JSON.stringify({ withArticleRichContentState: false, withAuxiliaryUserLabels: false })
);

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function gqlGet(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 8000
): Promise<Response> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (res.status === 401 || res.status === 403) throw new Error("AUTH_FAILED");
  return res;
}

// ─── User lookup ──────────────────────────────────────────────────────────────

async function lookupUser(
  username: string,
  headers: Record<string, string>,
  ids: QueryIds
) {
  const vars = encodeURIComponent(
    JSON.stringify({ screen_name: username, withSafetyModeUserFields: true })
  );
  const res = await gqlGet(
    `https://api.x.com/graphql/${ids.UserByScreenName}/UserByScreenName?variables=${vars}&features=${GQL_FEATURES}`,
    headers
  );
  if (!res.ok) throw new Error(`User lookup failed (${res.status})`);

  const data = await res.json();
  const ur = data?.data?.user?.result;
  if (!ur) throw new Error(`@${username} not found or account is private/suspended.`);

  const core = (ur.core as Record<string, string>) ?? {};
  const legacy = (ur.legacy as Record<string, string>) ?? {};
  const av = (ur.avatar as Record<string, string>) ?? {};

  return {
    id: ur.rest_id as string,
    handle: core.screen_name || legacy.screen_name || username,
    name: core.name || legacy.name || username,
    avatar: (av.image_url || legacy.profile_image_url_https || "").replace("_normal", "_400x400"),
  };
}

// ─── Get user's original tweets ───────────────────────────────────────────────

interface MinTweet { id: string; authorHandle: string; createdAt: number; }

async function getUserTweets(
  userId: string,
  count: number,
  headers: Record<string, string>,
  ids: QueryIds
): Promise<MinTweet[]> {
  const tweets: MinTweet[] = [];
  let cursor: string | undefined = undefined;

  // Search up to 10 pages deep to find enough original tweets (Deep Accuracy Mode)
  for (let page = 0; page < 10; page++) {
    const vars = encodeURIComponent(
      JSON.stringify({
        userId,
        count: 100,
        cursor,
        includePromotedContent: false,
        withQuickPromoteEligibilityTweetFields: true,
        withVoice: true,
        withV2Timeline: true,
      })
    );
    const res = await gqlGet(
      `https://api.x.com/graphql/${ids.UserTweets}/UserTweets?variables=${vars}&features=${GQL_FEATURES}`,
      headers
    );
    if (!res.ok) throw new Error(`Tweet fetch failed (${res.status})`);

    const data = await res.json();
    const instructions: Array<{ type: string; entries?: unknown[] }> =
      data?.data?.user?.result?.timeline?.timeline?.instructions ??
      data?.data?.user?.result?.timeline_v2?.timeline?.instructions ??
      [];

    type Entry = {
      entryId?: string;
      content?: { value?: string; itemContent?: { value?: string; tweet_results?: { result?: unknown } } };
    };

    const entries = instructions
      .flatMap((i) => (i.type === "TimelineAddEntries" ? ((i.entries ?? []) as Entry[]) : []));

    for (const e of entries) {
      if (!e.entryId?.startsWith("tweet-")) continue;
      const r = e?.content?.itemContent?.tweet_results?.result as Record<string, unknown> | undefined;
      if (!r) continue;
      const t = parseTweet(r);
      if (!t || t.isReply || t.isRetweet) continue;
      
      // Ensure we don't push duplicates
      if (!tweets.some(tw => tw.id === t.id)) {
        tweets.push({ id: t.id, authorHandle: t.authorHandle, createdAt: t.createdAt });
      }
      if (tweets.length >= count) break;
    }

    if (tweets.length >= count) break;

    // Find next page cursor
    const bottomCursor = entries.find(e => e.entryId?.startsWith("cursor-bottom-"));
    const nextCursor = bottomCursor?.content?.value || bottomCursor?.content?.itemContent?.value;
    if (!nextCursor) break; // Reached end of history
    cursor = nextCursor;
  }
  return tweets;
}

function parseTweet(result: Record<string, unknown>) {
  try {
    const actual = (
      result.__typename === "TweetWithVisibilityResults"
        ? (result.tweet as Record<string, unknown>)
        : result
    ) as Record<string, unknown>;

    const legacy = actual.legacy as Record<string, unknown> | undefined;
    if (!legacy) return null;

    const core = actual.core as Record<string, unknown> | undefined;
    const cu = (core?.user_results as Record<string, unknown>)?.result as Record<string, unknown> | undefined;
    const cuc = cu?.core as Record<string, unknown> | undefined;
    const authorHandle =
      (cuc?.screen_name as string) || ((cu?.legacy as Record<string, unknown>)?.screen_name as string) || "";

    const createdAtStr = legacy.created_at as string | undefined;
    const createdAt = createdAtStr ? new Date(createdAtStr).getTime() : 0;

    return {
      id: actual.rest_id as string,
      authorHandle,
      createdAt,
      isReply: !!legacy.in_reply_to_status_id_str,
      isRetweet: ((legacy.full_text as string) || "").startsWith("RT @"),
    };
  } catch { return null; }
}

// ─── Get tweet replies (TweetDetail) ──────────────────────────────────────────

async function getTweetReplies(
  tweetId: string,
  targetHandle: string,
  headers: Record<string, string>,
  ids: QueryIds
): Promise<ReplyInstance[]> {
  const vars = encodeURIComponent(
    JSON.stringify({
      focalTweetId: tweetId,
      referrer: "tweet",
      count: 40,
      with_rux_injections: false,
      includePromotedContent: true,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true,
      withVoice: true,
    })
  );

  const url = `https://api.x.com/graphql/${ids.TweetDetail}/TweetDetail?variables=${vars}&features=${GQL_FEATURES}&fieldToggles=${FIELD_TOGGLES}`;
  let res: Response;
  try {
    res = await gqlGet(url, headers, 9000);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "RATE_LIMITED" || msg === "AUTH_FAILED") throw err;
    return []; // timeout or network error → skip this tweet
  }

  if (!res.ok) return [];

  const data = await res.json();
  const instructions: Array<{ type: string; entries?: unknown[] }> =
    data?.data?.threaded_conversation_with_injections_v2?.instructions ?? [];

  type ConvEntry = {
    entryId?: string;
    content?: {
      itemContent?: { tweet_results?: { result?: unknown } };
      items?: Array<{ item?: { itemContent?: { tweet_results?: { result?: unknown } } } }>;
    };
  };

  const entries = instructions.flatMap((i) =>
    i.type === "TimelineAddEntries" ? ((i.entries ?? []) as ConvEntry[]) : []
  );

  const repliers: ReplyInstance[] = [];
  for (const entry of entries) {
    const items = entry.content?.items ?? [];
    
    let rootReplyResult = entry.content?.itemContent?.tweet_results?.result as Record<string, unknown> | undefined;
    if (!rootReplyResult && items.length > 0) {
      rootReplyResult = items[0].item?.itemContent?.tweet_results?.result as Record<string, unknown> | undefined;
    }
    
    if (!rootReplyResult) continue;
    
    const rootReply = parseTweet(rootReplyResult);
    if (!rootReply) continue;
    
    const leg =
      (rootReplyResult.legacy as Record<string, unknown>) ||
      ((rootReplyResult.tweet as Record<string, unknown>)?.legacy as Record<string, unknown>);
    if ((leg?.in_reply_to_status_id_str as string) !== tweetId) continue;
    
    const handle = rootReply.authorHandle.toLowerCase();
    if (!handle || handle === targetHandle.toLowerCase()) continue;

    let authorRepliedBack = false;
    if (items.length > 1) {
      for (let i = 1; i < items.length; i++) {
        const descResult = items[i].item?.itemContent?.tweet_results?.result as Record<string, unknown> | undefined;
        if (!descResult) continue;
        const descTweet = parseTweet(descResult);
        if (descTweet && descTweet.authorHandle.toLowerCase() === targetHandle.toLowerCase()) {
          authorRepliedBack = true;
          break;
        }
      }
    }
    
    repliers.push({
      handle,
      createdAt: rootReply.createdAt,
      authorRepliedBack,
    });
  }
  return repliers;
}

// ─── Parallel batch helper ────────────────────────────────────────────────────

async function fetchRepliesParallel(
  tweets: MinTweet[],
  targetHandle: string,
  headers: Record<string, string>,
  ids: QueryIds
): Promise<{ replyCounts: Record<string, { count: number; tweetIds: Set<string>; score: number }>; total: number; rateLimited: boolean }> {
  const replyCounts: Record<string, { count: number; tweetIds: Set<string>; score: number }> = {};
  let total = 0;
  let rateLimited = false;

  for (let i = 0; i < tweets.length; i += CONCURRENCY) {
    if (rateLimited) break;
    const batch = tweets.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map((t) => getTweetReplies(t.id, targetHandle, headers, ids))
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const focalTweet = batch[j];
      if (r.status === "rejected") {
        if ((r.reason as Error)?.message === "RATE_LIMITED") rateLimited = true;
        if ((r.reason as Error)?.message === "AUTH_FAILED") throw new Error("AUTH_FAILED");
        continue;
      }
      
      for (const instance of r.value) {
        const { handle, createdAt, authorRepliedBack } = instance;
        if (!replyCounts[handle]) {
          replyCounts[handle] = { count: 0, tweetIds: new Set(), score: 0 };
        }
        
        // Spam Cap: Only score the FIRST reply we process per focal tweet for this user
        if (replyCounts[handle].tweetIds.has(focalTweet.id)) continue;
        
        replyCounts[handle].count++;
        replyCounts[handle].tweetIds.add(focalTweet.id);
        total++;
        
        // Calculate Weighted Score
        let points = 100; // Base consistency points
        
        if (createdAt > 0 && focalTweet.createdAt > 0) {
          const diffMinutes = (createdAt - focalTweet.createdAt) / (1000 * 60);
          if (diffMinutes <= 5) points += 100;
          else if (diffMinutes <= 15) points += 80;
          else if (diffMinutes <= 60) points += 50;
          else if (diffMinutes <= 360) points += 20;
        }
        
        if (authorRepliedBack) {
          points += 250;
        }
        
        replyCounts[handle].score += points;
      }
    }

    if (i + CONCURRENCY < tweets.length && !rateLimited) {
      // Throttle dramatically between batches to prevent X from auto-banning the cookie
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  return { replyCounts, total, rateLimited };
}

// ─── Badges ───────────────────────────────────────────────────────────────────

const BADGES = [
  { minReplies: 15, minLoyalty: 60, badge: "Reply God", emoji: "👑", color: "#fbbf24" },
  { minReplies: 10, minLoyalty: 50, badge: "Certified Glazer", emoji: "🍩", color: "#f472b6" },
  { minReplies: 7, minLoyalty: 40, badge: "Professional Yapper", emoji: "🗣️", color: "#a855f7" },
  { minReplies: 5, minLoyalty: 30, badge: "Loyal Soldier", emoji: "🪖", color: "#3b82f6" },
  { minReplies: 3, minLoyalty: 20, badge: "Reply Demon", emoji: "💀", color: "#ef4444" },
  { minReplies: 2, minLoyalty: 0, badge: "Fan Behavior", emoji: "👀", color: "#f59e0b" },
  { minReplies: 0, minLoyalty: 0, badge: "Just Happy To Be Here", emoji: "🥹", color: "#6b7280" },
];

function assignBadge(replies: number, loyalty: number, rank: number) {
  let matchedBadge = BADGES[BADGES.length - 1];
  for (const t of BADGES) {
    if (replies >= t.minReplies && loyalty >= t.minLoyalty) {
      matchedBadge = t;
      break;
    }
  }
  
  if (rank === 0 && matchedBadge.minReplies < 5) {
    return { badge: "Number 1 Fan", emoji: "🥇", color: "#a855f7" };
  }
  return { badge: matchedBadge.badge, emoji: matchedBadge.emoji, color: matchedBadge.color };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function analyzeReplyGuys(username: string): Promise<AnalyzeResult> {
  const clean = username.replace(/^@/, "").trim().toLowerCase();
  
  if (!clean || !/^[a-zA-Z0-9_]{1,50}$/.test(clean)) {
    throw new Error("Invalid username. Only letters, numbers and underscores allowed.");
  }

  // Wrap the entire heavy scraping logic in Vercel's Global Edge Cache Storage
  // This means the first person to search @okiewins globally pays the API cost
  // The next 5,000 people to search it will instantly pull the JSON blob from Vercel's CDN (Zero Cost)
  const getCachedAnalysis = unstable_cache(
    async () => performActualScraping(clean),
    [`reply-guy-analysis-v2-${clean}`],
    { revalidate: 300 } // Deep Accuracy: Reduced to 5 minutes to ensure fresher results for repeated searches
  );

  return await getCachedAnalysis();
}

async function performActualScraping(clean: string): Promise<AnalyzeResult> {
  const cookies = getServerCookies();
  const headers = buildHeaders(cookies);
  const ids = await getQueryIds();

  try {
    // 1. Look up user
    const user = await lookupUser(clean, headers, ids);

    // 2. Get original tweets
    const tweets = await getUserTweets(user.id, TWEETS_TO_ANALYZE, headers, ids);
    if (tweets.length === 0) {
      throw new Error(`No original tweets found for @${clean}. The account may be private or have no recent posts.`);
    }

    // 3. Parallel-fetch replies for all tweets
    const { replyCounts, total, rateLimited } = await fetchRepliesParallel(
      tweets, clean, headers, ids
    );

    if (rateLimited && total === 0) throw new Error("RATE_LIMITED");

    // 4. Sort and rank top 20
    const sorted = Object.entries(replyCounts)
      .map(([u, d]) => ({ user: u, replies: d.count, tweets_replied: d.tweetIds.size, score: d.score }))
      .filter((u) => u.replies > 0)
      .sort((a, b) => b.score - a.score || b.replies - a.replies)
      .slice(0, 20);

    const totalTopReplies = sorted.reduce((sum, rg) => sum + rg.replies, 0);

    const top_reply_guys: ReplyGuy[] = sorted.map((rg, idx) => {
      const dominance = totalTopReplies > 0 ? Math.round((rg.replies / totalTopReplies) * 100) : 0;
      const loyalty = tweets.length > 0 ? Math.round((rg.tweets_replied / tweets.length) * 100) : 0;
      const { badge, emoji, color } = assignBadge(rg.replies, loyalty, idx);
      return { ...rg, dominance, loyaltyScore: loyalty, score: rg.score, badge, badgeEmoji: emoji, color };
    });

    const result: AnalyzeResult = {
      username: clean,
      displayName: user.name,
      avatarUrl: user.avatar,
      top_reply_guys,
      total_replies_analyzed: total,
      tweets_analyzed: tweets.length,
      disclaimer: `Based on replies to the last ${tweets.length} tweets.${rateLimited ? " (Partial — X rate limited some requests.)" : ""}`,
    };

    return result;
  } catch (err) {
    if (err instanceof Error && err.message === "RATE_LIMITED") {
      markCookieBurned(cookies);
    }
    throw err;
  }
}
