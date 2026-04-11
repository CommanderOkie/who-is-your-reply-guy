import { NextRequest, NextResponse } from "next/server";
import { analyzeReplyGuys } from "@/lib/twitter";

export const maxDuration = 60; // Vercel Pro: up to 300s. Hobby: 10s (set TWEETS_TO_ANALYZE=3 if on hobby)
export const runtime = "nodejs";

// Simple per-IP rate limiting (in-memory, resets on cold start)
const ipRequestLog = new Map<string, number[]>();
const MAX_REQUESTS_PER_IP = 20;  // Increased to 20 to stop blocking users testing multiple devices on one Wi-Fi
const WINDOW_MS = 60 * 1000;      // per 60 seconds

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (ipRequestLog.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= MAX_REQUESTS_PER_IP) return true;
  ipRequestLog.set(ip, [...timestamps, now]);
  return false;
}

// Global in-memory queue to limit simultaneous scraping (per Vercel instance)
let activeScrapes = 0;
let waitlistCount = 0;
const MAX_CONCURRENT_SCRAPES = 2; // restored to 2 active scrapes as traffic settles

export async function POST(request: NextRequest) {
  // IP-based rate limiting
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

  // --- HTTP 202 WAITLIST PROTOCOL ---
  const isRetry = request.headers.get("x-is-retry") === "true";

  if (activeScrapes >= MAX_CONCURRENT_SCRAPES) {
    // Only increment waitlist if it's the first time entering the queue
    if (!isRetry) waitlistCount++;
    
    // Safety clamp: don't show absurd numbers if instances diverge
    const displayPos = Math.min(waitlistCount, 12); 
    return NextResponse.json({ queued: true, position: displayPos }, { status: 202 });
  }
  
  if (!isRetry && waitlistCount > 0) waitlistCount--;
  activeScrapes++;

  try {
    const result = await analyzeReplyGuys(username.trim());
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Analysis failed.";
    
    if (message === "TWITTER_COOKIES_NOT_SET") {
      return NextResponse.json({ error: "The server isn't configured yet — cookies not set." }, { status: 503 });
    }
    if (message === "RATE_LIMITED") {
      return NextResponse.json({ error: "X is rate-limiting our requests right now 🚦 The analysis might have partial data. Try again in a minute." }, { status: 429 });
    }
    if (message === "AUTH_FAILED") {
      return NextResponse.json({ error: "Authentication failed — the burner account cookies may have expired. 🔑" }, { status: 401 });
    }
    if (message.includes("not found") || message.includes("suspended")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("private") || message.includes("no recent posts")) {
      return NextResponse.json({ error: message }, { status: 422 });
    }

    console.error("[analyze] Error:", message);
    return NextResponse.json({ error: `Analysis failed: ${message}` }, { status: 500 });
  } finally {
    activeScrapes--;
  }
}
