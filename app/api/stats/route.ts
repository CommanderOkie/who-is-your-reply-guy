import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Get total searches
    const totalSearches = (await kv.get<number>("global:total_searches")) || 0;

    // 2. Get top 5 trending (Sorted Set)
    const trendingList = await kv.zrange("trending:handles", 0, 4, { rev: true, withScores: false });

    // 3. Get Wall of Fame (Hash)
    const rawWall = await kv.hgetall("wall_of_fame:data") || {};
    const wallOfFame = Object.entries(rawWall)
      .map(([handle, data]: [string, any]) => {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
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
