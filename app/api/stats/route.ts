import { NextResponse } from "next/server";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

// Fail-safe Redis initialization
const redis = process.env.REDIS_URL || process.env.KV_URL
  ? new Redis(process.env.REDIS_URL || process.env.KV_URL!)
  : null;

export async function GET() {
  if (!redis) {
    return NextResponse.json({ totalSearches: 0, trending: [], wallOfFame: [] });
  }

  try {
    // 1. Get total searches
    const totalSearches = parseInt(await redis.get("global:total_searches") || "0", 10);

    // 2. Get top 5 trending (Sorted Set)
    const trendingList = await redis.zrevrange("trending:handles", 0, 4);

    // 3. Get Wall of Fame (Hash)
    const rawWall = await redis.hgetall("wall_of_fame:data") || {};
    const wallOfFame = Object.entries(rawWall)
      .map(([handle, data]: [string, string]) => {
        const parsed = JSON.parse(data);
        return {
          target: handle,
          top_guy: parsed.top_guy,
          count: parsed.count
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 3); // Top 3 legends

    return NextResponse.json({
      totalSearches,
      trending: trendingList,
      wallOfFame
    });
  } catch (err) {
    console.error("[Stats API] Error:", err);
    return NextResponse.json({ 
      totalSearches: 0, 
      trending: ["medusaonchain", "mayamaster", "okiewins"], // fallback
      wallOfFame: [] 
    });
  }
}
