import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const maxDuration = 30;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ANTHROPIC_API_KEY) return NextResponse.json({ error: "No API key" }, { status: 503 });

  const { holdings } = await request.json();
  if (!holdings || holdings.length === 0) {
    return NextResponse.json({ error: "No holdings provided" }, { status: 400 });
  }

  const holdingsSummary = holdings.map((h) => {
    const pl = h.price && h.avg_cost ? ((h.price - h.avg_cost) / h.avg_cost * 100).toFixed(1) : "N/A";
    return `${h.symbol}: price=$${h.price?.toFixed(2) || "?"}, day=${h.changePct >= 0 ? "+" : ""}${h.changePct?.toFixed(2) || 0}%, P/L=${pl}%, analyst=${h.analystRating || "none"}, target=$${h.targetMean || "?"}, shares=${h.shares}`;
  }).join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `You are a concise stock analyst. Given this portfolio, provide 3-5 actionable moves for TODAY. Each move must be one line with this exact format:
ACTION | SYMBOL | brief reason (under 12 words)

ACTION must be one of: BUY, SELL, HOLD, TRIM, ADD

Rules:
- Focus on the most important moves based on day performance, analyst ratings, P/L, and targets
- If a stock is near analyst target with big gains, suggest TRIM or SELL
- If analyst rating is Strong Buy and price is below target, suggest ADD or HOLD
- If a stock is significantly down today, evaluate if it's a buying opportunity (ADD) or warning (TRIM)
- HOLD is valid when a stock is performing well with good analyst support
- Be decisive, not wishy-washy

PORTFOLIO:
${holdingsSummary}

Respond ONLY with the action lines, nothing else.`,
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[DailyMoves] API error:", err);
      return NextResponse.json({ error: "AI request failed" }, { status: 500 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";

    // Parse the response into structured moves
    const moves = text.split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length >= 3) {
          return {
            action: parts[0].toUpperCase().replace(/[^A-Z]/g, ""),
            symbol: parts[1].toUpperCase().replace(/[^A-Z]/g, ""),
            reason: parts.slice(2).join(" — "),
          };
        }
        return null;
      })
      .filter(Boolean)
      .slice(0, 5);

    return NextResponse.json({ moves });
  } catch (e) {
    console.error("[DailyMoves] Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
