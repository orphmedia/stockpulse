import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMultiQuotes, getMultiTrades, getBars, getYahooQuotes } from "@/lib/alpaca";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get("symbols")?.split(",") || [];
  const type = searchParams.get("type") || "quote";

  try {
    if (type === "quote") {
      // Try Yahoo Finance first — real-time, free, no API key
      let prices = await getYahooQuotes(symbols);

      // If Yahoo fails or misses symbols, fallback to Alpaca
      const missing = symbols.filter((s) => !prices[s]);
      if (missing.length > 0) {
        console.log(`[Prices] Yahoo missed ${missing.length} symbols, trying Alpaca...`);
        let alpacaPrices = await getMultiQuotes(missing);
        if (Object.keys(alpacaPrices).length === 0) {
          alpacaPrices = await getMultiTrades(missing);
        }
        prices = { ...prices, ...alpacaPrices };
      }

      console.log(`[Prices] Returning ${Object.keys(prices).length}/${symbols.length} prices`);
      return NextResponse.json({ prices, quotes: prices, signals: {} });
    }

    if (type === "historical") {
      const symbol = searchParams.get("symbol");
      const timeframe = searchParams.get("timeframe") || "1Day";
      const limit = parseInt(searchParams.get("limit") || "60");

      // Try Yahoo Finance chart first (free, reliable)
      try {
        let range, interval;
        if (timeframe === "5Min") { range = "1d"; interval = "5m"; }
        else if (timeframe === "30Min") { range = "5d"; interval = "30m"; }
        else if (timeframe === "1Week") { range = "5y"; interval = "1wk"; }
        else if (limit <= 25) { range = "1mo"; interval = "1d"; }
        else if (limit <= 65) { range = "3mo"; interval = "1d"; }
        else { range = "1y"; interval = "1d"; }

        const yRes = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`,
          { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
        );
        if (yRes.ok) {
          const yData = await yRes.json();
          const result = yData.chart?.result?.[0];
          if (result?.timestamp) {
            const ts = result.timestamp;
            const q = result.indicators?.quote?.[0];
            const bars = ts.map((t, i) => ({
              timestamp: new Date(t * 1000).toISOString(),
              open: q?.open?.[i] || 0,
              high: q?.high?.[i] || 0,
              low: q?.low?.[i] || 0,
              close: q?.close?.[i] || 0,
              volume: q?.volume?.[i] || 0,
              price: q?.close?.[i] || 0,
            })).filter((b) => b.close > 0);
            if (bars.length > 0) {
              console.log(`[Prices] Yahoo chart: ${bars.length} bars for ${symbol}`);
              return NextResponse.json({ bars, source: "yahoo" });
            }
          }
        }
      } catch (e) { console.log("[Prices] Yahoo chart failed:", e.message); }

      // Fallback to Alpaca
      try {
        const bars = await getBars(symbol, timeframe, limit);
        if (bars.length > 0) {
          return NextResponse.json({ bars, source: "alpaca" });
        }
      } catch (e) { console.log("[Prices] Alpaca bars failed:", e.message); }

      return NextResponse.json({ bars: [], source: "none" });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    console.error("Stock prices API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
