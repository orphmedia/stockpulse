import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const maxDuration = 60;

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Clean any code/markdown artifacts from text fields
function sanitizePicks(data) {
  if (!data?.picks) return data;
  data.picks = data.picks.map((pick) => ({
    ...pick,
    reason: cleanText(pick.reason),
    catalyst: cleanText(pick.catalyst),
    name: cleanText(pick.name),
    sector: cleanText(pick.sector),
    current_price: Number(pick.current_price) || 0,
    target_price: Number(pick.target_price) || 0,
    upside_pct: Number(pick.upside_pct) || 0,
    dividend_yield: Number(pick.dividend_yield) || 0,
  }));
  if (data.market_outlook) data.market_outlook = cleanText(data.market_outlook);
  if (data.theme) data.theme = cleanText(data.theme);
  if (data.avoid_reason) data.avoid_reason = cleanText(data.avoid_reason);
  return data;
}

function cleanText(str) {
  if (!str || typeof str !== "string") return str || "";
  return str
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/<\/?antml:cite[^>]*>/gi, "")
    .replace(/<\/?cite[^>]*>/gi, "")
    .replace(/<\/?(source|ref|footnote|sup|sub|a|span|div|p|br|b|i|em|strong)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[?\d+\]?†?source/gi, "")
    .replace(/【[^】]*】/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
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
      "current_price": 150.25,
      "target_price": 185.00,
      "upside_pct": 23.1,
      "dividend_yield": 1.8,
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
- ALWAYS include current_price (recent trading price), target_price (12-month analyst target or your projection), upside_pct, and dividend_yield (0 if none)
- Use your knowledge of real stock prices — be accurate. Search the web if unsure.
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

    if (data.error) {
      console.error("[DailyPicks] API error:", JSON.stringify(data.error));
    }

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

    // Strip ALL markup from raw text before parsing JSON
    fullText = fullText
      .replace(/<\/?antml:cite[^>]*>/gi, "")
      .replace(/<\/?cite[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\[\d+\]/g, "");

    // Parse JSON from response — strip any non-JSON text
    try {
      const cleaned = fullText.replace(/```json\n?|```/g, "").trim();
      const picks = JSON.parse(cleaned);
      return NextResponse.json(sanitizePicks(picks));
    } catch {
      // Find the outermost JSON object
      const start = fullText.indexOf("{");
      const end = fullText.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        try {
          const jsonStr = fullText.slice(start, end + 1);
          const picks = JSON.parse(jsonStr);
          return NextResponse.json(sanitizePicks(picks));
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
