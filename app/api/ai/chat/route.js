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

  const { message, history, prices, news, signals, watchlist, socialData } = await request.json();

  try {
    const priceContext = Object.entries(prices || {})
      .map(([sym, p]) => `${sym}: $${p.price?.toFixed(2)} (bid: $${p.bid?.toFixed(2)}, ask: $${p.ask?.toFixed(2)})`)
      .join("\n");

    const newsContext = (news || []).slice(0, 10)
      .map((a) => `- "${a.title}" (${a.source}, sentiment: ${a.sentiment?.score?.toFixed(2) || "n/a"})`)
      .join("\n");

    const signalContext = Object.entries(signals || {})
      .map(([sym, s]) => `${sym}: sentiment ${s.avgScore?.toFixed(2)}, ${s.articleCount} articles, trend: ${s.trend}`)
      .join("\n");

    const watchlistContext = (watchlist || [])
      .map((w) => typeof w === "string" ? w : `${w.symbol} (${w.name})`)
      .join(", ");

    const socialContext = socialData?.posts
      ? socialData.posts.slice(0, 8).map((p) =>
        `[${p.platform}] "${p.title}" (${p.symbols?.join(",")}, sentiment: ${p.sentiment?.score?.toFixed(2) || "n/a"})`
      ).join("\n")
      : "No social data available";

    const socialSummary = socialData?.aggregated
      ? Object.entries(socialData.aggregated).map(([sym, data]) =>
        `${sym}: ${data.totalPosts} social posts, avg sentiment ${data.avgSentiment?.toFixed(2) || 0}`
      ).join("\n")
      : "";

    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    const systemPrompt = `You are StockPulse AI — a smart, conversational financial assistant. Today is ${today}. You talk like a sharp, knowledgeable trading buddy — not a corporate bot. You remember everything the user has said in this conversation and follow up naturally.

LIVE MARKET DATA:
${priceContext || "No price data"}

NEWS:
${newsContext || "No news"}

SENTIMENT:
${signalContext || "No signals"}

WATCHLIST: ${watchlistContext || "Empty"}

SOCIAL BUZZ:
${socialContext}
${socialSummary ? `\nSOCIAL SUMMARY:\n${socialSummary}` : ""}

ACTIONS YOU CAN EXECUTE — include in the "actions" array:
1. Add to watchlist: {type: "add_to_watchlist", symbol: "CSCO", name: "Cisco Systems", sector: "Technology"}
2. Remove from watchlist: {type: "remove_from_watchlist", symbol: "TSLA"}
3. Add to portfolio: {type: "add_to_portfolio", symbol: "AAPL", shares: 50, avg_cost: 185.00, name: "Apple Inc.", sector: "Technology"}
4. Remove from portfolio: {type: "remove_from_portfolio", symbol: "TSLA"}
5. Monitor: {type: "monitor", symbol: "NVDA", name: "NVIDIA Corp.", sector: "Technology"}
6. SMS alert: {type: "send_alert", symbol: "NVDA", message: "NVDA dropped 5%", urgency: "high"}

RESPOND WITH JSON ONLY — no markdown fences:
{"response": "your message", "actions": []}

CRITICAL:
- When the user says add/watch/track/monitor anything — ALWAYS include the action. Saying "I'll add it" without the action does NOTHING.
- You have FULL conversation history — reference earlier messages naturally. If the user said they like tech stocks 5 messages ago, remember that.
- Be conversational. Ask follow-ups. React to what they said. Don't repeat yourself.
- When recommending stocks, use your knowledge AND the live data above.
- Keep responses punchy — 1-3 paragraphs. Don't lecture.
- You can execute multiple actions at once.`;

    // Build message array with full conversation history
    const messages = [];

    // Add conversation history
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.role === "user") {
          messages.push({ role: "user", content: msg.content });
        } else if (msg.role === "assistant") {
          // Wrap assistant responses as if they were the JSON format
          messages.push({
            role: "assistant",
            content: JSON.stringify({ response: msg.content, actions: [] }),
          });
        }
      }
    }

    // Add current message
    messages.push({ role: "user", content: message });

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
        system: systemPrompt,
        messages,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
          },
        ],
      }),
    });

    const data = await res.json();

    // Extract text from response (may have web search blocks)
    let rawResponse = "";
    for (const block of data.content || []) {
      if (block.type === "text") {
        rawResponse += block.text;
      }
    }

    if (!rawResponse) {
      console.error("[AI Chat] No text response:", JSON.stringify(data).slice(0, 500));
      return NextResponse.json({
        response: "I had trouble processing that. Try again?",
        actions: [],
      });
    }

    // Parse response
    let parsed;
    try {
      const cleaned = rawResponse.replace(/```json\n?|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
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
