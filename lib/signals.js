/**
 * Signal Generation Engine
 * Combines technical indicators + sentiment to produce buy/sell recommendations
 */

/**
 * Generate a trading signal from indicators and sentiment
 * @param {object} indicators - Technical indicators
 * @param {object} sentiment - Sentiment data { avgScore, articleCount, trend }
 * @param {number} currentPrice - Current stock price
 * @param {number} previousClose - Previous closing price
 * @returns {{ signal, confidence, reasoning, components }}
 */
export function generateSignal(indicators, sentiment, currentPrice, previousClose) {
  let score = 0;
  const reasons = [];
  const components = {
    rsi: 0,
    macd: 0,
    sentiment: 0,
    trend: 0,
    bollinger: 0,
  };

  const priceChange = previousClose
    ? ((currentPrice - previousClose) / previousClose) * 100
    : 0;

  // ── RSI Component (weight: 25%) ──────────────────────────────
  if (indicators.rsi_14 !== null) {
    if (indicators.rsi_14 < 25) {
      components.rsi = 3;
      reasons.push(`RSI deeply oversold at ${indicators.rsi_14}`);
    } else if (indicators.rsi_14 < 30) {
      components.rsi = 2;
      reasons.push(`RSI oversold at ${indicators.rsi_14}`);
    } else if (indicators.rsi_14 < 40) {
      components.rsi = 1;
      reasons.push(`RSI approaching oversold at ${indicators.rsi_14}`);
    } else if (indicators.rsi_14 > 75) {
      components.rsi = -3;
      reasons.push(`RSI deeply overbought at ${indicators.rsi_14}`);
    } else if (indicators.rsi_14 > 70) {
      components.rsi = -2;
      reasons.push(`RSI overbought at ${indicators.rsi_14}`);
    } else if (indicators.rsi_14 > 60) {
      components.rsi = -1;
      reasons.push(`RSI elevated at ${indicators.rsi_14}`);
    }
    score += components.rsi * 0.25;
  }

  // ── MACD Component (weight: 25%) ─────────────────────────────
  if (indicators.macd !== null && indicators.macd_signal !== null) {
    const histogram = indicators.macd_histogram || (indicators.macd - indicators.macd_signal);

    if (histogram > 0 && indicators.macd > 0) {
      components.macd = 2;
      reasons.push("MACD bullish with positive histogram");
    } else if (histogram > 0) {
      components.macd = 1;
      reasons.push("MACD histogram turning positive");
    } else if (histogram < 0 && indicators.macd < 0) {
      components.macd = -2;
      reasons.push("MACD bearish with negative histogram");
    } else if (histogram < 0) {
      components.macd = -1;
      reasons.push("MACD histogram turning negative");
    }
    score += components.macd * 0.25;
  }

  // ── Sentiment Component (weight: 30%) ────────────────────────
  if (sentiment && sentiment.articleCount > 0) {
    const sentScore = sentiment.avgScore;
    if (sentScore > 0.5) {
      components.sentiment = 3;
      reasons.push(`Strong bullish sentiment (${sentScore.toFixed(2)}) from ${sentiment.articleCount} articles`);
    } else if (sentScore > 0.2) {
      components.sentiment = 2;
      reasons.push(`Positive sentiment (${sentScore.toFixed(2)}) from ${sentiment.articleCount} articles`);
    } else if (sentScore > 0.05) {
      components.sentiment = 1;
      reasons.push(`Slightly positive sentiment`);
    } else if (sentScore < -0.5) {
      components.sentiment = -3;
      reasons.push(`Strong bearish sentiment (${sentScore.toFixed(2)}) from ${sentiment.articleCount} articles`);
    } else if (sentScore < -0.2) {
      components.sentiment = -2;
      reasons.push(`Negative sentiment (${sentScore.toFixed(2)}) from ${sentiment.articleCount} articles`);
    } else if (sentScore < -0.05) {
      components.sentiment = -1;
      reasons.push(`Slightly negative sentiment`);
    }
    score += components.sentiment * 0.3;
  }

  // ── Trend Component (weight: 15%) ────────────────────────────
  if (indicators.sma_20 && indicators.sma_50) {
    if (currentPrice > indicators.sma_20 && indicators.sma_20 > indicators.sma_50) {
      components.trend = 2;
      reasons.push("Price above rising moving averages — uptrend");
    } else if (currentPrice > indicators.sma_20) {
      components.trend = 1;
      reasons.push("Price above SMA-20");
    } else if (currentPrice < indicators.sma_20 && indicators.sma_20 < indicators.sma_50) {
      components.trend = -2;
      reasons.push("Price below declining moving averages — downtrend");
    } else if (currentPrice < indicators.sma_20) {
      components.trend = -1;
      reasons.push("Price below SMA-20");
    }
    score += components.trend * 0.15;
  }

  // ── Bollinger Component (weight: 5%) ─────────────────────────
  if (indicators.bollinger_upper && indicators.bollinger_lower) {
    if (currentPrice <= indicators.bollinger_lower) {
      components.bollinger = 2;
      reasons.push("Price at lower Bollinger Band — potential bounce");
    } else if (currentPrice >= indicators.bollinger_upper) {
      components.bollinger = -2;
      reasons.push("Price at upper Bollinger Band — potential pullback");
    }
    score += components.bollinger * 0.05;
  }

  // ── Determine Signal ─────────────────────────────────────────
  let signal, color;
  if (score >= 1.5) {
    signal = "STRONG BUY";
    color = "#00e676";
  } else if (score >= 0.7) {
    signal = "BUY";
    color = "#66bb6a";
  } else if (score <= -1.5) {
    signal = "STRONG SELL";
    color = "#ff1744";
  } else if (score <= -0.7) {
    signal = "SELL";
    color = "#ef5350";
  } else {
    signal = "HOLD";
    color = "#ffd740";
  }

  // Confidence is based on agreement between components
  const componentValues = Object.values(components).filter((v) => v !== 0);
  const allAgree = componentValues.length > 0 && componentValues.every((v) => Math.sign(v) === Math.sign(componentValues[0]));
  const baseConfidence = Math.min(95, 40 + Math.abs(score) * 20);
  const confidence = allAgree ? Math.min(95, baseConfidence + 10) : baseConfidence;

  return {
    signal,
    color,
    confidence: parseFloat(confidence.toFixed(1)),
    score: parseFloat(score.toFixed(3)),
    reasoning: reasons.join(". "),
    components,
    priceChange: parseFloat(priceChange.toFixed(2)),
  };
}

/**
 * Generate signals for multiple symbols
 */
export function generateMultipleSignals(symbolData) {
  const results = {};

  for (const [symbol, data] of Object.entries(symbolData)) {
    results[symbol] = generateSignal(
      data.indicators,
      data.sentiment,
      data.currentPrice,
      data.previousClose
    );
  }

  return results;
}
