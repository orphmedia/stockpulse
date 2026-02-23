import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function callClaude(prompt, systemPrompt) {
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
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await res.json();
  return data.content?.[0]?.text || "Unable to generate analysis.";
}

// POST — analyze a single stock
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI analysis not configured. Add ANTHROPIC_API_KEY to environment variables." }, { status: 503 });
  }

  const { action, symbol, articles, sentiment, price } = await request.json();

  try {
    if (action === "analyze") {
      // Build context from recent news
      const newsContext = (articles || [])
        .slice(0, 10)
        .map((a, i) => `${i + 1}. "${a.title}" (${a.source}, sentiment: ${a.sentiment?.score?.toFixed(2) || "n/a"})`)
        .join("\n");

      const systemPrompt = `You are a sharp, concise financial analyst AI built into a stock dashboard called StockPulse. You analyze news sentiment, price action, and market context to give actionable insights. Be direct and specific — no generic disclaimers. Format your response as JSON with these fields:
- "summary": 2-3 sentence overview of current sentiment and outlook
- "signal": one of "STRONG BUY", "BUY", "HOLD", "SELL", "STRONG SELL"
- "confidence": number 0-100
- "keyFactors": array of 3-5 short bullet points driving the signal
- "risks": array of 2-3 risk factors to watch
- "priceOutlook": short 1-sentence price direction prediction
Respond ONLY with valid JSON, no markdown fences or preamble.`;

      const prompt = `Analyze ${symbol} based on the following data:

Current Price: $${price || "unknown"}
Overall Sentiment Score: ${sentiment?.avgScore?.toFixed(2) || "unknown"} (from ${sentiment?.articleCount || 0} articles)
Sentiment Trend: ${sentiment?.trend || "unknown"}

Recent Headlines:
${newsContext || "No recent headlines available."}

Give me your analysis as a financial analyst.`;

      const response = await callClaude(prompt, systemPrompt);

      // Try to parse JSON response
      let analysis;
      try {
        const cleaned = response.replace(/```json\n?|```/g, "").trim();
        analysis = JSON.parse(cleaned);
      } catch {
        analysis = {
          summary: response,
          signal: "HOLD",
          confidence: 50,
          keyFactors: ["Unable to parse structured analysis"],
          risks: ["Analysis may be incomplete"],
          priceOutlook: "Insufficient data for prediction",
        };
      }

      return NextResponse.json({ analysis, symbol });
    }

    if (action === "top10") {
      const systemPrompt = `You are a sharp financial analyst AI. Based on the market data provided, recommend a top 10 watchlist of stocks. For each stock, provide a brief reason. Format your response as JSON with a single field:
- "watchlist": array of objects with "symbol", "name", "reason", "signal" (BUY/HOLD/SELL), "priority" (1-10, 1 being highest)
Respond ONLY with valid JSON, no markdown fences or preamble.`;

      const prompt = `Based on current market conditions and the following portfolio context, recommend a top 10 stock watchlist:

Current holdings being tracked: ${symbol || "AAPL, NVDA, MSFT, AMZN, GOOGL, META, TSLA, JPM"}

Recent market news and sentiment data:
${(articles || []).slice(0, 15).map((a, i) => `${i + 1}. "${a.title}" (${a.source}, sentiment: ${a.sentiment?.score?.toFixed(2) || "n/a"})`).join("\n")}

Give me your top 10 watchlist with mix of current holdings worth watching and new opportunities. Prioritize stocks with strong momentum or undervalued positions.`;

      const response = await callClaude(prompt, systemPrompt);

      let watchlist;
      try {
        const cleaned = response.replace(/```json\n?|```/g, "").trim();
        watchlist = JSON.parse(cleaned);
      } catch {
        watchlist = { watchlist: [{ symbol: "ERROR", name: "Parse Error", reason: response, signal: "HOLD", priority: 1 }] };
      }

      return NextResponse.json(watchlist);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("AI analysis error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
