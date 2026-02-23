// Lightweight financial sentiment analysis — zero dependencies

const WORD_SCORES = {
  good: 3, great: 3, excellent: 3, amazing: 4, outstanding: 4,
  upgrade: 3, upgraded: 3, outperform: 3, bullish: 3,
  surge: 3, surges: 3, soar: 3, soars: 3, rally: 2, breakout: 2,
  buyback: 2, dividend: 2, beat: 2, beats: 2, exceeded: 3,
  record: 2, growth: 2, partnership: 1, acquisition: 1,
  approval: 2, approved: 2, breakthrough: 3, momentum: 2,
  profitable: 3, profit: 2, gain: 2, gains: 2, rise: 2,
  rises: 2, rising: 2, strong: 2, positive: 2, boost: 2,
  win: 2, success: 2, improve: 2, improved: 2,
  bad: -3, terrible: -4, awful: -4, poor: -2,
  downgrade: -3, downgraded: -3, underperform: -3, bearish: -3,
  plunge: -3, plunges: -3, crash: -4, selloff: -3,
  investigation: -2, lawsuit: -2, fraud: -4, recall: -2,
  layoff: -2, layoffs: -2, miss: -2, misses: -2,
  missed: -2, decline: -2, declining: -2, warning: -2, risk: -1,
  debt: -1, loss: -2, losses: -2, bankruptcy: -4, resign: -2,
  sanctions: -2, tariff: -2, tariffs: -2,
  fall: -2, falls: -2, falling: -2, drop: -2, drops: -2, weak: -2,
  negative: -2, fail: -3, failed: -3, cut: -1, cuts: -1, concern: -1,
};

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z\s-]/g, "").split(/\s+/).filter(Boolean);
}

export function analyzeSentiment(text) {
  if (!text) return { score: 0, confidence: 0 };

  const words = tokenize(text);
  let totalScore = 0;
  let scoredWords = 0;

  for (const word of words) {
    if (WORD_SCORES[word] !== undefined) {
      totalScore += WORD_SCORES[word];
      scoredWords++;
    }
  }

  // Normalize to -1 to +1 range
  const rawScore = words.length > 0 ? totalScore / Math.max(words.length, 1) : 0;
  const score = Math.max(-1, Math.min(1, rawScore));

  // Confidence based on how many scored words we found
  const confidence = Math.min(1, scoredWords / 5);

  return { score, confidence };
}

export function analyzeArticle(article) {
  const text = `${article.title || ""} ${article.description || ""}`;
  return analyzeSentiment(text);
}

export function aggregateSentiment(articles) {
  if (!articles || articles.length === 0) {
    return { avgScore: 0, articleCount: 0, trend: "neutral" };
  }

  let totalScore = 0;
  let totalWeight = 0;

  articles.forEach((article) => {
    const sentiment = article.sentiment || analyzeArticle(article);
    const weight = 1 + sentiment.confidence;
    totalScore += sentiment.score * weight;
    totalWeight += weight;
  });

  const avgScore = totalWeight > 0 ? totalScore / totalWeight : 0;

  let trend = "neutral";
  if (avgScore > 0.3) trend = "strongly_bullish";
  else if (avgScore > 0.1) trend = "bullish";
  else if (avgScore < -0.3) trend = "strongly_bearish";
  else if (avgScore < -0.1) trend = "bearish";

  return {
    avgScore,
    articleCount: articles.length,
    trend,
  };
}
