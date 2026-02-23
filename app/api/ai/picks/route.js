import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const { news, signals, prices, portfolio, watchlist } = await request.json();

  // Build context
  const priceContext = Object.entries(prices || {})
    .map(([sym, d]) => `${sym}: $${d.price?.toFixed(2)}`)
    .join(", ");

  const newsContext = (news || []).slice(0, 20)
    .map((a) => `[${a.source}] ${a.title} (sentiment: ${a.sentiment?.score?.toFixed(2) || "N/A"}, symbols: ${a.symbols?.join(",") || "none"})`)
    .join("\n");

  const signalContext = Object.entries(signals || {})
    .map(([sym, s]) => `${sym}: sentiment ${s.avgScore?.toFixed(2)}, ${s.articleCount} articles`)
    .join("\n");

  const portfolioContext = (portfolio || [])
    .map((h) => h.symbol)
    .join(", ");

  const watchlistContext = (watchlist || [])
    .map((w) => w.symbol || w)
    .join(", ");

  const prompt = `You are a sharp stock market analyst for StockPulse. Based on today's news, sentiment, and price data, recommend 3-5 stocks to consider buying today.

CURRENT PRICES:
${priceContext || "Not available"}

NEWS & SENTIMENT:
${newsContext || "No news available"}

SIGNAL SCORES:
${signalContext || "No signals"}

USER'S PORTFOLIO: ${portfolioContext || "Empty"}
USER'S WATCHLIST: ${watchlistContext || "Empty"}

RESPOND WITH VALID JSON ONLY — no markdown fences:
{
  "picks": [
    {
      "symbol": "NVDA",
      "name": "NVIDIA Corp.",
      "action": "BUY",
      "confidence": "HIGH",
      "reason": "One short sentence why",
      "catalyst": "What's driving this today"
    }
  ],
  "market_outlook": "One sentence on overall market mood today",
  "avoid": ["SYMBOL1"],
  "avoid_reason": "Brief reason to avoid these"
}

RULES:
- Pick 3-5 stocks with the strongest buy signals based on today's actual data
- Confidence: HIGH (strong sentiment + catalyst), MEDIUM (mixed signals), SPECULATIVE (momentum play)
- Don't just recommend what's already in their portfolio — find opportunities
- Be specific about what catalyst is driving each pick TODAY
- Include 1-2 stocks to avoid if sentiment is clearly negative
- Be direct and actionable — no fluff`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || "";

    try {
      const picks = JSON.parse(text);
      return NextResponse.json(picks);
    } catch {
      // Try to extract JSON from response
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        return NextResponse.json(JSON.parse(match[0]));
      }
      return NextResponse.json({ error: "Failed to parse picks", raw: text }, { status: 500 });
    }
  } catch (error) {
    console.error("[DailyPicks] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
