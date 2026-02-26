import { NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export const maxDuration = 60;

export async function POST(request) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ analysis: { recommendation: "HOLD", summary: "AI not configured." }, symbol: "?" });
  }

  let symbol, price;
  try {
    const body = await request.json();
    symbol = body.symbol;
    price = body.price;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: "You are a concise stock analyst. Return ONLY valid JSON, no markdown:\n{\"recommendation\":\"BUY or SELL or HOLD\",\"targetPrice\":0,\"summary\":\"2-3 sentences max\",\"catalyst\":\"key driver\",\"risks\":\"main risk\",\"confidence\":\"HIGH or MEDIUM or LOW\"}",
        messages: [{ role: "user", content: `Analyze ${symbol}. Price: $${price || "unknown"}. Give recommendation, target price, catalyst, risks.` }],
      }),
    });

    clearTimeout(timeout);

    const data = await res.json();

    if (!res.ok) {
      console.error("[Analyze] API error:", res.status, JSON.stringify(data).slice(0, 200));
      return NextResponse.json({ analysis: { recommendation: "HOLD", summary: `API error: ${data.error?.message || res.status}` }, symbol });
    }

    let rawText = "";
    for (const block of data.content || []) {
      if (block.type === "text") rawText += block.text;
    }

    let analysis;
    try {
      const cleaned = rawText.replace(/```json\n?|```/g, "").trim();
      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        analysis = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
      }
    } catch {}

    if (!analysis) {
      analysis = { recommendation: "HOLD", summary: rawText.slice(0, 300), confidence: "MEDIUM" };
    }

    return NextResponse.json({ analysis, symbol });
  } catch (error) {
    if (error.name === "AbortError") {
      return NextResponse.json({ analysis: { recommendation: "HOLD", summary: "Analysis timed out. Try again." }, symbol });
    }
    console.error("[Analyze] Error:", error.message);
    return NextResponse.json({ analysis: { recommendation: "HOLD", summary: error.message }, symbol });
  }
}
