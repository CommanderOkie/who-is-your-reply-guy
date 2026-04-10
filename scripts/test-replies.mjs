// Test TweetDetail specifically to get conversation replies
const BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

async function getGuestToken() {
  const res = await fetch("https://api.x.com/1.1/guest/activate.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "x-twitter-client-language": "en",
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

async function test() {
  const gt = await getGuestToken();
  const headers = makeHeaders(gt);
  
  // Fetch a real tweet from sama
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
  const firstTweetId = firstTweetEntry?.entryId?.replace("tweet-", "");
  console.log("Testing with tweet ID:", firstTweetId);
  
  // Get features from the JS bundle to use the correct ones
  const xRes = await fetch("https://x.com", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    }
  });
  const xHtml = await xRes.text();
  const bundles = [...new Set(xHtml.match(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/[a-zA-Z0-9._-]+\.js/g) || [])];
  
  let tweetDetailId = "rU08O-YiXdr0IZfE7qaUMg"; // fallback
  let searchTimelineId = "pCd62NDD9dlCDgEGgEVHMg";
  
  for (const bundle of bundles.slice(0, 10)) {
    try {
      const js = await fetch(bundle, { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => r.text());
      const tdMatch = js.match(/queryId:"([^"]+)",operationName:"TweetDetail"/);
      const stMatch = js.match(/queryId:"([^"]+)",operationName:"SearchTimeline"/);
      if (tdMatch) { tweetDetailId = tdMatch[1]; console.log("TweetDetail ID:", tdMatch[1]); }
      if (stMatch) { searchTimelineId = stMatch[1]; console.log("SearchTimeline ID:", stMatch[1]); }
      if (tdMatch || stMatch) break;
    } catch(e) {}
  }
  
  const minFeatures = encodeURIComponent(JSON.stringify({
    rweb_lists_timeline_redesign_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    longform_notetweets_consumption_enabled: true,
    responsive_web_enhance_cards_enabled: false,
  }));
  
  // == TweetDetail ==
  console.log("\n=== TweetDetail ===");
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
    `https://api.x.com/graphql/${tweetDetailId}/TweetDetail?variables=${detailVars}&features=${minFeatures}`,
    { headers }
  );
  console.log("TweetDetail status:", detailRes.status);
  
  if (detailRes.status === 200) {
    const detailData = await detailRes.json();
    const detailInsts = detailData?.data?.threaded_conversation_with_injections_v2?.instructions || [];
    const addEntry = detailInsts.find(i => i.type === "TimelineAddEntries");
    console.log("Instructions:", detailInsts.map(i => i.type));
    console.log("Entries count:", addEntry?.entries?.length || 0);
    
    if (addEntry?.entries) {
      // Collect all entries and look for replies
      let replyCount = 0;
      for (const entry of addEntry.entries) {
        const isConversation = entry.entryId?.startsWith("conversationthread-");
        const isTweet = entry.entryId?.startsWith("tweet-");
        if (!isConversation && !isTweet) continue;
        
        // For conversation threads, items are nested
        const items = entry.content?.items || [];
        const singleTweet = entry.content?.itemContent?.tweet_results?.result;
        
        const results = [
          singleTweet,
          ...items.map(i => i.item?.itemContent?.tweet_results?.result)
        ].filter(Boolean);
        
        for (const result of results) {
          const legacy = result?.legacy || result?.tweet?.legacy;
          if (legacy?.in_reply_to_status_id_str === firstTweetId) {
            const core = result?.core || result?.tweet?.core;
            const authorHandle = core?.user_results?.result?.core?.screen_name || 
              core?.user_results?.result?.legacy?.screen_name;
            console.log(`Reply from @${authorHandle}: ${(legacy?.full_text || "").slice(0, 60)}`);
            replyCount++;
          }
        }
      }
      console.log("Replies to target tweet:", replyCount);
    }
  } else {
    const text = await detailRes.text();
    console.log("TweetDetail response:", text.slice(0, 400));
  }
  
  // == SearchTimeline ==
  console.log("\n=== SearchTimeline ===");
  const searchVars = encodeURIComponent(JSON.stringify({
    rawQuery: `conversation_id:${firstTweetId} to:sama`,
    count: 20,
    product: "Latest",
  }));
  const searchRes = await fetch(
    `https://api.x.com/graphql/${searchTimelineId}/SearchTimeline?variables=${searchVars}&features=${minFeatures}`,
    { headers }
  );
  console.log("SearchTimeline status:", searchRes.status);
  const searchText = await searchRes.text();
  console.log("Response (400):", searchText.slice(0, 400));
}

test().catch(e => console.error("Error:", e.message, e.stack?.split('\n')[1]));
