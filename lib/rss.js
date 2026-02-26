let parser = null;

function getParser() {
  if (!parser) {
    const Parser = require("rss-parser");
    parser = new Parser({
      timeout: 10000,
      headers: {
        "User-Agent": "StockPulse/1.0",
      },
    });
  }
  return parser;
}

// Financial news RSS feeds
const RSS_FEEDS = [
  {
    name: "Reuters Business",
    url: "https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best",
    category: "business",
  },
  {
    name: "CNBC Top News",
    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114",
    category: "general",
  },
  {
    name: "CNBC Finance",
    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664",
    category: "finance",
  },
  {
    name: "Yahoo Finance",
    url: "https://finance.yahoo.com/news/rssindex",
    category: "finance",
  },
  {
    name: "MarketWatch",
    url: "http://feeds.marketwatch.com/marketwatch/topstories/",
    category: "markets",
  },
  {
    name: "Seeking Alpha",
    url: "https://seekingalpha.com/market_currents.xml",
    category: "analysis",
  },
];

/**
 * Fetch articles from all RSS feeds
 * @returns {Array} Normalized articles
 */
export async function fetchAllFeeds() {
  const allArticles = [];

  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      try {
        const parsed = await getParser().parseURL(feed.url);
        return parsed.items.map((item) => ({
          title: item.title?.trim() || "",
          description: item.contentSnippet?.trim() || item.content?.trim() || "",
          url: item.link || "",
          source: feed.name,
          category: feed.category,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        }));
      } catch (error) {
        console.error(`Error fetching ${feed.name}:`, error.message);
        return [];
      }
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allArticles.push(...result.value);
    }
  }

  // Sort by date, most recent first
  allArticles.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

  return allArticles;
}

/**
 * Extract stock symbols mentioned in an article
 * @param {string} text - Article title + description
 * @param {Array} watchlist - Array of symbols to match against
 * @returns {Array} Matched symbols
 */
export function extractSymbols(text, watchlist) {
  const upperText = text.toUpperCase();
  const matched = [];

  // Company name -> symbol mapping
  const COMPANY_MAP = {
    APPLE: "AAPL",
    NVIDIA: "NVDA",
    MICROSOFT: "MSFT",
    AMAZON: "AMZN",
    ALPHABET: "GOOGL",
    GOOGLE: "GOOGL",
    META: "META",
    FACEBOOK: "META",
    TESLA: "TSLA",
    JPMORGAN: "JPM",
    "JP MORGAN": "JPM",
    NETFLIX: "NFLX",
    AMD: "AMD",
    INTEL: "INTC",
    SALESFORCE: "CRM",
    "BERKSHIRE HATHAWAY": "BRK.B",
    DISNEY: "DIS",
    PAYPAL: "PYPL",
    UBER: "UBER",
    AIRBNB: "ABNB",
  };

  // Check for company names
  for (const [company, symbol] of Object.entries(COMPANY_MAP)) {
    if (upperText.includes(company) && watchlist.includes(symbol)) {
      matched.push(symbol);
    }
  }

  // Check for ticker symbols (word boundary match)
  for (const symbol of watchlist) {
    const regex = new RegExp(`\\b${symbol}\\b`, "i");
    if (regex.test(text) && !matched.includes(symbol)) {
      matched.push(symbol);
    }
  }

  return [...new Set(matched)];
}

/**
 * Fetch and filter articles relevant to watchlist
 */
export async function fetchRelevantNews(watchlist) {
  const articles = await fetchAllFeeds();

  return articles
    .map((article) => {
      const symbols = extractSymbols(
        `${article.title} ${article.description}`,
        watchlist
      );
      return { ...article, symbols };
    })
    .filter((article) => article.symbols.length > 0 || article.category === "markets");
}
