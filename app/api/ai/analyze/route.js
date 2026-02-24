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
    // Simple symbol-only analysis — uses web search for real data
    if (!action || action === "analyze") {
      const systemPrompt = `You are a sharp, concise financial analyst. Analyze this stock and return ONLY valid JSON, no markdown:
{"recommendation":"BUY/SELL/HOLD","targetPrice":0,"summary":"2-3 sentences","catalyst":"key driver","risks":"main risk","confidence":"HIGH/MEDIUM/LOW"}`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 800,
          system: systemPrompt,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: `Analyze ${symbol} stock. Current price: $${price || "unknown"}. Search for latest news, analyst ratings, and price targets. Give me your analysis.` }],
        }),
      });

      const data = await res.json();
      let rawText = "";
      for (const block of data.content || []) {
        if (block.type === "text") rawText += block.text;
      }

      let analysis;
      try {
        const cleaned = rawText.replace(/```json\n?|```/g, "").replace(/<[^>]*>/g, "").trim();
        const jsonStart = cleaned.indexOf("{");
        const jsonEnd = cleaned.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd !== -1) {
          analysis = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
        }
      } catch {}

      if (!analysis) {
        analysis = { recommendation: "HOLD", summary: rawText.slice(0, 500), confidence: "MEDIUM" };
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
