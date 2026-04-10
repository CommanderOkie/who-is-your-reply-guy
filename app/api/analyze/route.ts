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
let waitlistCount = 0;
const MAX_CONCURRENT_SCRAPES = 2;

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

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (obj: any) => {
        try {
          controller.enqueue(new TextEncoder().encode(JSON.stringify(obj) + "\n"));
        } catch { /* stream closed by client */ }
      };

      waitlistCount++;
      let inQueue = true;

      try {
        let waited = 0;
        let lastReportedPos = -1;

        while (activeScrapes >= MAX_CONCURRENT_SCRAPES) {
          if (waited >= 40000) {
            enqueue({ error: "Waitlist timeout. The servers are blazing hot! 🔥 Try again in a few minutes." });
            controller.close();
            return;
          }
          if (lastReportedPos !== waitlistCount) {
             enqueue({ type: "queue", position: waitlistCount });
             lastReportedPos = waitlistCount;
          }
          await new Promise((r) => setTimeout(r, 2000));
          waited += 2000;
        }

        inQueue = false;
        waitlistCount--;
        activeScrapes++;

        try {
          enqueue({ type: "status", message: "Analyzing..." });
          const result = await analyzeReplyGuys(username.trim());
          enqueue({ type: "result", data: result });
        } finally {
          activeScrapes--;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Analysis failed.";
        
        if (message === "TWITTER_COOKIES_NOT_SET") {
          enqueue({ error: "The server isn't configured yet — cookies not set." });
        } else if (message === "RATE_LIMITED") {
          enqueue({ error: "X is rate-limiting our requests right now 🚦 The analysis might have partial data. Try again in a minute." });
        } else if (message === "AUTH_FAILED") {
          enqueue({ error: "Authentication failed — the burner account cookies may have expired. 🔑" });
        } else if (message.includes("not found") || message.includes("suspended") || message.includes("private") || message.includes("no recent posts")) {
          enqueue({ error: message });
        } else {
          console.error("[analyze] Error:", message);
          enqueue({ error: `Analysis failed: ${message}` });
        }
      } finally {
        if (inQueue) waitlistCount--;
        try { controller.close(); } catch {}
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive"
    },
  });
}
