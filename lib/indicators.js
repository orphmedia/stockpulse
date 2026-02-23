/**
 * Technical Indicators Library for StockPulse
 * Computes RSI, MACD, SMA, EMA, Bollinger Bands
 */

/**
 * Simple Moving Average
 */
export function SMA(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const avg = slice.reduce((sum, val) => sum + val, 0) / period;
      result.push(parseFloat(avg.toFixed(4)));
    }
  }
  return result;
}

/**
 * Exponential Moving Average
 */
export function EMA(data, period) {
  const k = 2 / (period + 1);
  const result = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(parseFloat((data[i] * k + result[i - 1] * (1 - k)).toFixed(4)));
  }
  return result;
}

/**
 * Relative Strength Index (RSI)
 * @param {Array<number>} prices - Array of closing prices
 * @param {number} period - RSI period (default 14)
 * @returns {Array<number|null>}
 */
export function RSI(prices, period = 14) {
  const result = [];
  const gains = [];
  const losses = [];

  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  // Not enough data
  for (let i = 0; i < period; i++) {
    result.push(null);
  }

  // First RSI value using simple average
  let avgGain = gains.slice(0, period).reduce((s, v) => s + v, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((s, v) => s + v, 0) / period;

  if (avgLoss === 0) {
    result.push(100);
  } else {
    const rs = avgGain / avgLoss;
    result.push(parseFloat((100 - 100 / (1 + rs)).toFixed(2)));
  }

  // Subsequent RSI values using smoothed average
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      result.push(parseFloat((100 - 100 / (1 + rs)).toFixed(2)));
    }
  }

  return result;
}

/**
 * MACD (Moving Average Convergence Divergence)
 * @param {Array<number>} prices - Closing prices
 * @param {number} fastPeriod - Fast EMA period (default 12)
 * @param {number} slowPeriod - Slow EMA period (default 26)
 * @param {number} signalPeriod - Signal line period (default 9)
 */
export function MACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEMA = EMA(prices, fastPeriod);
  const slowEMA = EMA(prices, slowPeriod);

  const macdLine = fastEMA.map((fast, i) => {
    if (i < slowPeriod - 1) return null;
    return parseFloat((fast - slowEMA[i]).toFixed(4));
  });

  const validMacd = macdLine.filter((v) => v !== null);
  const signalLine = EMA(validMacd, signalPeriod);

  // Align signal line with MACD line
  const fullSignal = new Array(macdLine.length - validMacd.length)
    .fill(null)
    .concat(signalLine);

  const histogram = macdLine.map((macd, i) => {
    if (macd === null || fullSignal[i] === null) return null;
    return parseFloat((macd - fullSignal[i]).toFixed(4));
  });

  return {
    macd: macdLine,
    signal: fullSignal,
    histogram,
  };
}

/**
 * Bollinger Bands
 * @param {Array<number>} prices - Closing prices
 * @param {number} period - SMA period (default 20)
 * @param {number} multiplier - Standard deviation multiplier (default 2)
 */
export function BollingerBands(prices, period = 20, multiplier = 2) {
  const sma = SMA(prices, period);
  const upper = [];
  const lower = [];

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      lower.push(null);
    } else {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = sma[i];
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      upper.push(parseFloat((mean + multiplier * stdDev).toFixed(4)));
      lower.push(parseFloat((mean - multiplier * stdDev).toFixed(4)));
    }
  }

  return { upper, middle: sma, lower };
}

/**
 * Volume Weighted Average Price (VWAP)
 */
export function VWAP(highs, lows, closes, volumes) {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  const result = [];

  for (let i = 0; i < closes.length; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
    cumulativeTPV += typicalPrice * volumes[i];
    cumulativeVolume += volumes[i];
    result.push(parseFloat((cumulativeTPV / cumulativeVolume).toFixed(4)));
  }

  return result;
}

/**
 * Compute all indicators for a price series
 * @param {Array<{close: number, high: number, low: number, volume: number}>} bars
 */
export function computeAllIndicators(bars) {
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const volumes = bars.map((b) => b.volume);

  const rsi = RSI(closes);
  const macd = MACD(closes);
  const bollinger = BollingerBands(closes);
  const sma20 = SMA(closes, 20);
  const sma50 = SMA(closes, 50);
  const sma200 = SMA(closes, 200);

  // Get latest values
  const latest = closes.length - 1;

  return {
    rsi_14: rsi[latest],
    macd: macd.macd[latest],
    macd_signal: macd.signal[latest],
    macd_histogram: macd.histogram[latest],
    sma_20: sma20[latest],
    sma_50: sma50[latest],
    sma_200: sma200[latest],
    bollinger_upper: bollinger.upper[latest],
    bollinger_lower: bollinger.lower[latest],
    volume_avg_20: Math.round(
      volumes.slice(-20).reduce((s, v) => s + v, 0) / Math.min(20, volumes.length)
    ),
    // Full series for charting
    series: {
      rsi,
      macd,
      bollinger,
      sma20,
      sma50,
    },
  };
}
