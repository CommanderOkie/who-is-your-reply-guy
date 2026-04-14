import "dotenv/config";
import fetch from "node-fetch";

/**
 * COOKIE FARM DIAGNOSTIC TOOL
 * Run this to see which of your 20 burner accounts are still alive!
 * Use: node scripts/test-cookie-farm.mjs
 */

const BEARER_TOKEN = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

async function testCookie(cookie, index) {
  const ct0 = cookie.match(/ct0=([^;]+)/)?.[1]?.trim() ?? "";
  const headers = {
    Authorization: `Bearer ${BEARER_TOKEN}`,
    Cookie: cookie,
    "x-csrf-token": ct0,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };

  try {
    // Testing with a simple user lookup for @Twitter
    const url = `https://api.x.com/graphql/IGgvgiOx4QZndDHuD3x9TQ/UserByScreenName?variables=${encodeURIComponent(JSON.stringify({ screen_name: "Twitter", withSafetyModeUserFields: true }))}`;
    
    const res = await fetch(url, { headers });
    
    if (res.status === 200) {
      console.log(`[Account #${index + 1}] ✅ ACTIVE`);
      return "active";
    } else if (res.status === 429) {
      console.log(`[Account #${index + 1}] 🚦 RATE LIMITED (Resting)`);
      return "limited";
    } else if (res.status === 401 || res.status === 403) {
      console.log(`[Account #${index + 1}] ❌ EXPIRED / AUTH FAILED`);
      return "dead";
    } else {
      console.log(`[Account #${index + 1}] ⚠️ UNKNOWN ERROR (${res.status})`);
      return "error";
    }
  } catch (err) {
    console.log(`[Account #${index + 1}] 💥 NETWORK ERROR: ${err.message}`);
    return "error";
  }
}

async function runDiagnostic() {
  const c = process.env.TWITTER_COOKIES;
  if (!c) {
    console.error("No TWITTER_COOKIES found in .env.local!");
    return;
  }

  let pools = c.split(/\\n|\n/).map(l => l.trim()).filter(l => l.length > 20);
  
  // Custom logic for space-separated cookies if that's how they were pasted
  if (pools.length === 1 && pools[0].includes("auth_token=") && pools[0].split("auth_token=").length > 2) {
     const matches = c.split(/guest_id/g).filter(x => x.includes("auth_token="));
     pools = matches.map(m => "guest_id" + m);
  }

  console.log(`\n🚜 Starting Cookie Farm Diagnostic (${pools.length} accounts found)...\n`);

  let active = 0, dead = 0, limited = 0;

  for (let i = 0; i < pools.length; i++) {
    const status = await testCookie(pools[i], i);
    if (status === "active") active++;
    else if (status === "dead") dead++;
    else if (status === "limited") limited++;

    // Small delay between tests to avoid self-rate-limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log("\n--- Final Report ---");
  console.log(`✅ Active:  ${active}`);
  console.log(`🚦 Resting: ${limited}`);
  console.log(`❌ Dead:    ${dead}`);
  console.log("--------------------\n");
  
  if (dead > 0) {
    console.log("💡 Tip: Some accounts have expired. You should replace the ❌ DEAD cookies in your environment variables.");
  } else if (active === pools.length) {
    console.log("🔥 Clean sweep! All 20 accounts are ready for battle.");
  }
}

runDiagnostic();
