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

    const systemPrompt = `You are StockPulse AI, a sharp personal trading assistant. Today is ${today}.
You're talking to ${first} (${userEmail}).

THEIR PORTFOLIO: ${portfolioCtx || "Empty"}
${totalVal > 0 ? `Total: $${totalVal.toFixed(0)} | P/L: ${totalVal - totalCost >= 0 ? "+" : ""}$${(totalVal - totalCost).toFixed(0)} (${totalCost > 0 ? ((totalVal - totalCost) / totalCost * 100).toFixed(1) : 0}%)` : ""}
WATCHLIST: ${watchCtx || "Empty"}
PRICES: ${priceCtx || "None loaded"}
NEWS: ${newsCtx || "None"}

RULES:
- Talk naturally like a knowledgeable friend. This is voice-first — keep it conversational.
- Use ${first}'s name occasionally.
- Be direct with opinions. Say BUY, SELL, or HOLD.
- Keep answers to 2-5 sentences unless they ask for deep analysis.
- NEVER output HTML, markdown formatting, or citation tags.

ACTIONS: When the user asks to add/watch/track/buy stocks, include action tags at the END of your response:
<action type="add_to_watchlist" symbol="NVDA" name="NVIDIA" sector="Technology"/>
<action type="add_to_portfolio" symbol="AAPL" shares="10" avg_cost="185" name="Apple" sector="Technology"/>
<action type="remove_from_watchlist" symbol="TSLA"/>
<action type="remove_from_portfolio" symbol="META"/>
<action type="show_stock" symbol="NVDA" name="NVIDIA" sector="Technology" price="890" targetPrice="1000" dividend="0.04" confidence="HIGH" catalyst="AI demand surge"/>

ALWAYS include <action type="show_stock"...> when discussing a specific stock so the user sees a data card.
Only include action tags when actually performing an action or showing a stock. Don't include them for general chat.`;

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

    // Simple chat or search?
    const isSimple = /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|no|cool|got it|what can you do|how are you)/i.test(message.trim());

    console.log("[AI Chat] msgs:", apiMessages.length, "search:", !isSimple, "msg:", message.slice(0, 50));

    const body = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: apiMessages,
    };
    if (!isSimple) {
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
