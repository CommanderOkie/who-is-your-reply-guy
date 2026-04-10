// Deep test to understand the exact response structure
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

function deepPrint(obj, prefix = "", depth = 0) {
  if (depth > 4) return;
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === null || v === undefined) continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      console.log(`${prefix}${k}: {`);
      deepPrint(v, prefix + "  ", depth + 1);
      console.log(`${prefix}}`);
    } else if (Array.isArray(v)) {
      console.log(`${prefix}${k}: [Array of ${v.length}]`);
      if (v.length > 0 && typeof v[0] === "object") deepPrint(v[0], prefix + "  [0].", depth + 1);
    } else {
      const val = typeof v === "string" ? v.slice(0, 80) : v;
      console.log(`${prefix}${k}: ${val}`);
    }
  }
}

async function test() {
  const gt = await getGuestToken();
  console.log("Guest token:", gt);
  const headers = makeHeaders(gt);

  // 1. UserByScreenName - print full structure
  console.log("\n=== UserByScreenName ===");
  const userVars = encodeURIComponent(JSON.stringify({
    screen_name: "sama",
    withSafetyModeUserFields: true,
    withSuperFollowsUserFields: true,
  }));
  const userRes = await fetch(
    `https://api.x.com/graphql/IGgvgiOx4QZndDHuD3x9TQ/UserByScreenName?variables=${userVars}&features=%7B%7D`,
    { headers }
  );
  console.log("Status:", userRes.status);
  const userData = await userRes.json();
  deepPrint(userData, "", 0);
  
  const userId = userData?.data?.user?.result?.rest_id;
  if (!userId) {
    console.log("No user ID found. Full response:", JSON.stringify(userData).slice(0, 1000));
    return;
  }

  // 2. UserTweets - find the right path
  console.log("\n=== UserTweets (structure) ===");
  const tweetVars = encodeURIComponent(JSON.stringify({
    userId,
    count: 5,
    includePromotedContent: false,
    withVoice: true,
    withV2Timeline: true,
  }));
  const tweetRes = await fetch(
    `https://api.x.com/graphql/x3B_xLqC0yZawOB7WQhaVQ/UserTweets?variables=${tweetVars}&features=%7B%7D`,
    { headers }
  );
  console.log("Status:", tweetRes.status);
  const tweetData = await tweetRes.json();
  deepPrint(tweetData, "", 0);
  
  // Find first tweet entry
  const allEntries = JSON.stringify(tweetData).includes("tweet-");
  console.log("Contains 'tweet-' entries:", allEntries);
  
  // Find tweets by scanning all instructions
  const instructions = tweetData?.data?.user?.result?.timeline?.timeline?.instructions ||
    tweetData?.data?.user?.result?.timeline_v2?.timeline?.instructions || [];
  console.log("Instructions count:", instructions.length);
  for (const inst of instructions) {
    console.log("  Instruction type:", inst.type, "entries:", inst.entries?.length || 0);
    if (inst.entries?.length > 0) {
      console.log("  First entry ID:", inst.entries[0]?.entryId);
    }
  }
}

test().catch(console.error);
