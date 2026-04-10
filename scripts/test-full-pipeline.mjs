// Full pipeline test — mirrors what the Next.js API route does
// Run: node scripts/test-full-pipeline.mjs

const BEARER_TOKEN = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
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
  rweb_lists_timeline_redesign_enabled: true, responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false, creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  tweetypie_unmention_optimization_enabled: true, responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true, longform_notetweets_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false, freedom_of_speech_not_reach_the_voters_act_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: false,
  longform_notetweets_rich_text_read_enabled: true, longform_notetweets_inline_media_enabled: false,
  interactive_text_enabled: true, responsive_web_text_conversations_enabled: false,
  responsive_web_enhance_cards_enabled: false,
}));

const FIELD_TOGGLES = encodeURIComponent(JSON.stringify({ withArticleRichContentState: false, withAuxiliaryUserLabels: false }));

const TARGET = "levelsio"; // change this to test another user

async function run() {
  console.log(`🔍 Analyzing @${TARGET}...\n`);
  const start = Date.now();

  // 1. User lookup
  const uVars = encodeURIComponent(JSON.stringify({ screen_name: TARGET, withSafetyModeUserFields: true }));
  const uRes = await fetch(`https://api.x.com/graphql/IGgvgiOx4QZndDHuD3x9TQ/UserByScreenName?variables=${uVars}&features=${GQL_FEATURES}`, { headers: HEADERS });
  const uData = await uRes.json();
  const ur = uData?.data?.user?.result;
  const userId = ur?.rest_id;
  const name = ur?.core?.name ?? ur?.legacy?.name ?? TARGET;
  console.log(`✅ User: ${name} (${userId})`);

  // 2. Get tweets
  const tVars = encodeURIComponent(JSON.stringify({ userId, count: 30, includePromotedContent: false, withVoice: true, withV2Timeline: true }));
  const tRes = await fetch(`https://api.x.com/graphql/x3B_xLqC0yZawOB7WQhaVQ/UserTweets?variables=${tVars}&features=${GQL_FEATURES}`, { headers: HEADERS });
  const tData = await tRes.json();
  const insts = tData?.data?.user?.result?.timeline?.timeline?.instructions ?? [];
  const addE = insts.find(i => i.type === "TimelineAddEntries");
  const rawEntries = (addE?.entries ?? []).filter(e => e.entryId?.startsWith("tweet-"));
  
  const tweets = rawEntries.slice(0, 15).map(e => {
    const r = e.content?.itemContent?.tweet_results?.result;
    const leg = r?.legacy ?? r?.tweet?.legacy;
    if (!leg || leg.in_reply_to_status_id_str || (leg.full_text || "").startsWith("RT @")) return null;
    return { id: r?.rest_id ?? e.entryId.replace("tweet-", ""), text: (leg.full_text || "").slice(0, 60) };
  }).filter(Boolean);
  
  console.log(`✅ Original tweets: ${tweets.length}`);

  // 3. Fetch replies in parallel (3 at a time)
  const replyCounts = {};
  let total = 0;

  for (let i = 0; i < tweets.length; i += 3) {
    const batch = tweets.slice(i, i + 3);
    const results = await Promise.allSettled(batch.map(async (tweet) => {
      const dVars = encodeURIComponent(JSON.stringify({
        focalTweetId: tweet.id, referrer: "tweet", count: 40,
        with_rux_injections: false, includePromotedContent: true, withCommunity: true,
        withQuickPromoteEligibilityTweetFields: true, withBirdwatchNotes: true, withVoice: true,
      }));
      const dRes = await fetch(`https://api.x.com/graphql/rU08O-YiXdr0IZfE7qaUMg/TweetDetail?variables=${dVars}&features=${GQL_FEATURES}&fieldToggles=${FIELD_TOGGLES}`, { headers: HEADERS });
      if (!dRes.ok) return { tweetId: tweet.id, repliers: [] };
      const dData = await dRes.json();
      const dInsts = dData?.data?.threaded_conversation_with_injections_v2?.instructions ?? [];
      const dAdd = dInsts.find(j => j.type === "TimelineAddEntries");
      const repliers = [];
      for (const entry of (dAdd?.entries ?? [])) {
        const items = entry.content?.items ?? [];
        const all = [
          entry.content?.itemContent?.tweet_results?.result,
          ...items.map(it => it.item?.itemContent?.tweet_results?.result),
        ].filter(Boolean);
        for (const r of all) {
          const leg = r?.legacy ?? r?.tweet?.legacy;
          if (leg?.in_reply_to_status_id_str !== tweet.id) continue;
          const cu = r?.core?.user_results?.result ?? r?.tweet?.core?.user_results?.result;
          const h = cu?.core?.screen_name ?? cu?.legacy?.screen_name;
          if (h && h.toLowerCase() !== TARGET) repliers.push(h.toLowerCase());
        }
      }
      return { tweetId: tweet.id, repliers };
    }));

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === "rejected") continue;
      const { repliers } = results[j].value;
      for (const h of repliers) {
        if (!replyCounts[h]) replyCounts[h] = { count: 0, tweets: new Set() };
        replyCounts[h].count++;
        replyCounts[h].tweets.add(batch[j].id);
        total++;
      }
    }
    if (i + 3 < tweets.length) await new Promise(r => setTimeout(r, 400));
    process.stdout.write(`  Batch ${Math.floor(i/3)+1}/${Math.ceil(tweets.length/3)} done...\r`);
  }

  console.log(`\n✅ Total replies collected: ${total}`);

  // 4. Rank
  const ranked = Object.entries(replyCounts)
    .map(([u, d]) => ({ user: u, replies: d.count, tweets: d.tweets.size }))
    .sort((a, b) => b.replies - a.replies)
    .slice(0, 5);

  console.log(`\n🏆 TOP REPLY GUYS FOR @${TARGET}:`);
  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
  for (let i = 0; i < ranked.length; i++) {
    const rg = ranked[i];
    const dom = total > 0 ? Math.round(rg.replies / total * 100) : 0;
    console.log(`  ${medals[i]} @${rg.user} — ${rg.replies} replies across ${rg.tweets} tweets (${dom}% dominance)`);
  }

  if (ranked.length === 0) console.log("  No reply guys found. The tweets may have 0 replies.");

  console.log(`\n⏱  Total time: ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

run().catch(e => console.error("❌", e.message));
