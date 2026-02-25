import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

// Fetch live quotes from Yahoo
async function getYahooQuotes(symbols) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(",")}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const results = {};
    for (const q of data.quoteResponse?.result || []) {
      if (q.regularMarketPrice) {
        results[q.symbol] = {
          price: q.regularMarketPrice,
          change: q.regularMarketChange || 0,
          changePct: q.regularMarketChangePercent || 0,
          name: q.shortName || q.symbol,
        };
      }
    }
    return results;
  } catch { return {}; }
}

export async function GET(request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "No API key" }, { status: 503 });
  }

  try {
    // Get all portfolio + watchlist symbols across all users
    const [{ data: portfolioItems }, { data: watchlistItems }] = await Promise.all([
      supabaseAdmin.from("portfolio").select("symbol").limit(100),
      supabaseAdmin.from("watchlist").select("symbol").limit(100),
    ]);

    const portfolioSymbols = [...new Set((portfolioItems || []).map(p => p.symbol))];
    const watchlistSymbols = [...new Set((watchlistItems || []).map(w => w.symbol))];
    const allTracked = [...new Set([...portfolioSymbols, ...watchlistSymbols])];

    // Get live market data for context
    const marketQuotes = await getYahooQuotes(["SPY", "QQQ", "DIA", ...allTracked.slice(0, 20)]);

    const marketContext = Object.entries(marketQuotes)
      .map(([s, q]) => `${s} (${q.name}): $${q.price.toFixed(2)} ${q.change >= 0 ? "+" : ""}${q.change.toFixed(2)} (${q.changePct.toFixed(2)}%)`)
      .join("\n");

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
      timeZone: "America/New_York"
    });

    const prompt = `You are a top stock analyst generating pre-market discoveries for StockPulse. Today is ${today}.

CURRENT MARKET DATA:
${marketContext || "Markets not yet open"}

Users are already tracking: ${allTracked.join(", ") || "nothing"}

Find 5 NEW stock opportunities NOT in the tracked list. Consider:
- Pre-market movers and overnight developments
- Earnings coming this week
- Sector momentum shifts
- Undervalued plays with upcoming catalysts
- Breakout candidates

RESPOND WITH VALID JSON ONLY:
{
  "picks": [
    {
      "symbol": "TICKER",
      "name": "Full Company Name",
      "action": "BUY",
      "confidence": "HIGH",
      "current_price": 150.25,
      "target_price": 185.00,
      "upside_pct": 23.1,
      "dividend_yield": 1.8,
      "reason": "Why buy — one clear sentence",
      "catalyst": "Specific event or trend driving this",
      "sector": "Technology"
    }
  ],
  "market_outlook": "One sentence on today's market direction",
  "theme": "Common theme connecting today's picks",
  "avoid": ["SYMBOL1"],
  "avoid_reason": "Brief reason to avoid"
}

RULES:
- 5 picks, all DIFFERENT from tracked list
- Accurate current prices from your knowledge
- Mix of sectors
- At least 1 lesser-known name
- Be specific — reference real events, earnings, upgrades`;

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
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    let fullText = "";
    for (const block of data.content || []) {
      if (block.type === "text") fullText += block.text;
    }

    // Clean markup
    fullText = fullText
      .replace(/<\/?antml:cite[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\[\d+\]/g, "");

    // Parse JSON
    let picks;
    try {
      const cleaned = fullText.replace(/```json\n?|```/g, "").trim();
      picks = JSON.parse(cleaned);
    } catch {
      const start = fullText.indexOf("{");
      const end = fullText.lastIndexOf("}");
      if (start !== -1 && end > start) {
        picks = JSON.parse(fullText.slice(start, end + 1));
      }
    }

    if (!picks) {
      return NextResponse.json({ error: "Failed to parse picks" }, { status: 500 });
    }

    // Store in Supabase — create table if needed via upsert to a general cache table
    // We'll use a simple key-value approach in the aggregation_log or a dedicated cache
    await supabaseAdmin.from("daily_cache").upsert({
      key: "discoveries",
      value: JSON.stringify(picks),
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

    console.log("[Discoveries Cron] Generated", picks.picks?.length || 0, "picks");

    return NextResponse.json({
      success: true,
      picks: picks.picks?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Discoveries Cron] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
