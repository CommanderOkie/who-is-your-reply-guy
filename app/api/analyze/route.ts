import { NextRequest, NextResponse } from "next/server";
import { analyzeReplyGuys } from "@/lib/twitter";

export const maxDuration = 60; // Vercel Pro: up to 300s. Hobby: 10s (set TWEETS_TO_ANALYZE=3 if on hobby)
export const runtime = "nodejs";

// Simple per-IP rate limiting (in-memory, resets on cold start)
const ipRequestLog = new Map<string, number[]>();
const MAX_REQUESTS_PER_IP = 3;   // max 3 analyzes per window
const WINDOW_MS = 60 * 1000;     // per 60 seconds

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (ipRequestLog.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= MAX_REQUESTS_PER_IP) return true;
  ipRequestLog.set(ip, [...timestamps, now]);
  return false;
}

// Global in-memory queue to limit simultaneous scraping (per Vercel instance)
let activeScrapes = 0;
const MAX_CONCURRENT_SCRAPES = 2;

async function executeWithQueue<T>(task: () => Promise<T>): Promise<T> {
  const maxWaitMs = 25000; // wait up to 25 seconds for a slot
  let waited = 0;
  while (activeScrapes >= MAX_CONCURRENT_SCRAPES) {
    if (waited >= maxWaitMs) throw new Error("SERVER_BUSY");
    await new Promise((r) => setTimeout(r, 1000));
    waited += 1000;
  }

  activeScrapes++;
  try {
    return await task();
  } finally {
    activeScrapes--;
  }
}

export async function POST(request: NextRequest) {
  // IP-based rate limiting (protect your burner account)
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests! Please wait a moment before analyzing another account. 🐢" },
      { status: 429 }
    );
  }

  let username: string;
  try {
    const body = await request.json();
    username = body?.username;
    if (!username || typeof username !== "string") throw new Error("bad");
  } catch {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  try {
    // Await for queue slot before scraping
    const result = await executeWithQueue(() => analyzeReplyGuys(username.trim()));
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Analysis failed.";

    if (message === "TWITTER_COOKIES_NOT_SET") {
      return NextResponse.json(
        { error: "The server isn't configured yet — cookies not set." },
        { status: 503 }
      );
    }

    if (message === "SERVER_BUSY") {
      return NextResponse.json(
        { error: "Too many people are testing their reply guys right now! 🥵 Please try again in 30 seconds." },
        { status: 429 }
      );
    }

    if (message === "RATE_LIMITED") {
      return NextResponse.json(
        {
          error:
            "X is rate-limiting our requests right now 🚦 The analysis might have partial data. Try again in a minute.",
        },
        { status: 429 }
      );
    }

    if (message === "AUTH_FAILED") {
      return NextResponse.json(
        { error: "Authentication failed — the burner account cookies may have expired. 🔑" },
        { status: 401 }
      );
    }

    if (message.includes("not found") || message.includes("suspended")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message.includes("private") || message.includes("no recent posts")) {
      return NextResponse.json({ error: message }, { status: 422 });
    }

    console.error("[analyze] Error:", message);
    return NextResponse.json({ error: `Analysis failed: ${message}` }, { status: 500 });
  }
}
