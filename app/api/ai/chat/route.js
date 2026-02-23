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

  const { message, prices, news, signals, watchlist, socialData } = await request.json();

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

    const socialContext = socialData?.posts
      ? socialData.posts.slice(0, 8).map((p) =>
        `[${p.platform}] "${p.title}" (${p.symbols?.join(",")}, sentiment: ${p.sentiment?.score?.toFixed(2) || "n/a"}, engagement: ${p.engagement || 0})`
      ).join("\n")
      : "No social data available";

    const socialSummary = socialData?.aggregated
      ? Object.entries(socialData.aggregated).map(([sym, data]) =>
        `${sym}: ${data.totalPosts} social posts, avg sentiment ${data.avgSentiment?.toFixed(2) || 0}`
      ).join("\n")
      : "";

    const systemPrompt = `You are StockPulse AI, a conversational financial assistant built into a stock dashboard. You are direct, sharp, and conversational — not corporate. You have real-time access to market data.

CURRENT MARKET DATA:
${priceContext || "No price data available"}

RECENT NEWS:
${newsContext || "No recent news"}

SENTIMENT SIGNALS:
${signalContext || "No signals"}

USER'S CURRENT WATCHLIST:
${watchlistContext || "Empty watchlist"}

SOCIAL MEDIA SENTIMENT:
${socialContext}

SOCIAL SUMMARY BY STOCK:
${socialSummary}

CAPABILITIES — You can take these actions by including them in your response JSON:
1. ADD stocks to watchlist: include action {type: "add_to_watchlist", symbol: "CSCO", name: "Cisco Systems", sector: "Technology"}
2. REMOVE stocks from watchlist: include action {type: "remove_from_watchlist", symbol: "TSLA"}
3. ADD to portfolio: include action {type: "add_to_portfolio", symbol: "AAPL", shares: 50, avg_cost: 185.00, name: "Apple Inc.", sector: "Technology"}
4. REMOVE from portfolio: include action {type: "remove_from_portfolio", symbol: "TSLA"}
5. MONITOR a stock: include action {type: "monitor", symbol: "NVDA", name: "NVIDIA Corp.", sector: "Technology"} — this adds it to watchlist with monitoring
6. Analyze any stock based on news, social media sentiment, and price data
7. Recommend top 10 watchlists
8. Identify gainers and losers
9. Give market commentary with social sentiment insights

RESPONSE FORMAT — Always respond with valid JSON only, no markdown fences:
{
  "response": "Your conversational message to the user",
  "actions": [] 
}

The "actions" array should contain action objects when the user asks to add/remove stocks. Leave it empty [] when no action is needed.

IMPORTANT:
- Be conversational and direct, like a sharp trading buddy
- When asked to add a stock, confirm what you're adding and include the action
- When asked to add to portfolio, ask for shares and cost if not provided, then include the action
- When asked to monitor, add to watchlist and confirm you'll track it
- When asked for a top 10, give thoughtful picks with brief reasoning
- When analyzing, reference actual news headlines, social media sentiment, and price data
- When social data is available, mention Reddit/Twitter buzz and sentiment
- Keep responses concise — 2-4 paragraphs max
- You can execute multiple actions in one response (e.g., add 5 stocks at once)
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
