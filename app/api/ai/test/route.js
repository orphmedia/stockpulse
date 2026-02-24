import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET() {
  const key = process.env.ANTHROPIC_API_KEY;
  const diagnostics = {
    timestamp: new Date().toISOString(),
    apiKeyPresent: !!key,
    apiKeyPrefix: key ? key.slice(0, 12) + "..." : "MISSING",
  };

  if (!key) {
    return NextResponse.json({ ...diagnostics, error: "ANTHROPIC_API_KEY not set in environment" });
  }

  // Test a simple API call
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 100,
        messages: [{ role: "user", content: "Say hello in one sentence." }],
      }),
    });

    const data = await res.json();

    if (data.error) {
      return NextResponse.json({
        ...diagnostics,
        status: "API_ERROR",
        error: data.error,
      });
    }

    const text = data.content?.find((b) => b.type === "text")?.text || "";

    return NextResponse.json({
      ...diagnostics,
      status: "OK",
      model: data.model,
      stopReason: data.stop_reason,
      responsePreview: text.slice(0, 100),
      contentBlocks: data.content?.length,
    });
  } catch (error) {
    return NextResponse.json({
      ...diagnostics,
      status: "FETCH_ERROR",
      error: error.message,
    });
  }
}
