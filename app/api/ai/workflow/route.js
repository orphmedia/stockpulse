import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const maxDuration = 60;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Fetch live quotes from Yahoo
async function getQuotes(symbols) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(",")}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName,regularMarketPreviousClose,regularMarketVolume,regularMarketDayHigh,regularMarketDayLow,trailingAnnualDividendRate,trailingAnnualDividendYield,epsTrailingTwelveMonths,trailingPE,marketCap,fiftyTwoWeekHigh,fiftyTwoWeekLow,averageAnalystRating,targetMeanPrice,numberOfAnalystOpinions`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const r = {};
    for (const q of data.quoteResponse?.result || []) {
      if (q.regularMarketPrice) {
        r[q.symbol] = {
          price: q.regularMarketPrice,
          change: q.regularMarketChange || 0,
          changePct: q.regularMarketChangePercent || 0,
          name: q.shortName || q.symbol,
          volume: q.regularMarketVolume || 0,
          pe: q.trailingPE || 0,
          eps: q.epsTrailingTwelveMonths || 0,
          marketCap: q.marketCap || 0,
          week52High: q.fiftyTwoWeekHigh || 0,
          week52Low: q.fiftyTwoWeekLow || 0,
          analystRating: q.averageAnalystRating || null,
          targetMean: q.targetMeanPrice || 0,
          numAnalysts: q.numberOfAnalystOpinions || 0,
          dividendRate: q.trailingAnnualDividendRate || 0,
          dividendYield: q.trailingAnnualDividendYield ? (q.trailingAnnualDividendYield * 100) : 0,
        };
      }
    }
    return r;
  } catch { return {}; }
}

const WORKFLOW_PROMPTS = {
  "earnings-prep": (symbol, data) => `You are a senior equity analyst preparing a pre-earnings briefing for ${symbol} (${data.name || symbol}).

CURRENT DATA:
- Price: $${data.price?.toFixed(2)} (${data.changePct >= 0 ? "+" : ""}${data.changePct?.toFixed(2)}%)
- Market Cap: $${data.marketCap ? (data.marketCap/1e9).toFixed(1) + "B" : "N/A"}
- P/E: ${data.pe?.toFixed(1) || "N/A"} | EPS: $${data.eps?.toFixed(2) || "N/A"}
- 52wk Range: $${data.week52Low?.toFixed(2)} - $${data.week52High?.toFixed(2)}
- Analyst Consensus: ${data.analystRating || "N/A"} | Target: $${data.targetMean?.toFixed(2) || "N/A"} (${data.numAnalysts} analysts)

RESEARCH TASKS:
1. Search for ${symbol}'s upcoming or most recent earnings date and expectations
2. Search for recent analyst ratings and price target changes for ${symbol}
3. Search for any recent news, insider trades, or institutional activity
4. Search for competitor performance comparison

DELIVERABLE — Respond with valid JSON only, no markdown:
{
  "earningsDate": "date or 'TBD'",
  "expectedEPS": "consensus estimate",
  "expectedRevenue": "consensus estimate",
  "recentSurprises": "last 2-3 quarters performance vs expectations",
  "keyMetricsToWatch": ["metric1", "metric2", "metric3"],
  "recentAnalystActions": "summary of upgrades/downgrades/target changes",
  "bullCase": "1-2 sentences on the bull thesis",
  "bearCase": "1-2 sentences on the bear thesis",
  "insiderActivity": "summary of recent insider trades",
  "competitorComparison": "how peers are doing",
  "riskFactors": ["risk1", "risk2"],
  "tradingSetup": "pre-earnings positioning suggestion",
  "confidence": "HIGH/MEDIUM/LOW"
}`,

  "deep-dive": (symbol, data) => `You are a senior equity research analyst conducting a comprehensive deep dive on ${symbol} (${data.name || symbol}).

CURRENT DATA:
- Price: $${data.price?.toFixed(2)} | Change: ${data.changePct >= 0 ? "+" : ""}${data.changePct?.toFixed(2)}%
- Market Cap: $${data.marketCap ? (data.marketCap/1e9).toFixed(1) + "B" : "N/A"}
- P/E: ${data.pe?.toFixed(1) || "N/A"} | EPS: $${data.eps?.toFixed(2) || "N/A"}
- 52wk: $${data.week52Low?.toFixed(2)} - $${data.week52High?.toFixed(2)}
- Analyst Target: $${data.targetMean?.toFixed(2) || "N/A"} (${data.numAnalysts} analysts) | Rating: ${data.analystRating || "N/A"}
- Div Yield: ${data.dividendYield?.toFixed(2) || 0}%

RESEARCH:
1. Search for latest ${symbol} news and developments
2. Search for ${symbol} analyst ratings consensus and recent changes
3. Search for ${symbol} competitive position and market trends
4. Search for ${symbol} insider trading and institutional ownership

Respond with valid JSON only, no markdown:
{
  "recommendation": "STRONG BUY / BUY / HOLD / SELL / STRONG SELL",
  "targetPrice": 0.00,
  "upsidePct": 0.0,
  "summary": "2-3 sentence executive summary",
  "fundamentals": { "revenue_trend": "", "margin_trend": "", "debt_level": "", "cash_flow": "" },
  "technicals": { "trend": "bullish/bearish/neutral", "support": 0, "resistance": 0, "rsi_zone": "" },
  "catalysts": ["catalyst1", "catalyst2"],
  "risks": ["risk1", "risk2"],
  "analystConsensus": { "buy": 0, "hold": 0, "sell": 0, "avgTarget": 0, "recentChanges": "" },
  "insiderActivity": "",
  "competitivePosition": "",
  "verdict": "1-2 sentence final call with conviction level"
}`,

  "portfolio-review": (symbols, allData) => {
    const holdings = symbols.map(s => {
      const d = allData[s] || {};
      return `${s} (${d.name || s}): $${d.price?.toFixed(2) || "?"} ${d.changePct >= 0 ? "+" : ""}${(d.changePct || 0).toFixed(2)}% | P/E ${d.pe?.toFixed(1) || "N/A"} | Target $${d.targetMean?.toFixed(2) || "N/A"} | ${d.analystRating || "N/A"}`;
    }).join("\n");
    return `You are a portfolio manager reviewing this portfolio:

${holdings}

RESEARCH:
1. Search for market outlook and sector rotation trends today
2. Search for any breaking news affecting these holdings
3. Check which holdings have earnings coming up

Respond with valid JSON only, no markdown:
{
  "overallHealth": "STRONG / GOOD / FAIR / WEAK",
  "totalScore": 0,
  "marketOutlook": "1-2 sentences on current market conditions",
  "sectorExposure": { "Technology": 0, "Healthcare": 0 },
  "topPerformers": [{ "symbol": "", "reason": "" }],
  "underperformers": [{ "symbol": "", "reason": "" }],
  "actionItems": [{ "action": "BUY/SELL/TRIM/ADD", "symbol": "", "reason": "" }],
  "upcomingEvents": [{ "symbol": "", "event": "", "date": "" }],
  "riskAssessment": "concentration risk, sector risk, etc",
  "diversificationScore": "1-10 with explanation",
  "suggestion": "1-2 key portfolio adjustments to consider"
}`;
  },

  "dividend-calendar": (symbols, allData) => {
    const holdings = symbols.map(s => {
      const d = allData[s] || {};
      return `${s}: $${d.price?.toFixed(2) || "?"} | Div Rate $${d.dividendRate?.toFixed(2) || "0"} | Yield ${d.dividendYield?.toFixed(2) || "0"}%`;
    }).join("\n");
    return `You are a dividend-focused investment analyst.

PORTFOLIO:
${holdings}

RESEARCH:
1. Search for upcoming ex-dividend dates for these stocks
2. Search for recent dividend increase announcements
3. Search for high-yield dividend stocks with safe payouts

Respond with valid JSON only, no markdown:
{
  "portfolioYield": "weighted average yield estimate",
  "annualIncome": "estimated annual dividend income",
  "upcomingExDivDates": [{ "symbol": "", "exDate": "", "amount": "", "payDate": "" }],
  "recentChanges": [{ "symbol": "", "change": "increase/decrease/initiated", "detail": "" }],
  "atRisk": [{ "symbol": "", "reason": "why dividend might be cut" }],
  "opportunities": [{ "symbol": "", "yield": "", "reason": "why it's attractive" }],
  "suggestion": "1-2 key dividend strategy insights"
}`;
  },

  "sector-rotation": (symbols, allData) => {
    return `You are a macro strategist analyzing sector rotation trends.

Current portfolio symbols: ${symbols.join(", ")}

RESEARCH:
1. Search for current sector performance and rotation trends in 2026
2. Search for which sectors analysts are upgrading or downgrading
3. Search for economic indicators suggesting sector shifts
4. Search for top ETFs by sector performance this month

Respond with valid JSON only, no markdown:
{
  "currentTrend": "risk-on / risk-off / mixed",
  "hotSectors": [{ "sector": "", "reason": "", "topPick": "" }],
  "coldSectors": [{ "sector": "", "reason": "", "avoid": "" }],
  "rotationSignals": "what economic indicators suggest",
  "portfolioAlignment": "how well the portfolio is positioned",
  "suggestions": [{ "action": "", "detail": "" }],
  "outlook": "1-2 sentence forward-looking view"
}`;
  },

  "weekly-review": (symbols, allData) => {
    const holdings = symbols.map(s => {
      const d = allData[s] || {};
      return `${s}: $${d.price?.toFixed(2) || "?"} ${d.changePct >= 0 ? "+" : ""}${(d.changePct || 0).toFixed(2)}% | Target $${d.targetMean?.toFixed(2) || "N/A"} | ${d.analystRating || "N/A"}`;
    }).join("\n");
    return `You are a portfolio manager writing a weekly review for an individual investor.

PORTFOLIO:
${holdings}

RESEARCH:
1. Search for what major market events happened this week
2. Search for any earnings surprises or news affecting these stocks
3. Search for upcoming catalysts next week
4. Search for market sentiment and positioning data

Respond with valid JSON only, no markdown:
{
  "weekSummary": "2-3 sentence overview of the week in markets",
  "portfolioPerformance": "how the portfolio did this week",
  "keyMoves": [{ "symbol": "", "event": "", "impact": "" }],
  "sectorHighlights": "which sectors won/lost this week",
  "upcomingNextWeek": [{ "event": "", "date": "", "relevance": "" }],
  "actionItems": [{ "priority": "HIGH/MEDIUM/LOW", "action": "", "reason": "" }],
  "riskWatch": "what to keep an eye on",
  "weekAheadOutlook": "1-2 sentence outlook for next week"
}`;
  },
};

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ANTHROPIC_API_KEY) return NextResponse.json({ error: "No API key" }, { status: 503 });

  const { workflow, symbol, symbols, portfolio, holdings } = await request.json();

  if (!workflow) return NextResponse.json({ error: "Missing workflow type" }, { status: 400 });

  try {
    // Get live data for all relevant symbols
    const allSyms = new Set(["SPY", "QQQ", "DIA"]);
    if (symbol) allSyms.add(symbol);
    if (symbols) symbols.forEach(s => allSyms.add(s));
    if (portfolio) portfolio.forEach(h => allSyms.add(h.symbol));
    if (holdings) holdings.forEach(h => allSyms.add(h.symbol));

    const quotes = await getQuotes([...allSyms]);

    // Merge holdings data into quotes if provided
    if (holdings) {
      for (const h of holdings) {
        if (quotes[h.symbol]) {
          quotes[h.symbol] = { ...quotes[h.symbol], shares: h.shares, costBasis: h.costBasis };
        }
      }
    }

    // Build prompt based on workflow type
    let prompt;
    const portfolioSyms = holdings?.map(h => h.symbol) || portfolio?.map(h => h.symbol) || symbols || [];

    if (workflow === "earnings-prep" && symbol) {
      prompt = WORKFLOW_PROMPTS["earnings-prep"](symbol, quotes[symbol] || {});
    } else if (workflow === "deep-dive" && symbol) {
      prompt = WORKFLOW_PROMPTS["deep-dive"](symbol, quotes[symbol] || {});
    } else if (workflow === "portfolio-review") {
      prompt = WORKFLOW_PROMPTS["portfolio-review"](portfolioSyms, quotes);
    } else if (workflow === "dividend-calendar") {
      prompt = WORKFLOW_PROMPTS["dividend-calendar"](portfolioSyms, quotes);
    } else if (workflow === "sector-rotation") {
      prompt = WORKFLOW_PROMPTS["sector-rotation"](portfolioSyms, quotes);
    } else if (workflow === "weekly-review") {
      prompt = WORKFLOW_PROMPTS["weekly-review"](portfolioSyms, quotes);
    } else {
      return NextResponse.json({ error: "Unknown workflow: " + workflow }, { status: 400 });
    }

    // Call Claude with web search enabled
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
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Workflow] API error:", res.status, err.slice(0, 300));
      return NextResponse.json({ error: "AI API error" }, { status: res.status });
    }

    const data = await res.json();

    // Extract text from response blocks
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
    let result;
    try {
      const cleaned = fullText.replace(/```json\n?|```/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      const start = fullText.indexOf("{");
      const end = fullText.lastIndexOf("}");
      if (start !== -1 && end > start) {
        try {
          result = JSON.parse(fullText.slice(start, end + 1));
        } catch {
          result = { error: "Failed to parse response", raw: fullText.slice(0, 500) };
        }
      } else {
        result = { error: "No JSON in response", raw: fullText.slice(0, 500) };
      }
    }

    return NextResponse.json({
      workflow,
      symbol: symbol || null,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Workflow] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
