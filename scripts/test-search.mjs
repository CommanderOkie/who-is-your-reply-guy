// Test SearchTimeline and TweetDetail with the new IDs
const BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

async function getGuestToken() {
  const res = await fetch("https://api.x.com/1.1/guest/activate.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "x-twitter-client-language": "en",
      "x-twitter-active-user": "yes",
    },
  });
  const data = await res.json();
  return data.guest_token;
}

function makeHeaders(gt) {
  return {
    Authorization: `Bearer ${BEARER_TOKEN}`,
    "x-guest-token": gt,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "x-twitter-active-user": "yes",
    Referer: "https://x.com/",
    Origin: "https://x.com",
    "x-twitter-client-language": "en",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

function deepKeys(obj, depth = 0, prefix = "") {
  if (depth > 3 || !obj || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      console.log(`${prefix}${k}: [${v.length} items]`);
      if (v.length > 0) deepKeys(v[0], depth + 1, prefix + "  [0].");
    } else if (typeof v === "object" && v !== null) {
      console.log(`${prefix}${k}: {}`);
      deepKeys(v, depth + 1, prefix + "  ");
    } else {
      const display = typeof v === "string" ? v.slice(0, 100) : v;
      console.log(`${prefix}${k}: ${display}`);
    }
  }
}

async function test() {
  const gt = await getGuestToken();
  console.log("gt:", gt);
  const headers = makeHeaders(gt);

  // Get a real tweet ID from sama
  const tweetVars = encodeURIComponent(JSON.stringify({
    userId: "1605",
    count: 5,
    includePromotedContent: false,
    withVoice: true,
    withV2Timeline: true,
  }));
  const tweetRes = await fetch(
    `https://api.x.com/graphql/x3B_xLqC0yZawOB7WQhaVQ/UserTweets?variables=${tweetVars}&features=%7B%7D`,
    { headers }
  );
  const tweetData = await tweetRes.json();
  const instructions = tweetData?.data?.user?.result?.timeline?.timeline?.instructions || [];
  const addEntries = instructions.find(i => i.type === "TimelineAddEntries");
  const firstTweetEntry = addEntries?.entries?.find(e => e.entryId?.startsWith("tweet-"));
  const firstTweetId = firstTweetEntry?.content?.itemContent?.tweet_results?.result?.rest_id 
    || firstTweetEntry?.entryId?.replace("tweet-", "");
  console.log("First tweet ID:", firstTweetId);
  
  // Now test SearchTimeline with conversation_id
  console.log("\n=== SearchTimeline (conversation replies) ===");
  const features = encodeURIComponent(JSON.stringify({
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
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: false,
    responsive_web_enhance_cards_enabled: false,
  }));
  
  const searchVars = encodeURIComponent(JSON.stringify({
    rawQuery: `conversation_id:${firstTweetId} to:sama -from:sama`,
    count: 20,
    product: "Latest",
  }));
  
  const searchRes = await fetch(
    `https://api.x.com/graphql/pCd62NDD9dlCDgEGgEVHMg/SearchTimeline?variables=${searchVars}&features=${features}`,
    { headers }
  );
  console.log("SearchTimeline status:", searchRes.status);
  const searchData = await searchRes.json();
  
  deepKeys(searchData, 0, "");
  
  // Look for tweets in response
  const searchInstructions = searchData?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions || [];
  const searchAdd = searchInstructions.find(i => i.type === "TimelineAddEntries");
  console.log("Search entries:", searchAdd?.entries?.length || 0);
  if (searchAdd?.entries?.length > 0) {
    console.log("First search entry:", JSON.stringify(searchAdd.entries[0]).slice(0, 300));
  }
  
  // Also try TweetDetail 
  console.log("\n=== TweetDetail (conversation thread) ===");
  const detailVars = encodeURIComponent(JSON.stringify({
    focalTweetId: firstTweetId,
    count: 20,
    with_rux_injections: false,
    includePromotedContent: false,
    withCommunity: true,
    withVoice: true,
    withV2Timeline: true,
  }));
  
  const detailRes = await fetch(
    `https://api.x.com/graphql/rU08O-YiXdr0IZfE7qaUMg/TweetDetail?variables=${detailVars}&features=${features}`,
    { headers }
  );
  console.log("TweetDetail status:", detailRes.status);
  const detailData = await detailRes.json();
  deepKeys(detailData, 0, "");
  
  const detailInsts = detailData?.data?.threaded_conversation_with_injections_v2?.instructions || [];
  const detailAdd = detailInsts.find(i => i.type === "TimelineAddEntries");
  console.log("TweetDetail entries:", detailAdd?.entries?.length || 0);
  if (detailAdd?.entries?.length > 0) {
    console.log("Entry types:", detailAdd.entries.slice(0, 5).map(e => `${e.entryId} -> ${e.content?.entryType || e.content?.items?.length + " items"}`).join(", "));
  }
}

test().catch(console.error);
