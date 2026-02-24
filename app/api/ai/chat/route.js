import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Strip all citation/HTML markup from text
function cleanResponse(str) {
  if (!str || typeof str !== "string") return str || "";
  return str
    .replace(/<\/?antml:cite[^>]*>/gi, "")
    .replace(/<\/?cite[^>]*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/【[^】]*】/g, "")
    .replace(/\[?\d+\]?†?source/gi, "")
    .replace(/&[a-z]+;/gi, " ")
    .trim();
}

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
    // ═══ USER IDENTITY ═══
    const userName = session.user?.name || "there";
    const userEmail = session.user?.email || "";

    let portfolioData = portfolio || [];
    if (portfolioData.length === 0) {
      const { data } = await supabaseAdmin.from("portfolio").select("*").eq("user_id", session.user.id);
      portfolioData = data || [];
    }

    let watchlistData = watchlist || [];
    if (watchlistData.length === 0 || (watchlistData.length > 0 && typeof watchlistData[0] === "string")) {
      const { data } = await supabaseAdmin.from("watchlist").select("*").eq("user_id", session.user.id);
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

    const portfolioContext = portfolioData.map((h) => {
      const currentPrice = prices?.[h.symbol]?.price;
      const costBasis = (h.shares || 0) * (h.avg_cost || 0);
      const currentValue = currentPrice ? (h.shares || 0) * currentPrice : null;
      const pl = currentValue && costBasis ? currentValue - costBasis : null;
      const plPct = pl && costBasis ? ((pl / costBasis) * 100).toFixed(1) : null;
      return `${h.symbol} (${h.name || "?"}): ${h.shares} shares @ $${h.avg_cost?.toFixed(2)}${
        currentPrice ? ` → now $${currentPrice.toFixed(2)}` : ""}${
        pl !== null ? ` | P/L: ${pl >= 0 ? "+" : ""}$${pl.toFixed(2)} (${plPct}%)` : ""
      }`;
    }).join("\n");

    const totalValue = portfolioData.reduce((sum, h) => sum + (prices?.[h.symbol]?.price ? h.shares * prices[h.symbol].price : 0), 0);
    const totalCost = portfolioData.reduce((sum, h) => sum + (h.shares || 0) * (h.avg_cost || 0), 0);
    const totalPL = totalValue - totalCost;

    const watchlistContext = watchlistData
      .map((w) => `${w.symbol} (${w.name || "?"})${prices?.[w.symbol]?.price ? `: $${prices[w.symbol].price.toFixed(2)}` : ""}`)
      .join(", ");

    const socialContext = socialData?.posts
      ? socialData.posts.slice(0, 8).map((p) =>
        `[${p.platform}] "${p.title}" (${p.symbols?.join(",")}, sentiment: ${p.sentiment?.score?.toFixed(2) || "n/a"})`
      ).join("\n") : "";

    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    const systemPrompt = `You are StockPulse AI — a smart, personal financial assistant. Today is ${today}.

WHO YOU'RE TALKING TO: ${userName} (${userEmail})
Always use their first name. This is their personal dashboard.

${userName.split(" ")[0].toUpperCase()}'S PORTFOLIO:
${portfolioData.length > 0 ? portfolioContext : "Empty — no holdings yet."}
${portfolioData.length > 0 ? `Total Value: $${totalValue.toFixed(2)} | Cost: $${totalCost.toFixed(2)} | P/L: ${totalPL >= 0 ? "+" : ""}$${totalPL.toFixed(2)} (${totalCost > 0 ? ((totalPL / totalCost) * 100).toFixed(1) : "0"}%)` : ""}

${userName.split(" ")[0].toUpperCase()}'S WATCHLIST:
${watchlistContext || "Empty"}

LIVE PRICES:
${priceContext || "No data"}

NEWS:
${newsContext || "None"}

SENTIMENT:
${signalContext || "None"}

SOCIAL:
${socialContext || "None"}

ACTIONS — include in "actions" array:
1. {type: "add_to_watchlist", symbol, name, sector}
2. {type: "remove_from_watchlist", symbol}
3. {type: "add_to_portfolio", symbol, shares, avg_cost, name, sector}
4. {type: "remove_from_portfolio", symbol}
5. {type: "monitor", symbol, name, sector}
6. {type: "send_alert", symbol, message, urgency}
7. {type: "show_stock", symbol, name, sector, price, change, changePct, targetPrice, dividend, catalyst, confidence}

RESPONSE FORMAT — ALWAYS valid JSON, NO markdown fences, NO citation tags:
{"response": "your message here", "actions": []}

CRITICAL RULES:
- NEVER include HTML tags, citation tags, or markup in your response. Plain text only.
- This is primarily a VOICE conversation. Write like you're TALKING to someone — natural, conversational, not robotic.
- Keep responses concise — 2-4 sentences for simple questions, up to 2 short paragraphs for analysis.
- When discussing a specific stock or crypto, ALWAYS include a "show_stock" action with as much data as you know (price, target, dividend, catalyst, sector). This displays a visual card to the user.
- When someone says add/watch/track — ALWAYS include the action object.
- You KNOW their portfolio and watchlist. Reference it naturally.
- Remember the full conversation. Follow up on what they said.
- Don't use ** for bold — this is a voice-first interface. Write naturally.
- You can execute multiple actions at once.
- Be opinionated — give clear buy/hold/sell recommendations with reasoning.`;

    // ═══ BUILD MESSAGES ═══
    const apiMessages = [];
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.role === "user") {
          apiMessages.push({ role: "user", content: msg.content });
        } else if (msg.role === "assistant") {
          apiMessages.push({
            role: "assistant",
            content: JSON.stringify({ response: msg.content, actions: [] }),
          });
        }
      }
    }
    apiMessages.push({ role: "user", content: message });

    // ═══ API CALL — smart web search ═══
    // Only include web search for questions that need current/external data
    const needsSearch = /\b(news|today|current|latest|price|buy|sell|recommend|discover|what.*(happening|going on)|market|earnings|analyst|upgrade|downgrade)\b/i.test(message);
    const tools = needsSearch ? [{ type: "web_search_20250305", name: "web_search" }] : [];

    let finalText = "";
    let currentMessages = [...apiMessages];
    let attempts = 0;
    const maxAttempts = needsSearch ? 3 : 1;

    while (attempts < maxAttempts) {
      attempts++;

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
          messages: currentMessages,
          ...(tools.length > 0 ? { tools } : {}),
        }),
      });

      const data = await res.json();

      if (data.error) {
        console.error("[AI Chat] API error:", JSON.stringify(data.error));
        break;
      }

      // Extract text blocks
      for (const block of data.content || []) {
        if (block.type === "text" && block.text) {
          finalText += block.text;
        }
      }

      // If stop_reason is "end_turn" or we got text, we're done
      if (data.stop_reason === "end_turn" || finalText.length > 0) {
        break;
      }

      // If stop_reason is "tool_use", the model wants to search.
      // Add the assistant response and a dummy tool result to continue.
      if (data.stop_reason === "tool_use") {
        currentMessages.push({ role: "assistant", content: data.content });

        // Find tool_use blocks and provide results
        const toolResults = [];
        for (const block of data.content || []) {
          if (block.type === "tool_use") {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "Search completed. Please provide your response based on the search results.",
            });
          }
        }
        if (toolResults.length > 0) {
          currentMessages.push({ role: "user", content: toolResults });
        }
        continue;
      }

      break;
    }

    if (!finalText) {
      return NextResponse.json({
        response: "I'm having a moment — try asking again?",
        actions: [],
      });
    }

    // ═══ CLEAN AND PARSE ═══
    // Strip ALL markup before JSON parse
    let cleaned = finalText
      .replace(/<\/?antml:cite[^>]*>/gi, "")
      .replace(/<\/?cite[^>]*>/gi, "")
      .replace(/<[^>]*>/g, "")
      .replace(/\[\d+\]/g, "")
      .replace(/【[^】]*】/g, "")
      .replace(/```json\n?|```/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Extract JSON object
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        try {
          parsed = JSON.parse(cleaned.slice(start, end + 1));
        } catch {
          parsed = { response: cleanResponse(cleaned), actions: [] };
        }
      } else {
        parsed = { response: cleanResponse(cleaned), actions: [] };
      }
    }

    const responseText = cleanResponse(parsed.response || finalText);

    return NextResponse.json({
      response: responseText,
      actions: parsed.actions || [],
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return NextResponse.json({
      response: "Something went wrong on my end. Try again?",
      actions: [],
    });
  }
}
