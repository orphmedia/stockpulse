import { NextResponse } from "next/server";
import { getMultiQuotes, getBars } from "@/lib/alpaca";
import { fetchRelevantNews } from "@/lib/rss";
import { batchAnalyze, aggregateSentiment } from "@/lib/sentiment";
import { computeAllIndicators } from "@/lib/indicators";
import { generateSignal } from "@/lib/signals";
import { supabaseAdmin } from "@/lib/supabase";

// Cron endpoint — runs every 5 minutes during market hours
// Configured in vercel.json: every 5 min, 9-16 Mon-Fri
export async function GET(request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // ── Step 1: Get watchlist symbols ────────────────────────────
    const { data: watchlistItems } = await supabaseAdmin
      .from("watchlist")
      .select("symbol")
      .limit(50);

    const symbols = [...new Set(watchlistItems?.map((w) => w.symbol) || [])];

    if (symbols.length === 0) {
      return NextResponse.json({ message: "No symbols in watchlist" });
    }

    // ── Step 2: Fetch real-time prices ──────────────────────────
    const quotes = await getMultiQuotes(symbols);

    // Store prices
    const priceRecords = Object.values(quotes)
      .filter(Boolean)
      .map((q) => ({
        symbol: q.symbol,
        price: q.price,
        timestamp: q.timestamp || new Date().toISOString(),
        source: "alpaca",
      }));

    if (priceRecords.length > 0) {
      await supabaseAdmin.from("price_history").insert(priceRecords);
    }

    await logAggregation("prices", "success", priceRecords.length);

    // ── Step 3: Fetch and analyze news ──────────────────────────
    const articles = await fetchRelevantNews(symbols);
    const scoredArticles = batchAnalyze(articles);

    // Store articles and sentiment
    let newsCount = 0;
    for (const article of scoredArticles.slice(0, 50)) {
      const { data: inserted } = await supabaseAdmin
        .from("news_articles")
        .upsert(
          {
            title: article.title,
            description: article.description,
            url: article.url,
            source: article.source,
            published_at: article.published_at,
            symbols: article.symbols,
          },
          { onConflict: "url" }
        )
        .select()
        .single();

      if (inserted && article.symbols) {
        for (const symbol of article.symbols) {
          await supabaseAdmin.from("sentiment_scores").insert({
            article_id: inserted.id,
            symbol,
            score: article.sentiment.score,
            confidence: article.sentiment.confidence,
            model: "natural-afinn",
          });
        }
        newsCount++;
      }
    }

    await logAggregation("news", "success", newsCount);

    // ── Step 4: Compute technical indicators ────────────────────
    for (const symbol of symbols) {
      const bars = await getBars(symbol, "1Day", 200);

      if (bars.length >= 26) {
        const formattedBars = bars.map((b) => ({
          close: b.close,
          high: b.high,
          low: b.low,
          volume: b.volume,
        }));

        const indicators = computeAllIndicators(formattedBars);

        await supabaseAdmin.from("technical_indicators").insert({
          symbol,
          rsi_14: indicators.rsi_14,
          macd: indicators.macd,
          macd_signal: indicators.macd_signal,
          macd_histogram: indicators.macd_histogram,
          sma_20: indicators.sma_20,
          sma_50: indicators.sma_50,
          sma_200: indicators.sma_200,
          bollinger_upper: indicators.bollinger_upper,
          bollinger_lower: indicators.bollinger_lower,
          volume_avg_20: indicators.volume_avg_20,
        });
      }
    }

    await logAggregation("indicators", "success", symbols.length);

    // ── Step 5: Generate signals ────────────────────────────────
    for (const symbol of symbols) {
      // Get latest indicator
      const { data: latestIndicator } = await supabaseAdmin
        .from("technical_indicators")
        .select("*")
        .eq("symbol", symbol)
        .order("computed_at", { ascending: false })
        .limit(1)
        .single();

      // Get sentiment
      const sentiment = aggregateSentiment(scoredArticles, symbol);

      // Get current and previous price
      const currentPrice = quotes[symbol]?.price || 0;
      const { data: prevPrice } = await supabaseAdmin
        .from("price_history")
        .select("price")
        .eq("symbol", symbol)
        .order("timestamp", { ascending: false })
        .range(1, 1)
        .single();

      if (latestIndicator && currentPrice > 0) {
        const signal = generateSignal(
          latestIndicator,
          sentiment,
          currentPrice,
          prevPrice?.price || currentPrice
        );

        await supabaseAdmin.from("signals").insert({
          symbol,
          signal_type: signal.signal,
          confidence: signal.confidence,
          rsi_component: signal.components.rsi,
          macd_component: signal.components.macd,
          sentiment_component: signal.components.sentiment,
          price_at_signal: currentPrice,
          reasoning: signal.reasoning,
        });
      }
    }

    await logAggregation("signals", "success", symbols.length);

    const duration = Date.now() - startTime;
    return NextResponse.json({
      success: true,
      symbols: symbols.length,
      prices: priceRecords.length,
      news: newsCount,
      duration: `${duration}ms`,
    });
  } catch (error) {
    console.error("Cron aggregation error:", error);
    await logAggregation("full_run", "error", 0, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function logAggregation(runType, status, recordsProcessed, errorMessage = null) {
  await supabaseAdmin.from("aggregation_log").insert({
    run_type: runType,
    status,
    records_processed: recordsProcessed,
    error_message: errorMessage,
    completed_at: status === "success" ? new Date().toISOString() : null,
  });
}
