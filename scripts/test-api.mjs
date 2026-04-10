// Test script to verify that the current query IDs work correctly
const BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

async function getGuestToken() {
  const res = await fetch("https://api.x.com/1.1/guest/activate.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "x-twitter-client-language": "en",
      "x-twitter-active-user": "yes",
    },
  });
  const data = await res.json();
  console.log("Guest token status:", res.status, "token:", data.guest_token ? "OK" : "FAILED");
  return data.guest_token;
}

function makeHeaders(gt) {
  return {
    Authorization: `Bearer ${BEARER_TOKEN}`,
    "x-guest-token": gt,
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "x-twitter-active-user": "yes",
    Referer: "https://x.com/",
    Origin: "https://x.com",
    "x-twitter-client-language": "en",
  };
}

async function test() {
  const gt = await getGuestToken();
  const headers = makeHeaders(gt);

  // 1. Test UserByScreenName
  console.log("\n--- Testing UserByScreenName ---");
  const userVars = encodeURIComponent(
    JSON.stringify({ screen_name: "sama", withSafetyModeUserFields: true })
  );
  const userRes = await fetch(
    `https://api.x.com/graphql/IGgvgiOx4QZndDHuD3x9TQ/UserByScreenName?variables=${userVars}&features=%7B%7D`,
    { headers }
  );
  console.log("UserByScreenName status:", userRes.status);
  const userData = await userRes.json();
  const userId = userData?.data?.user?.result?.rest_id;
  console.log("User ID:", userId, "Name:", userData?.data?.user?.result?.legacy?.name);

  if (!userId) return;

  // 2. Test UserTweets
  console.log("\n--- Testing UserTweets ---");
  const tweetVars = encodeURIComponent(
    JSON.stringify({
      userId,
      count: 10,
      includePromotedContent: false,
      withVoice: true,
      withV2Timeline: true,
    })
  );
  const tweetRes = await fetch(
    `https://api.x.com/graphql/x3B_xLqC0yZawOB7WQhaVQ/UserTweets?variables=${tweetVars}&features=%7B%7D`,
    { headers }
  );
  console.log("UserTweets status:", tweetRes.status);
  const tweetData = await tweetRes.json();
  const entries =
    tweetData?.data?.user?.result?.timeline_v2?.timeline?.instructions
      ?.flatMap((i) => (i.type === "TimelineAddEntries" ? i.entries || [] : []))
      ?.filter((e) => e.entryId?.startsWith("tweet-")) || [];
  console.log("Tweets found:", entries.length);

  if (entries.length === 0) {
    console.log("No tweets - response:", JSON.stringify(tweetData).slice(0, 300));
    return;
  }

  const firstTweetId = entries[0].content?.itemContent?.tweet_results?.result?.rest_id;
  console.log("First tweet ID:", firstTweetId);

  // 3. Test SearchTimeline for replies
  console.log("\n--- Testing SearchTimeline for replies ---");
  const searchVars = encodeURIComponent(
    JSON.stringify({
      rawQuery: `conversation_id:${firstTweetId} to:sama -from:sama`,
      count: 20,
      product: "Latest",
    })
  );
  
  // Use a minimal but valid features object
  const features = encodeURIComponent(JSON.stringify({
    rweb_lists_timeline_redesign_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  }));
  
  const searchRes = await fetch(
    `https://api.x.com/graphql/pCd62NDD9dlCDgEGgEVHMg/SearchTimeline?variables=${searchVars}&features=${features}`,
    { headers }
  );
  console.log("SearchTimeline status:", searchRes.status);
  const searchText = await searchRes.text();
  console.log("Search response (800 chars):", searchText.slice(0, 800));
}

test().catch(console.error);
