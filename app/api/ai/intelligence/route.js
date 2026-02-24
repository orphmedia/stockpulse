import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const maxDuration = 60;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Score stocks based on multiple factors
function computeScore(stock) {
  let score = 50; // base

  // Price momentum (if we have price data)
  if (stock.changePct) {
    const change = parseFloat(stock.changePct);
    if (change > 3) score += 15;
    else if (change > 1) score += 10;
    else if (change > 0) score += 5;
    else if (change < -3) score -= 10;
    else if (change < -1) score -= 5;
  }

  // Analyst upside
  if (stock.upsidePct) {
    const upside = parseFloat(stock.upsidePct);
    if (upside > 30) score += 20;
    else if (upside > 15) score += 15;
    else if (upside > 5) score += 10;
    else if (upside < -10) score -= 15;
  }

  // Sentiment
  if (stock.sentiment) {
    const s = parseFloat(stock.sentiment);
    if (s > 0.5) score += 15;
    else if (s > 0.2) score += 10;
    else if (s < -0.3) score -= 10;
  }

  // Social buzz
  if (stock.socialBuzz) {
    const b = parseInt(stock.socialBuzz);
    if (b > 100) score += 10;
    else if (b > 50) score += 5;
  }

  // Dividend
  if (stock.dividend && parseFloat(stock.dividend) > 2) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const { portfolio, watchlist, prices } = await request.json();

  const watchSymbols = (watchlist || []).map((w) => w.symbol);
  const portSymbols = (portfolio || []).map((p) => p.symbol);
  const allSymbols = [...new Set([...portSymbols, ...watchSymbols])];
  const extraTickers = ["NVDA", "AAPL", "TSLA", "MSFT", "GOOG", "AMZN", "META", "AMD", "BTC", "ETH"];
  const scanSymbols = [...new Set([...allSymbols, ...extraTickers])].slice(0, 20);

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
        max_tokens: 3000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `You are a stock market analyst. Research these tickers and return a JSON array. Search the web for current data.

Tickers: ${scanSymbols.join(", ")}

For EACH ticker, return:
{
  "symbol": "NVDA",
  "name": "NVIDIA Corporation",
  "sector": "Technology",
  "price": 890.50,
  "targetPrice": 1050,
  "upsidePct": 17.9,
  "changePct": 2.3,
  "dividend": 0.04,
  "sentiment": 0.7,
  "socialBuzz": 85,
  "catalyst": "One sentence on why this stock is moving or interesting right now",
  "action": "BUY",
  "confidence": "HIGH"
}

sentiment: -1 to 1 based on news/social. socialBuzz: 0-100 relative score of how much this stock is being talked about on Reddit, X, TikTok. action: BUY/SELL/HOLD. confidence: HIGH/MEDIUM/LOW.

CRITICAL: Return ONLY valid JSON array. No text before or after. No markdown fences.`,
        }],
      }),
    });

    const data = await res.json();

    // Extract text from response
    let rawText = "";
    for (const block of data.content || []) {
      if (block.type === "text") rawText += block.text;
    }

    // Clean and parse
    let cleaned = rawText
      .replace(/<\/?antml:cite[^>]*>/gi, "")
      .replace(/<\/?cite[^>]*>/gi, "")
      .replace(/<[^>]*>/g, "")
      .replace(/```json\n?|```/g, "")
      .replace(/\[\d+\]/g, "")
      .trim();

    // Find JSON array
    const arrStart = cleaned.indexOf("[");
    const arrEnd = cleaned.lastIndexOf("]");
    let stocks = [];

    if (arrStart !== -1 && arrEnd !== -1) {
      try {
        stocks = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
      } catch {
        // Try to extract individual objects
        const objRegex = /\{[^{}]*\}/g;
        let match;
        while ((match = objRegex.exec(cleaned)) !== null) {
          try { stocks.push(JSON.parse(match[0])); } catch {}
        }
      }
    }

    // Compute composite scores
    const scored = stocks.map((s) => ({
      ...s,
      score: computeScore(s),
      inPortfolio: portSymbols.includes(s.symbol),
      inWatchlist: watchSymbols.includes(s.symbol),
    })).sort((a, b) => b.score - a.score);

    // Split into categories
    const buys = scored.filter((s) => s.score >= 65 && s.action === "BUY");
    const holds = scored.filter((s) => s.score >= 40 && s.score < 65);
    const sells = scored.filter((s) => s.score < 40 || s.action === "SELL");

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      stocks: scored,
      topPicks: buys.slice(0, 5),
      holds: holds.slice(0, 5),
      warnings: sells.slice(0, 3),
      marketMood: scored.reduce((s, x) => s + x.score, 0) / (scored.length || 1) > 55 ? "BULLISH" : scored.reduce((s, x) => s + x.score, 0) / (scored.length || 1) < 45 ? "BEARISH" : "NEUTRAL",
    });
  } catch (error) {
    console.error("[Intelligence] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
