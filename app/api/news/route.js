import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchRelevantNews } from "@/lib/rss";
import { batchAnalyze, aggregateSentiment } from "@/lib/sentiment";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get("symbols")?.split(",") || [];

  try {
    // Fetch news from RSS feeds
    const articles = await fetchRelevantNews(symbols);

    // Run sentiment analysis
    const scoredArticles = batchAnalyze(articles);

    // Store articles in database
    for (const article of scoredArticles) {
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

      // Store sentiment scores per symbol
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
      }
    }

    // Compute aggregate sentiment per symbol
    const sentimentBySymbol = {};
    for (const symbol of symbols) {
      sentimentBySymbol[symbol] = aggregateSentiment(scoredArticles, symbol);
    }

    return NextResponse.json({
      articles: scoredArticles.slice(0, 20),
      sentiment: sentimentBySymbol,
      totalArticles: scoredArticles.length,
    });
  } catch (error) {
    console.error("News API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
