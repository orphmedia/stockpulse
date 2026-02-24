import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function cleanText(str) {
  if (!str || typeof str !== "string") return str || "";
  return str
    .replace(/<\/?antml:cite[^>]*>/gi, "")
    .replace(/<\/?cite[^>]*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/【[^】]*】/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/&[a-z]+;/gi, " ")
    .trim();
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const { message, history, prices, news, signals, watchlist, portfolio, socialData } = await request.json();

  try {
    const userName = session.user?.name || "there";
    const userEmail = session.user?.email || "";
    const first = userName.split(" ")[0];

    // Fetch portfolio/watchlist if not passed
    let portfolioData = portfolio || [];
    if (!portfolioData.length) {
      const { data } = await supabaseAdmin.from("portfolio").select("*").eq("user_id", session.user.id);
      portfolioData = data || [];
    }
    let watchlistData = watchlist || [];
    if (!watchlistData.length || (watchlistData.length > 0 && typeof watchlistData[0] === "string")) {
      const { data } = await supabaseAdmin.from("watchlist").select("*").eq("user_id", session.user.id);
      watchlistData = data || [];
    }

    // Build context strings
    const priceCtx = Object.entries(prices || {}).map(([s, p]) => `${s}: $${p.price?.toFixed(2)}`).join(", ");
    const newsCtx = (news || []).slice(0, 8).map((a) => `"${a.title}" (${a.source})`).join("; ");

    const portfolioCtx = portfolioData.map((h) => {
      const cp = prices?.[h.symbol]?.price;
      const pl = cp ? ((cp - h.avg_cost) / h.avg_cost * 100).toFixed(1) : "?";
      return `${h.symbol}: ${h.shares} shares @ $${h.avg_cost?.toFixed(2)}${cp ? ` now $${cp.toFixed(2)} (${pl}%)` : ""}`;
    }).join("; ");

    const totalVal = portfolioData.reduce((s, h) => s + (prices?.[h.symbol]?.price ? h.shares * prices[h.symbol].price : 0), 0);
    const totalCost = portfolioData.reduce((s, h) => s + (h.shares || 0) * (h.avg_cost || 0), 0);

    const watchCtx = watchlistData.map((w) => `${w.symbol}${prices?.[w.symbol]?.price ? `: $${prices[w.symbol].price.toFixed(2)}` : ""}`).join(", ");

    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    const systemPrompt = `You are StockPulse AI, ${first}'s personal trading assistant. Today is ${today}.

PORTFOLIO: ${portfolioCtx || "Empty"}${totalVal > 0 ? ` | Total: $${totalVal.toFixed(0)}, P/L: ${totalVal - totalCost >= 0 ? "+" : ""}$${(totalVal - totalCost).toFixed(0)}` : ""}
WATCHLIST: ${watchCtx || "Empty"}
PRICES: ${priceCtx || "None"}

Be conversational and concise — 2-4 sentences max. Give direct BUY/SELL/HOLD opinions. Use ${first}'s name sometimes. No HTML or markdown.

When discussing a stock, add at end: <action type="show_stock" symbol="X" name="Name" sector="S" price="0" targetPrice="0" dividend="0" confidence="HIGH" catalyst="reason"/>
For watchlist: <action type="add_to_watchlist" symbol="X" name="Name" sector="S"/>
For portfolio: <action type="add_to_portfolio" symbol="X" shares="N" avg_cost="N" name="Name" sector="S"/>
For removing: <action type="remove_from_watchlist" symbol="X"/> or <action type="remove_from_portfolio" symbol="X"/>`;

    // Build messages - ensure alternation
    const apiMessages = [];
    if (history?.length > 0) {
      let lastRole = null;
      for (const msg of history) {
        if (msg.role === lastRole) continue;
        apiMessages.push({ role: msg.role, content: msg.content });
        lastRole = msg.role;
      }
    }
    // Ensure we don't have two user messages in a row
    if (apiMessages.length > 0 && apiMessages[apiMessages.length - 1].role === "user") {
      apiMessages.pop();
    }
    apiMessages.push({ role: "user", content: message });

    // Only search when user needs CURRENT external data
    const needsSearch = /\b(news|today|latest|current|recent|right now|this week|price of|how.*(doing|performing)|what.*(happening|going on)|market|earnings|analyst|upgrade|downgrade|ipo|fda|fed |rate cut|rate hike)\b/i.test(message);

    console.log("[AI Chat] msgs:", apiMessages.length, "search:", needsSearch, "msg:", message.slice(0, 50));

    const body = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      system: systemPrompt,
      messages: apiMessages,
    };
    if (needsSearch) {
      body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (data.error) {
      console.error("[AI Chat] API error:", JSON.stringify(data.error));
      return NextResponse.json({ response: `Sorry ${first}, hit a technical issue. Ask me again?`, actions: [] });
    }

    // Extract all text blocks
    let rawText = "";
    for (const block of data.content || []) {
      if (block.type === "text" && block.text) {
        rawText += block.text;
      }
    }

    console.log("[AI Chat] Response length:", rawText.length, "stop:", data.stop_reason);

    if (!rawText) {
      console.error("[AI Chat] Empty response. Full data:", JSON.stringify(data).slice(0, 1000));
      return NextResponse.json({ response: `Let me try that again, ${first}. What were you asking about?`, actions: [] });
    }

    // Parse action tags from response
    const actions = [];
    const actionRegex = /<action\s+([^/>]+)\/?\s*>/gi;
    let match;
    while ((match = actionRegex.exec(rawText)) !== null) {
      const attrs = {};
      const attrRegex = /(\w+)="([^"]*)"/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(match[1])) !== null) {
        attrs[attrMatch[1]] = attrMatch[2];
      }
      if (attrs.type) {
        // Convert numeric strings
        if (attrs.price) attrs.price = parseFloat(attrs.price);
        if (attrs.targetPrice) attrs.targetPrice = parseFloat(attrs.targetPrice);
        if (attrs.dividend) attrs.dividend = parseFloat(attrs.dividend);
        if (attrs.shares) attrs.shares = parseFloat(attrs.shares);
        if (attrs.avg_cost) attrs.avg_cost = parseFloat(attrs.avg_cost);
        actions.push(attrs);
      }
    }

    // Remove action tags from displayed text
    let responseText = rawText.replace(/<action\s+[^>]*\/?\s*>/gi, "").trim();

    // Clean any remaining markup
    responseText = cleanText(responseText);

    // Remove empty lines at end
    responseText = responseText.replace(/\n{3,}/g, "\n\n").trim();

    return NextResponse.json({ response: responseText, actions });
  } catch (error) {
    console.error("[AI Chat] Crash:", error.message, error.stack?.slice(0, 300));
    return NextResponse.json({ response: "Something went wrong on my end. Try asking again?", actions: [] });
  }
}
