import natural from "natural";

const analyzer = new natural.SentimentAnalyzer("English", natural.PorterStemmer, "afinn");
const tokenizer = new natural.WordTokenizer();

// Financial-specific sentiment boosters
const FINANCIAL_POSITIVE = {
  upgrade: 2,
  upgraded: 2,
  outperform: 2,
  overweight: 1.5,
  bullish: 2,
  surge: 1.5,
  surges: 1.5,
  soar: 2,
  soars: 2,
  rally: 1.5,
  breakout: 1.5,
  buyback: 1,
  dividend: 1,
  beat: 1.5,
  beats: 1.5,
  exceeded: 1.5,
  exceeds: 1.5,
  record: 1,
  growth: 1,
  expansion: 1,
  partnership: 0.8,
  acquisition: 0.5,
  approval: 1.5,
  approved: 1.5,
  innovation: 0.8,
  breakthrough: 1.5,
  momentum: 1,
  profitable: 1.5,
  profit: 1,
  revenue: 0.5,
};

const FINANCIAL_NEGATIVE = {
  downgrade: -2,
  downgraded: -2,
  underperform: -2,
  underweight: -1.5,
  bearish: -2,
  plunge: -2,
  plunges: -2,
  crash: -2.5,
  selloff: -2,
  "sell-off": -2,
  investigation: -1.5,
  lawsuit: -1.5,
  fraud: -2.5,
  recall: -1.5,
  layoff: -1,
  layoffs: -1,
  restructuring: -0.8,
  miss: -1.5,
  misses: -1.5,
  missed: -1.5,
  decline: -1,
  declining: -1,
  warning: -1,
  risk: -0.8,
  debt: -0.8,
  loss: -1,
  losses: -1,
  bankruptcy: -3,
  resign: -1.5,
  resigns: -1.5,
  sec: -1,
  sanctions: -1.5,
  tariff: -1,
  tariffs: -1,
};

/**
 * Analyze sentiment of a text with financial context
 * @param {string} text - Text to analyze
 * @returns {{ score: number, confidence: number, breakdown: object }}
 */
export function analyzeSentiment(text) {
  const tokens = tokenizer.tokenize(text.toLowerCase());

  // Base sentiment from AFINN
  const baseSentiment = analyzer.getSentiment(tokens);

  // Financial-specific adjustments
  let financialScore = 0;
  let financialMatches = 0;

  for (const token of tokens) {
    if (FINANCIAL_POSITIVE[token]) {
      financialScore += FINANCIAL_POSITIVE[token];
      financialMatches++;
    }
    if (FINANCIAL_NEGATIVE[token]) {
      financialScore += FINANCIAL_NEGATIVE[token];
      financialMatches++;
    }
  }

  // Weighted combination: 40% base, 60% financial
  const combinedScore = baseSentiment * 0.4 + (financialScore / Math.max(tokens.length, 1)) * 0.6;

  // Normalize to -1 to 1 range
  const normalizedScore = Math.max(-1, Math.min(1, combinedScore));

  // Confidence based on text length and financial keyword density
  const confidence = Math.min(
    1,
    0.3 + (tokens.length / 50) * 0.3 + (financialMatches / Math.max(tokens.length, 1)) * 0.4
  );

  return {
    score: parseFloat(normalizedScore.toFixed(4)),
    confidence: parseFloat(confidence.toFixed(4)),
    breakdown: {
      baseSentiment: parseFloat(baseSentiment.toFixed(4)),
      financialScore: parseFloat(financialScore.toFixed(4)),
      financialMatches,
      tokenCount: tokens.length,
    },
  };
}

/**
 * Batch analyze multiple articles
 * @param {Array} articles - Array of { title, description, symbols }
 * @returns {Array} Articles with sentiment scores
 */
export function batchAnalyze(articles) {
  return articles.map((article) => {
    const text = `${article.title} ${article.description || ""}`;
    const sentiment = analyzeSentiment(text);
    return {
      ...article,
      sentiment,
    };
  });
}

/**
 * Compute aggregate sentiment for a symbol from multiple articles
 * @param {Array} scoredArticles - Articles with sentiment scores
 * @param {string} symbol - Stock symbol
 * @returns {{ avgScore: number, articleCount: number, trend: string }}
 */
export function aggregateSentiment(scoredArticles, symbol) {
  const relevant = scoredArticles.filter(
    (a) => a.symbols && a.symbols.includes(symbol)
  );

  if (relevant.length === 0) {
    return { avgScore: 0, articleCount: 0, trend: "neutral" };
  }

  // Weighted average by confidence
  let weightedSum = 0;
  let weightTotal = 0;

  for (const article of relevant) {
    const weight = article.sentiment.confidence;
    weightedSum += article.sentiment.score * weight;
    weightTotal += weight;
  }

  const avgScore = weightTotal > 0 ? weightedSum / weightTotal : 0;

  let trend = "neutral";
  if (avgScore > 0.2) trend = "bullish";
  if (avgScore > 0.5) trend = "strongly_bullish";
  if (avgScore < -0.2) trend = "bearish";
  if (avgScore < -0.5) trend = "strongly_bearish";

  return {
    avgScore: parseFloat(avgScore.toFixed(4)),
    articleCount: relevant.length,
    trend,
  };
}
