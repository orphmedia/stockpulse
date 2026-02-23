import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const { message, history, prices, news, signals, watchlist, portfolio, socialData } = await request.json();

  try {
    // ═══ GET USER IDENTITY ═══
    const userName = session.user?.name || "there";
    const userEmail = session.user?.email || "";

    // Fetch full portfolio from DB if not passed
    let portfolioData = portfolio || [];
    if (portfolioData.length === 0) {
      const { data } = await supabaseAdmin
        .from("portfolio")
        .select("*")
        .eq("user_id", session.user.id);
      portfolioData = data || [];
    }

    // Fetch full watchlist from DB if not passed
    let watchlistData = watchlist || [];
    if (watchlistData.length === 0 || (watchlistData.length > 0 && typeof watchlistData[0] === "string")) {
      const { data } = await supabaseAdmin
        .from("watchlist")
        .select("*")
        .eq("user_id", session.user.id);
      watchlistData = data || [];
    }

    // ═══ BUILD CONTEXT ═══
    const priceContext = Object.entries(prices || {})
      .map(([sym, p]) => `${sym}: $${p.price?.toFixed(2)} (bid: $${p.bid?.toFixed(2)}, ask: $${p.ask?.toFixed(2)})`)
      .join("\n");

    const newsContext = (news || []).slice(0, 10)
      .map((a) => `- "${a.title}" (${a.source}, sentiment: ${a.sentiment?.score?.toFixed(2) || "n/a"})`)
      .join("\n");

    const signalContext = Object.entries(signals || {})
      .map(([sym, s]) => `${sym}: sentiment ${s.avgScore?.toFixed(2)}, ${s.articleCount} articles, trend: ${s.trend}`)
      .join("\n");

    // Portfolio with P/L calculations
    const portfolioContext = portfolioData.map((h) => {
      const currentPrice = prices?.[h.symbol]?.price;
      const costBasis = (h.shares || 0) * (h.avg_cost || 0);
      const currentValue = currentPrice ? (h.shares || 0) * currentPrice : null;
      const pl = currentValue && costBasis ? currentValue - costBasis : null;
      const plPct = pl && costBasis ? ((pl / costBasis) * 100).toFixed(1) : null;
      return `${h.symbol} (${h.name || "?"}): ${h.shares} shares @ $${h.avg_cost?.toFixed(2)} avg cost${
        currentPrice ? ` → now $${currentPrice.toFixed(2)}` : ""}${
        pl !== null ? ` | P/L: ${pl >= 0 ? "+" : ""}$${pl.toFixed(2)} (${plPct}%)` : ""
      } [sector: ${h.sector || "?"}]`;
    }).join("\n");

    const totalValue = portfolioData.reduce((sum, h) => {
      const p = prices?.[h.symbol]?.price;
      return sum + (p ? h.shares * p : 0);
    }, 0);
    const totalCost = portfolioData.reduce((sum, h) => sum + (h.shares || 0) * (h.avg_cost || 0), 0);
    const totalPL = totalValue - totalCost;

    const watchlistContext = watchlistData
      .map((w) => {
        const p = prices?.[w.symbol]?.price;
        return `${w.symbol} (${w.name || "?"})${p ? `: $${p.toFixed(2)}` : ""}`;
      })
      .join(", ");

    const socialContext = socialData?.posts
      ? socialData.posts.slice(0, 8).map((p) =>
        `[${p.platform}] "${p.title}" (${p.symbols?.join(",")}, sentiment: ${p.sentiment?.score?.toFixed(2) || "n/a"})`
      ).join("\n")
      : "";

    const socialSummary = socialData?.aggregated
      ? Object.entries(socialData.aggregated).map(([sym, data]) =>
        `${sym}: ${data.totalPosts} social posts, avg sentiment ${data.avgSentiment?.toFixed(2) || 0}`
      ).join("\n")
      : "";

    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    // ═══ SYSTEM PROMPT ═══
    const systemPrompt = `You are StockPulse AI — a smart, personal financial assistant. Today is ${today}.

═══ WHO YOU'RE TALKING TO ═══
Name: ${userName}
Email: ${userEmail}
Always address them by first name. You know them — this is their personal dashboard.

═══ ${userName.split(" ")[0].toUpperCase()}'S PORTFOLIO ═══
${portfolioData.length > 0 ? portfolioContext : "Empty — they haven't added any holdings yet."}
${portfolioData.length > 0 ? `\nTotal Value: $${totalValue.toFixed(2)} | Total Cost: $${totalCost.toFixed(2)} | P/L: ${totalPL >= 0 ? "+" : ""}$${totalPL.toFixed(2)} (${totalCost > 0 ? ((totalPL / totalCost) * 100).toFixed(1) : "0"}%)` : ""}
${portfolioData.length > 0 ? `Holdings: ${portfolioData.length} stocks` : ""}

═══ ${userName.split(" ")[0].toUpperCase()}'S WATCHLIST ═══
${watchlistContext || "Empty — they're not watching any stocks yet."}

═══ LIVE MARKET DATA ═══
${priceContext || "No price data available"}

═══ NEWS ═══
${newsContext || "No recent news"}

═══ SENTIMENT SIGNALS ═══
${signalContext || "No signals"}

═══ SOCIAL BUZZ ═══
${socialContext || "No social data"}
${socialSummary ? `\nSummary: ${socialSummary}` : ""}

═══ ACTIONS YOU CAN EXECUTE ═══
Include in the "actions" array of your JSON response:
1. Add to watchlist: {type: "add_to_watchlist", symbol: "CSCO", name: "Cisco Systems", sector: "Technology"}
2. Remove from watchlist: {type: "remove_from_watchlist", symbol: "TSLA"}
3. Add to portfolio: {type: "add_to_portfolio", symbol: "AAPL", shares: 50, avg_cost: 185.00, name: "Apple Inc.", sector: "Technology"}
4. Remove from portfolio: {type: "remove_from_portfolio", symbol: "TSLA"}
5. Monitor: {type: "monitor", symbol: "NVDA", name: "NVIDIA Corp.", sector: "Technology"}
6. SMS alert: {type: "send_alert", symbol: "NVDA", message: "NVDA dropped 5%", urgency: "high"}

═══ RESPONSE FORMAT ═══
ALWAYS respond with valid JSON only — no markdown fences, no backticks:
{"response": "your message", "actions": []}

═══ YOUR PERSONALITY ═══
- You're ${userName.split(" ")[0]}'s personal trading assistant. Be warm, sharp, and direct.
- You KNOW their portfolio. If they ask "how am I doing?" — tell them their P/L, best/worst performers, and give real advice.
- You KNOW their watchlist. Reference it naturally.
- When they say add/watch/track/monitor anything — ALWAYS include the action object. Saying "I'll add it" without the action does NOTHING.
- When they ask about their positions — pull from the portfolio data above and give specifics with numbers.
- If they ask "what should I buy?" — consider what they already own and suggest diversification or doubling down.
- You remember the full conversation. Reference what they said earlier.
- Use web search when you need current info beyond what's in the data above.
- Keep responses punchy — 1-3 paragraphs. No lectures.
- You can execute multiple actions at once.
- Never say you can't access real-time data — you have it.`;

    // ═══ BUILD MESSAGES ═══
    const messages = [];
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.role === "user") {
          messages.push({ role: "user", content: msg.content });
        } else if (msg.role === "assistant") {
          messages.push({
            role: "assistant",
            content: JSON.stringify({ response: msg.content, actions: [] }),
          });
        }
      }
    }
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
          { type: "web_search_20250305", name: "web_search" },
        ],
      }),
    });

    const data = await res.json();

    let rawResponse = "";
    for (const block of data.content || []) {
      if (block.type === "text") {
        rawResponse += block.text;
      }
    }

    if (!rawResponse) {
      console.error("[AI Chat] No text:", JSON.stringify(data).slice(0, 500));
      return NextResponse.json({ response: "Had trouble with that. Try again?", actions: [] });
    }

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
