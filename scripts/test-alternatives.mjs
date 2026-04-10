// Test if Twitter v1.1 search API works with guest token
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
  const data = await res.json();
  console.log("Guest token received:", !!data.guest_token);
  return data.guest_token;
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

  // Test 1: v1.1 search/tweets.json  
  console.log("\n== v1.1 search/tweets.json ==");
  const searchRes = await fetch(
    "https://api.x.com/1.1/search/tweets.json?q=to%3Asama&count=10&result_type=recent",
    { headers }
  );
  console.log("Status:", searchRes.status);
  const searchText = await searchRes.text();
  console.log("Response (300):", searchText.slice(0, 300));

  // Test 2: v1.1 statuses/mentions_timeline.json
  console.log("\n== v1.1 statuses/show.json ==");
  const showRes = await fetch(
    "https://api.x.com/1.1/statuses/show.json?id=1889059531625464090&tweet_mode=extended",
    { headers }
  );
  console.log("Status:", showRes.status);
  const showText = await showRes.text();
  console.log("Response (300):", showText.slice(0, 300));

  // Test 3: Look for guest-accessible graphql endpoints
  // Try ConversationTimeline
  console.log("\n== Check all query IDs from bundle ==");
  const xRes = await fetch("https://x.com", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html",
    }
  });
  const html = await xRes.text();
  const bundles = [...new Set(html.match(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/[a-zA-Z0-9._-]+\.js/g) || [])];
  
  for (const bundle of bundles.slice(0, 5)) {
    try {
      const js = await fetch(bundle, { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => r.text());
      // Find ALL query IDs
      const allMatches = [...js.matchAll(/queryId:"([^"]+)",operationName:"([^"]+)"/g)];
      if (allMatches.length > 0) {
        console.log(`\nBundle ${bundle.split('/').pop()}: ${allMatches.length} queries found`);
        const relevant = allMatches.filter(m => 
          ["TweetDetail","SearchTimeline","Conversation","Tweet","Replies"].some(k => m[2].includes(k))
        );
        for (const m of relevant) {
          console.log(`  ${m[2]}: ${m[1]}`);
        }
      }
    } catch(e) { console.log("Bundle error:", e.message); }
  }
}

test().catch(e => console.error(e.message));
