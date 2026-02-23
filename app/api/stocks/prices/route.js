import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMultiQuotes, getMultiTrades, getBars } from "@/lib/alpaca";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get("symbols")?.split(",") || [];
  const type = searchParams.get("type") || "quote"; // quote | historical

  try {
    if (type === "quote") {
      // Get real-time quotes from Alpaca
      let quotes = await getMultiQuotes(symbols);

      // If quotes are empty, try trades as fallback
      if (Object.keys(quotes).length === 0) {
        console.log("[Prices API] Quotes empty, trying trades fallback...");
        quotes = await getMultiTrades(symbols);
      }

      console.log(`[Prices API] Returning ${Object.keys(quotes).length} quotes`);
      return NextResponse.json({ quotes });
    }

    if (type === "historical") {
      const symbol = searchParams.get("symbol");
      const timeframe = searchParams.get("timeframe") || "1Day";
      const limit = parseInt(searchParams.get("limit") || "60");

      // Try database first
      const { data: cached } = await supabaseAdmin
        .from("price_history")
        .select("*")
        .eq("symbol", symbol)
        .order("timestamp", { ascending: true })
        .limit(limit);

      if (cached && cached.length >= limit * 0.8) {
        return NextResponse.json({ bars: cached, source: "cache" });
      }

      // Fetch from Alpaca
      const bars = await getBars(symbol, timeframe, limit);

      // Store in database
      if (bars.length > 0) {
        const records = bars.map((bar) => ({
          symbol: bar.symbol,
          price: bar.close,
          open_price: bar.open,
          high: bar.high,
          low: bar.low,
          volume: bar.volume,
          timestamp: bar.timestamp,
          source: "alpaca",
        }));

        await supabaseAdmin
          .from("price_history")
          .upsert(records, { onConflict: "symbol,timestamp" })
          .select();
      }

      return NextResponse.json({ bars, source: "alpaca" });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    console.error("Stock prices API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
