const Alpaca = require("@alpacahq/alpaca-trade-api");

// Initialize Alpaca client
const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_API_SECRET,
  paper: true, // Use paper trading — switch to false for live
  usePolygon: false,
});

/**
 * Get real-time quote for a symbol
 */
export async function getQuote(symbol) {
  try {
    const quote = await alpaca.getLatestQuote(symbol);
    return {
      symbol,
      price: quote.AskPrice,
      bid: quote.BidPrice,
      ask: quote.AskPrice,
      timestamp: quote.Timestamp,
    };
  } catch (error) {
    console.error(`Error fetching quote for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get latest trade for a symbol
 */
export async function getLatestTrade(symbol) {
  try {
    const trade = await alpaca.getLatestTrade(symbol);
    return {
      symbol,
      price: trade.Price,
      size: trade.Size,
      timestamp: trade.Timestamp,
    };
  } catch (error) {
    console.error(`Error fetching trade for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get historical bars (OHLCV) for a symbol
 * @param {string} symbol - Stock symbol
 * @param {string} timeframe - '1Min', '5Min', '15Min', '1Hour', '1Day'
 * @param {number} limit - Number of bars
 */
export async function getBars(symbol, timeframe = "1Day", limit = 60) {
  try {
    const bars = [];
    const barIterator = alpaca.getBarsV2(symbol, {
      timeframe,
      limit,
    });

    for await (const bar of barIterator) {
      bars.push({
        symbol,
        timestamp: bar.Timestamp,
        open: bar.OpenPrice,
        high: bar.HighPrice,
        low: bar.LowPrice,
        close: bar.ClosePrice,
        volume: bar.Volume,
        vwap: bar.VWAP,
      });
    }

    return bars;
  } catch (error) {
    console.error(`Error fetching bars for ${symbol}:`, error);
    return [];
  }
}

/**
 * Get multiple quotes at once
 */
export async function getMultiQuotes(symbols) {
  try {
    const quotes = await alpaca.getLatestQuotes(symbols);
    const results = {};
    for (const [symbol, quote] of Object.entries(quotes)) {
      results[symbol] = {
        symbol,
        price: quote.AskPrice,
        bid: quote.BidPrice,
        ask: quote.AskPrice,
        timestamp: quote.Timestamp,
      };
    }
    return results;
  } catch (error) {
    console.error("Error fetching multi quotes:", error);
    return {};
  }
}

/**
 * Get account info (for paper trading)
 */
export async function getAccount() {
  try {
    const account = await alpaca.getAccount();
    return {
      buyingPower: account.buying_power,
      cash: account.cash,
      portfolioValue: account.portfolio_value,
      equity: account.equity,
    };
  } catch (error) {
    console.error("Error fetching account:", error);
    return null;
  }
}

/**
 * Check if market is open
 */
export async function isMarketOpen() {
  try {
    const clock = await alpaca.getClock();
    return clock.is_open;
  } catch (error) {
    console.error("Error checking market status:", error);
    return false;
  }
}

export default alpaca;
