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

  const newsContext = (news || []).slice(0, 15)
    .map((a) => `[${a.source}] ${a.title} (sentiment: ${a.sentiment?.score?.toFixed(2) || "?"}, symbols: ${a.symbols?.join(",") || "none"})`)
    .join("\n");

  const portfolioList = (portfolio || []).join(", ");
  const watchlistList = (watchlist || []).join(", ");

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const prompt = `You are a top stock market analyst for StockPulse. Today is ${today}.

The user already owns: ${portfolioList || "nothing yet"}
The user is already watching: ${watchlistList || "nothing yet"}

Here is today's news the user can already see:
${newsContext || "No news loaded yet"}

YOUR JOB: Find 5 NEW stock opportunities the user is NOT already tracking. Look beyond their current portfolio and watchlist. Think about:
- Stocks making big moves today based on earnings, upgrades, new products, partnerships
- Sectors gaining momentum (AI, energy, biotech, defense, etc.)
- Undervalued plays with upcoming catalysts
- Breakout candidates with strong technical setups

Use your knowledge of current market conditions and recent events to find fresh opportunities.

DO NOT recommend stocks that are in their portfolio (${portfolioList}) or watchlist (${watchlistList}). These are stocks they already know about.

RESPOND WITH VALID JSON ONLY — no markdown, no backticks, just raw JSON:
{
  "picks": [
    {
      "symbol": "SYMBOL",
      "name": "Full Company Name",
      "action": "BUY",
      "confidence": "HIGH",
      "reason": "Why buy — one clear sentence",
      "catalyst": "What specific event or trend is driving this",
      "sector": "Technology"
    }
  ],
  "market_outlook": "One sentence on today's overall market mood and direction",
  "theme": "The common theme or trend connecting today's picks",
  "avoid": ["SYMBOL1"],
  "avoid_reason": "Brief reason to stay away from these right now"
}

RULES:
- Exactly 5 picks, all DIFFERENT from portfolio and watchlist
- Mix of sectors — don't give 5 tech stocks
- Confidence: HIGH (clear catalyst + momentum), MEDIUM (promising setup), SPECULATIVE (high risk/reward)
- At least 1 should be a lesser-known name, not a mega-cap everyone knows
- Include 1-2 stocks to AVOID with reason
- Be specific and actionable — reference real events, earnings, upgrades, not vague statements`;

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
        max_tokens: 2000,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
          },
        ],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();

    // Extract text from response (may have multiple content blocks with web search)
    let fullText = "";
    for (const block of data.content || []) {
      if (block.type === "text") {
        fullText += block.text;
      }
    }

    if (!fullText) {
      console.error("[DailyPicks] No text in response:", JSON.stringify(data).slice(0, 500));
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    // Parse JSON from response
    try {
      const picks = JSON.parse(fullText);
      return NextResponse.json(picks);
    } catch {
      const match = fullText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return NextResponse.json(JSON.parse(match[0]));
        } catch {}
      }
      console.error("[DailyPicks] Parse error, raw:", fullText.slice(0, 500));
      return NextResponse.json({ error: "Failed to parse picks" }, { status: 500 });
    }
  } catch (error) {
    console.error("[DailyPicks] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
