// Script to find current X GraphQL query IDs from their JS bundles
async function findQueryIds() {
  console.log('Fetching x.com...');
  const res = await fetch('https://x.com', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });
  const html = await res.text();
  console.log('x.com status:', res.status);

  // Find main JS bundle URLs
  const bundleMatches = html.match(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/[a-zA-Z0-9._-]+\.js/g) || [];
  const bundles = [...new Set(bundleMatches)];
  console.log('Found bundles:', bundles.length);
  
  const targetOps = ['SearchTimeline', 'TweetDetail', 'UserTweets', 'UserByScreenName'];
  const found = {};

  for (const bundleUrl of bundles.slice(0, 15)) {
    try {
      const jsRes = await fetch(bundleUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const js = await jsRes.text();
      
      for (const op of targetOps) {
        if (found[op]) continue;
        // Pattern: queryId:"xxx",operationName:"OpName"
        const pattern = new RegExp('queryId:"([^"]+)",operationName:"' + op + '"');
        const m = js.match(pattern);
        if (m) {
          found[op] = m[1];
          console.log(`FOUND ${op}: ${m[1]}`);
        }
      }
      
      if (Object.keys(found).length === targetOps.length) break;
    } catch(e) {
      // skip
    }
  }
  
  console.log('\nFinal results:', JSON.stringify(found, null, 2));
}

findQueryIds().catch(console.error);
