import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const { message, prices, news, signals, watchlist } = await request.json();

  try {
    // Build market context
    const priceContext = Object.entries(prices || {})
      .map(([sym, p]) => `${sym}: $${p.price?.toFixed(2)} (bid: $${p.bid?.toFixed(2)}, ask: $${p.ask?.toFixed(2)})`)
      .join("\n");

    const newsContext = (news || [])
      .slice(0, 10)
      .map((a) => `- "${a.title}" (${a.source}, sentiment: ${a.sentiment?.score?.toFixed(2) || "n/a"})`)
      .join("\n");

    const signalContext = Object.entries(signals || {})
      .map(([sym, s]) => `${sym}: sentiment ${s.avgScore?.toFixed(2)}, ${s.articleCount} articles, trend: ${s.trend}`)
      .join("\n");

    const watchlistContext = (watchlist || [])
      .map((w) => `${w.symbol} (${w.name})`)
      .join(", ");

    const systemPrompt = `You are StockPulse AI, a conversational financial assistant built into a stock dashboard. You are direct, sharp, and conversational — not corporate. You have real-time access to market data.

CURRENT MARKET DATA:
${priceContext || "No price data available"}

RECENT NEWS:
${newsContext || "No recent news"}

SENTIMENT SIGNALS:
${signalContext || "No signals"}

USER'S CURRENT WATCHLIST:
${watchlistContext || "Empty watchlist"}

CAPABILITIES — You can take these actions by including them in your response JSON:
1. ADD stocks to watchlist: include action {type: "add_to_watchlist", symbol: "CSCO", name: "Cisco Systems", sector: "Technology"}
2. REMOVE stocks from watchlist: include action {type: "remove_from_watchlist", symbol: "TSLA"}
3. Analyze any stock based on news and sentiment
4. Recommend top 10 watchlists
5. Identify gainers and losers
6. Give market commentary

RESPONSE FORMAT — Always respond with valid JSON only, no markdown fences:
{
  "response": "Your conversational message to the user",
  "actions": [] 
}

The "actions" array should contain action objects when the user asks to add/remove stocks. Leave it empty [] when no action is needed.

IMPORTANT:
- Be conversational and direct, like a sharp trading buddy
- When asked to add a stock, confirm what you're adding and include the action
- When asked for a top 10, give thoughtful picks with brief reasoning
- When analyzing, reference actual news headlines and sentiment data
- Keep responses concise — 2-4 paragraphs max
- Never say you can't access real-time data — you have it above`;

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
        system: systemPrompt,
        messages: [{ role: "user", content: message }],
      }),
    });

    const data = await res.json();
    const rawResponse = data.content?.[0]?.text || "";

    // Parse response
    let parsed;
    try {
      const cleaned = rawResponse.replace(/```json\n?|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // If not valid JSON, treat as plain text response
      parsed = { response: rawResponse, actions: [] };
    }

    return NextResponse.json({
      response: parsed.response || rawResponse,
      actions: parsed.actions || [],
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
