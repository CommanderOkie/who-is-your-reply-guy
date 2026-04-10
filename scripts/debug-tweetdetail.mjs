// Debug TweetDetail 422 — try different variable combinations
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

// First find a popular tweet from sama (high-engagement so it has replies)
const TWEET_ID = "2042354232754368897"; // levelsio tweet

// Try to get a known tweet with replies
async function findGoodTweet() {
  const res = await fetch("https://x.com/levelsio", {
    headers: { ...HEADERS, Accept: "text/html" }
  });
  console.log("x.com status:", res.status);
}

// Try TweetDetail with different query IDs
async function tryTweetDetail(tweetId, queryId, label) {
  const vars = encodeURIComponent(JSON.stringify({
    focalTweetId: tweetId,
    count: 20,
    with_rux_injections: false,
    includePromotedContent: false,
    withCommunity: true,
    withVoice: true,
    withV2Timeline: true,
  }));
  
  // Try with NO features first (empty)
  const res1 = await fetch(
    `https://api.x.com/graphql/${queryId}/TweetDetail?variables=${vars}&features=%7B%7D`,
    { headers: HEADERS }
  );
  console.log(`${label} [no features]: ${res1.status}`);
  if (res1.status === 200) {
    const d = await res1.json();
    const insts = d?.data?.threaded_conversation_with_injections_v2?.instructions ?? [];
    console.log("  instructions count:", insts.length);
    const add = insts.find(i => i.type === "TimelineAddEntries");
    console.log("  entries:", add?.entries?.length ?? 0);
    return true;
  }
  
  // Try with fieldToggles
  const vars2 = encodeURIComponent(JSON.stringify({
    focalTweetId: tweetId,
    referrer: "tweet",
    count: 20,
    with_rux_injections: false,
    includePromotedContent: true,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: true,
    withBirdwatchNotes: true,
    withVoice: true,
  }));
  const features2 = encodeURIComponent(JSON.stringify({
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
  }));
  const fieldToggles = encodeURIComponent(JSON.stringify({
    withArticleRichContentState: false,
    withAuxiliaryUserLabels: false,
  }));
  
  const res2 = await fetch(
    `https://api.x.com/graphql/${queryId}/TweetDetail?variables=${vars2}&features=${features2}&fieldToggles=${fieldToggles}`,
    { headers: HEADERS }
  );
  console.log(`${label} [full features]: ${res2.status}`);
  if (res2.status === 200) {
    const d = await res2.json();
    const insts = d?.data?.threaded_conversation_with_injections_v2?.instructions ?? [];
    const add = insts.find(i => i.type === "TimelineAddEntries");
    console.log("  entries:", add?.entries?.length ?? 0);
    
    // Find replies
    const replies = [];
    for (const e of (add?.entries ?? [])) {
      const items = e.content?.items ?? [];
      const all = [
        e.content?.itemContent?.tweet_results?.result,
        ...items.map(it => it.item?.itemContent?.tweet_results?.result),
      ].filter(Boolean);
      for (const r of all) {
        const leg = r?.legacy ?? r?.tweet?.legacy;
        if (leg?.in_reply_to_status_id_str === tweetId) {
          const h = r?.core?.user_results?.result?.core?.screen_name 
            ?? r?.core?.user_results?.result?.legacy?.screen_name;
          if (h) replies.push(h);
        }
      }
    }
    console.log("  direct replies:", replies.length, replies.slice(0,5).join(", "));
    return true;
  }
  
  if (res2.status !== 200) {
    const text = await res2.text().catch(() => "");
    console.log("  response body:", text.slice(0, 200));
  }
  return false;
}

// Also try getting fresh query IDs
async function getFreshQueryId() {
  console.log("\n📦 Fetching fresh TweetDetail query ID from X bundles...");
  const html = await fetch("https://x.com", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  }).then(r => r.text());
  const bundles = [...new Set(html.match(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/[a-zA-Z0-9._-]+\.js/g) ?? [])];
  for (const url of bundles.slice(0, 10)) {
    try {
      const js = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => r.text());
      const m = js.match(/queryId:"([^"]+)",operationName:"TweetDetail"/);
      if (m) { console.log("  TweetDetail ID:", m[1]); return m[1]; }
    } catch {}
  }
  return null;
}

async function main() {
  // Get fresh ID first
  const freshId = await getFreshQueryId();
  
  // Try the known tweet
  console.log(`\nTesting with tweet ID: ${TWEET_ID}`);
  
  if (freshId) {
    await tryTweetDetail(TWEET_ID, freshId, `Fresh ID (${freshId})`);
  }
  
  // Also try the hardcoded one
  await tryTweetDetail(TWEET_ID, "rU08O-YiXdr0IZfE7qaUMg", "Hardcoded ID");
}

main().catch(e => console.error("Error:", e.message));
