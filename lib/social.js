// Social media sentiment aggregator
// Reddit: free JSON API (no auth needed)
// X/Twitter: RSS bridge feeds
// TikTok/Instagram: search via web endpoints

import { analyzeSentiment } from "./sentiment";

const SUBREDDIT_MAP = {
  // Finance subreddits
  general: ["wallstreetbets", "stocks", "investing", "stockmarket", "options"],
  // Tech-focused
  tech: ["technology", "tech"],
};

const SYMBOL_KEYWORDS = {
  AAPL: ["AAPL", "Apple", "iPhone", "Tim Cook"],
  NVDA: ["NVDA", "Nvidia", "Jensen Huang", "GPU", "CUDA"],
  MSFT: ["MSFT", "Microsoft", "Satya Nadella", "Azure", "Copilot"],
  AMZN: ["AMZN", "Amazon", "AWS", "Andy Jassy", "Prime"],
  GOOGL: ["GOOGL", "Google", "Alphabet", "Sundar Pichai", "Gemini"],
  META: ["META", "Meta", "Facebook", "Instagram", "Zuckerberg", "WhatsApp"],
  TSLA: ["TSLA", "Tesla", "Elon Musk", "Cybertruck", "FSD"],
  JPM: ["JPM", "JPMorgan", "Jamie Dimon", "Chase"],
  CSCO: ["CSCO", "Cisco"],
  AMD: ["AMD", "Lisa Su"],
  NFLX: ["NFLX", "Netflix"],
  DIS: ["DIS", "Disney"],
  BA: ["BA", "Boeing"],
  CRM: ["CRM", "Salesforce"],
  COIN: ["COIN", "Coinbase"],
  PLTR: ["PLTR", "Palantir"],
  SOFI: ["SOFI", "SoFi"],
  RIVN: ["RIVN", "Rivian"],
};

function matchesSymbol(text, symbol) {
  const keywords = SYMBOL_KEYWORDS[symbol] || [symbol];
  const lower = text.toLowerCase();
  return keywords.some((kw) => {
    // Ticker symbols: exact match with word boundary
    if (kw === kw.toUpperCase() && kw.length <= 5) {
      return new RegExp(`\\b\\$?${kw}\\b`).test(text);
    }
    return lower.includes(kw.toLowerCase());
  });
}

// ═══════════════════════════════════════
// REDDIT — Free JSON API
// ═══════════════════════════════════════
async function fetchReddit(symbols, limit = 50) {
  const posts = [];
  const subreddits = SUBREDDIT_MAP.general;

  for (const sub of subreddits) {
    try {
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}`,
        {
          headers: { "User-Agent": "StockPulse/1.0" },
          cache: "no-store",
        }
      );

      if (!res.ok) continue;
      const data = await res.json();

      for (const child of data?.data?.children || []) {
        const post = child.data;
        if (!post.title) continue;

        const text = `${post.title} ${post.selftext || ""}`;
        const matchedSymbols = symbols.filter((s) => matchesSymbol(text, s));

        if (matchedSymbols.length > 0) {
          const sentiment = analyzeSentiment(text);
          posts.push({
            platform: "reddit",
            source: `r/${sub}`,
            title: post.title,
            text: post.selftext?.slice(0, 200) || "",
            url: `https://reddit.com${post.permalink}`,
            author: post.author,
            score: post.score,
            comments: post.num_comments,
            created_at: new Date(post.created_utc * 1000).toISOString(),
            symbols: matchedSymbols,
            sentiment,
            engagement: post.score + post.num_comments * 2,
          });
        }
      }
    } catch (error) {
      console.error(`[Social] Reddit r/${sub} error:`, error.message);
    }
  }

  return posts;
}

// ═══════════════════════════════════════
// X/TWITTER — Via Nitter RSS or search
// ═══════════════════════════════════════
async function fetchTwitter(symbols) {
  const posts = [];

  // Use cashtag search via public-facing endpoints
  for (const symbol of symbols.slice(0, 5)) {
    try {
      // Try multiple Nitter instances for RSS
      const nitterHosts = [
        "nitter.privacydev.net",
        "nitter.poast.org",
      ];

      for (const host of nitterHosts) {
        try {
          const res = await fetch(
            `https://${host}/search/rss?f=tweets&q=%24${symbol}`,
            { cache: "no-store", signal: AbortSignal.timeout(5000) }
          );

          if (!res.ok) continue;
          const text = await res.text();

          // Parse RSS XML manually (lightweight, no dependency)
          const items = text.match(/<item>[\s\S]*?<\/item>/g) || [];
          for (const item of items.slice(0, 5)) {
            const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
            const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "";
            const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
            const author = item.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/)?.[1] || "";

            const cleanTitle = title.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
            const sentiment = analyzeSentiment(cleanTitle);

            posts.push({
              platform: "twitter",
              source: "X/Twitter",
              title: cleanTitle.slice(0, 280),
              text: "",
              url: link.replace(host, "twitter.com"),
              author,
              created_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
              symbols: [symbol],
              sentiment,
              engagement: 0,
            });
          }
          break; // Got data from this host, no need to try others
        } catch {
          continue;
        }
      }
    } catch (error) {
      console.error(`[Social] Twitter ${symbol} error:`, error.message);
    }
  }

  return posts;
}

// ═══════════════════════════════════════
// TIKTOK — Search via web endpoint
// ═══════════════════════════════════════
async function fetchTikTok(symbols) {
  // TikTok doesn't have a free API, so we'll note this as a platform
  // that requires the AI to analyze based on trending topics
  // For now, return structured placeholder that the AI chat can fill
  return symbols.slice(0, 3).map((symbol) => ({
    platform: "tiktok",
    source: "TikTok",
    title: `Trending discussions about $${symbol} on TikTok`,
    text: "TikTok data requires manual review or paid API access",
    url: `https://www.tiktok.com/search?q=%24${symbol}%20stock`,
    symbols: [symbol],
    sentiment: { score: 0, confidence: 0 },
    engagement: 0,
    created_at: new Date().toISOString(),
    needsAIAnalysis: true,
  }));
}

// ═══════════════════════════════════════
// INSTAGRAM — Search link
// ═══════════════════════════════════════
async function fetchInstagram(symbols) {
  // Instagram has no public API for search
  // Provide search links for the AI to reference
  return symbols.slice(0, 3).map((symbol) => ({
    platform: "instagram",
    source: "Instagram",
    title: `#${symbol} stock discussions on Instagram`,
    text: "Instagram data requires Instagram Basic Display API or manual review",
    url: `https://www.instagram.com/explore/tags/${symbol.toLowerCase()}/`,
    symbols: [symbol],
    sentiment: { score: 0, confidence: 0 },
    engagement: 0,
    created_at: new Date().toISOString(),
    needsAIAnalysis: true,
  }));
}

// ═══════════════════════════════════════
// AGGREGATE ALL SOCIAL PLATFORMS
// ═══════════════════════════════════════
export async function fetchSocialSentiment(symbols) {
  const [reddit, twitter, tiktok, instagram] = await Promise.allSettled([
    fetchReddit(symbols),
    fetchTwitter(symbols),
    fetchTikTok(symbols),
    fetchInstagram(symbols),
  ]);

  const allPosts = [
    ...(reddit.status === "fulfilled" ? reddit.value : []),
    ...(twitter.status === "fulfilled" ? twitter.value : []),
    ...(tiktok.status === "fulfilled" ? tiktok.value : []),
    ...(instagram.status === "fulfilled" ? instagram.value : []),
  ];

  // Sort by engagement + recency
  allPosts.sort((a, b) => (b.engagement || 0) - (a.engagement || 0));

  // Aggregate sentiment per symbol per platform
  const aggregated = {};
  for (const symbol of symbols) {
    const symbolPosts = allPosts.filter((p) => p.symbols.includes(symbol));

    const byPlatform = {};
    for (const post of symbolPosts) {
      if (!byPlatform[post.platform]) {
        byPlatform[post.platform] = { posts: [], totalScore: 0, count: 0 };
      }
      byPlatform[post.platform].posts.push(post);
      if (post.sentiment && !post.needsAIAnalysis) {
        byPlatform[post.platform].totalScore += post.sentiment.score;
        byPlatform[post.platform].count++;
      }
    }

    const platforms = {};
    for (const [platform, data] of Object.entries(byPlatform)) {
      platforms[platform] = {
        postCount: data.posts.length,
        avgSentiment: data.count > 0 ? data.totalScore / data.count : 0,
        topPosts: data.posts.slice(0, 5),
      };
    }

    const validPosts = symbolPosts.filter((p) => !p.needsAIAnalysis && p.sentiment);
    const totalSentiment = validPosts.reduce((sum, p) => sum + p.sentiment.score, 0);

    aggregated[symbol] = {
      platforms,
      totalPosts: symbolPosts.length,
      avgSentiment: validPosts.length > 0 ? totalSentiment / validPosts.length : 0,
      topPosts: symbolPosts.slice(0, 10),
    };
  }

  return {
    posts: allPosts,
    aggregated,
    platformCounts: {
      reddit: allPosts.filter((p) => p.platform === "reddit").length,
      twitter: allPosts.filter((p) => p.platform === "twitter").length,
      tiktok: allPosts.filter((p) => p.platform === "tiktok").length,
      instagram: allPosts.filter((p) => p.platform === "instagram").length,
    },
  };
}
