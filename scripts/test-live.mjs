// Quick end-to-end test with the real burner account cookies
// Run: node scripts/test-live.mjs

const BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const COOKIES = `guest_id_marketing=v1%3A177201993574869588; guest_id_ads=v1%3A177201993574869588; guest_id=v1%3A177201993574869588; personalization_id="v1_91gmxJSKo0IDpLrBnj4VhA=="; __cuid=11f5e8744d864e77a3eed52ff88d3135; kdt=yeN3TeTLiNHVTRlxvXiXx5MVSUfhn4zOvZH6cCR0; auth_token=20e6b008ad232bb68e6be056756ca8d3b85a1724; ct0=5e6f40990c4f7515362b4a56ba581ee2d1db87b08f9118f4be47c623a1c378464ca290ab8e7c200e94b92e26f5a889ea26b5b2bfcc65fe52fa873c495495a78a6e3d2688d6a74a4f1cef5b97dc01d4f8; twid=u%3D2026624666857779205; lang=en`;

const ct0 = COOKIES.match(/ct0=([^;]+)/)?.[1]?.trim() ?? "";

const HEADERS = {
  Authorization: `Bearer ${BEARER_TOKEN}`,
  Cookie: COOKIES,
  "x-csrf-token": ct0,
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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

const GQL_FEATURES = encodeURIComponent(JSON.stringify({
  rweb_lists_timeline_redesign_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  tweetypie_unmention_optimization_enabled: true,
  longform_notetweets_consumption_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_enhance_cards_enabled: false,
}));

async function test() {
  // Step 1: Look up @levelsio
  console.log("1️⃣  UserByScreenName @levelsio...");
  const userVars = encodeURIComponent(JSON.stringify({ screen_name: "levelsio", withSafetyModeUserFields: true }));
  const userRes = await fetch(
    `https://api.x.com/graphql/IGgvgiOx4QZndDHuD3x9TQ/UserByScreenName?variables=${userVars}&features=${GQL_FEATURES}`,
    { headers: HEADERS }
  );
  console.log("   Status:", userRes.status);
  const userData = await userRes.json();
  const userResult = userData?.data?.user?.result;
  const userId = userResult?.rest_id;
  const core = userResult?.core ?? {};
  const legacy = userResult?.legacy ?? {};
  console.log("   User:", core.name || legacy.name, "| ID:", userId);

  if (!userId) {
    console.error("   ❌ No user ID — cookies may be invalid");
    return;
  }

  // Step 2: Get tweets
  console.log("\n2️⃣  UserTweets...");
  const tweetVars = encodeURIComponent(JSON.stringify({
    userId,
    count: 20,
    includePromotedContent: false,
    withVoice: true,
    withV2Timeline: true,
  }));
  const tweetRes = await fetch(
    `https://api.x.com/graphql/x3B_xLqC0yZawOB7WQhaVQ/UserTweets?variables=${tweetVars}&features=${GQL_FEATURES}`,
    { headers: HEADERS }
  );
  console.log("   Status:", tweetRes.status);
  const tweetData = await tweetRes.json();
  const insts = tweetData?.data?.user?.result?.timeline?.timeline?.instructions ?? [];
  const addE = insts.find(i => i.type === "TimelineAddEntries");
  const tweetEntries = (addE?.entries ?? []).filter(e => e.entryId?.startsWith("tweet-"));
  console.log("   Tweets found:", tweetEntries.length);

  if (tweetEntries.length === 0) {
    console.error("   ❌ No tweets — timeline empty or auth issue");
    return;
  }

  // Step 3: TweetDetail on first tweet
  const firstId = tweetEntries[0].content?.itemContent?.tweet_results?.result?.rest_id
    ?? tweetEntries[0].entryId?.replace("tweet-", "");
  console.log("\n3️⃣  TweetDetail:", firstId, "...");
  const detailVars = encodeURIComponent(JSON.stringify({
    focalTweetId: firstId,
    count: 40,
    with_rux_injections: false,
    includePromotedContent: false,
    withCommunity: true,
    withVoice: true,
    withV2Timeline: true,
  }));
  const detailRes = await fetch(
    `https://api.x.com/graphql/rU08O-YiXdr0IZfE7qaUMg/TweetDetail?variables=${detailVars}&features=${GQL_FEATURES}`,
    { headers: HEADERS }
  );
  console.log("   Status:", detailRes.status);
  const detailData = await detailRes.json();
  const detailInsts = detailData?.data?.threaded_conversation_with_injections_v2?.instructions ?? [];
  const detailAdd = detailInsts.find(i => i.type === "TimelineAddEntries");
  console.log("   Thread entries:", detailAdd?.entries?.length ?? 0);

  // Find direct replies
  const replies = [];
  for (const entry of (detailAdd?.entries ?? [])) {
    const items = entry.content?.items ?? [];
    const allResults = [
      entry.content?.itemContent?.tweet_results?.result,
      ...items.map(it => it.item?.itemContent?.tweet_results?.result),
    ].filter(Boolean);

    for (const r of allResults) {
      const leg = r?.legacy ?? r?.tweet?.legacy;
      const inReplyTo = leg?.in_reply_to_status_id_str;
      if (inReplyTo !== firstId) continue;

      const coreU = r?.core ?? r?.tweet?.core;
      const coreUCore = coreU?.user_results?.result?.core;
      const handle = coreUCore?.screen_name ?? coreU?.user_results?.result?.legacy?.screen_name;
      if (handle) replies.push(handle);
    }
  }

  console.log("   Direct replies:", replies.length);
  if (replies.length > 0) {
    console.log("   Repliers:", replies.slice(0, 10).join(", "));
    console.log("\n✅ Everything works! Cookies are valid.");
  } else {
    console.log("   ⚠️  No direct replies found (tweet may have 0 replies)");
    console.log("\n✅ Auth OK — replies depend on the specific tweet.");
  }
}

test().catch(e => console.error("❌ Error:", e.message));
