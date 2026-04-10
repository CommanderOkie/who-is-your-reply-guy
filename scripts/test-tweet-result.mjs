// Test TweetResultByRestId to see what data we get
const BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

async function getGuestToken() {
  const res = await fetch("https://api.x.com/1.1/guest/activate.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  return (await res.json()).guest_token;
}

async function test() {
  const gt = await getGuestToken();
  const headers = {
    Authorization: `Bearer ${BEARER_TOKEN}`,
    "x-guest-token": gt,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://x.com/",
    "Accept": "application/json",
  };

  // Test TweetResultByRestId
  const tweetId = "1889059531625464090"; // real tweet from sama timeline
  const vars = encodeURIComponent(JSON.stringify({
    tweetId,
    withCommunity: false,
    includePromotedContent: false,
    withVoice: false,
  }));
  const features = encodeURIComponent(JSON.stringify({
    rweb_lists_timeline_redesign_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    longform_notetweets_consumption_enabled: true,
    responsive_web_enhance_cards_enabled: false,
  }));
  
  console.log("Testing TweetResultByRestId...");
  const res = await fetch(
    `https://api.x.com/graphql/tmhPpO5sDermwYmq3h034A/TweetResultByRestId?variables=${vars}&features=${features}`,
    { headers }
  );
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response (600):", text.slice(0, 600));
  
  // Also test TweetResultsByRestIds
  console.log("\nTesting TweetResultsByRestIds...");
  const vars2 = encodeURIComponent(JSON.stringify({
    tweetIds: [tweetId],
    withCommunity: false,
    includePromotedContent: false,
    withVoice: false,
  }));
  const res2 = await fetch(
    `https://api.x.com/graphql/h8VKYtrhiDbbWs-KUwMjtg/TweetResultsByRestIds?variables=${vars2}&features=${features}`,
    { headers }
  );
  console.log("Status:", res2.status);
  const text2 = await res2.text();
  console.log("Response (600):", text2.slice(0, 600));
  
  // Test UserTweetsAndReplies
  console.log("\nTesting UserTweetsAndReplies for sama (ID:1605)...");
  const vars3 = encodeURIComponent(JSON.stringify({
    userId: "1605",
    count: 20,
    includePromotedContent: false,
    withCommunity: true,
    withVoice: true,
    withV2Timeline: true,
  }));
  const res3 = await fetch(
    `https://api.x.com/graphql/Yt1JzwcBsBWYEEi3jMTe2Q/UserTweetsAndReplies?variables=${vars3}&features=${features}`,
    { headers }
  );
  console.log("Status:", res3.status);
  const tweetAndReplyData = await res3.json();
  const instrs = tweetAndReplyData?.data?.user?.result?.timeline?.timeline?.instructions || [];
  const addEntries = instrs.find(i => i.type === "TimelineAddEntries");
  const tweetEntries = addEntries?.entries?.filter(e => e.entryId?.startsWith("tweet-")) || [];
  const replyEntries = addEntries?.entries?.filter(e => !e.entryId?.startsWith("tweet-") && !e.entryId?.startsWith("cursor")) || [];
  console.log("Tweet entries:", tweetEntries.length);
  console.log("Other entries:", replyEntries.map(e => e.entryId?.split("-")[0] || "?").join(", ").slice(0, 200));
}

test().catch(e => console.error(e.message));
