// Alpaca Market Data API — Direct REST calls (no npm dependency)
const DATA_BASE = process.env.ALPACA_DATA_URL || "https://data.alpaca.markets";
const TRADE_BASE = process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";

const headers = {
  "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
  "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET,
  "Content-Type": "application/json",
};

async function alpacaFetch(url, base = DATA_BASE) {
  const fullUrl = `${base}${url}`;
  console.log(`[Alpaca] Fetching: ${fullUrl}`);

  const res = await fetch(fullUrl, { headers, cache: "no-store" });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[Alpaca] Error ${res.status}: ${errorText}`);
    throw new Error(`Alpaca API error: ${res.status} — ${errorText}`);
  }

  return res.json();
}

/**
 * Get latest quotes for multiple symbols
 */
export async function getMultiQuotes(symbols) {
  try {
    const symbolParam = symbols.join(",");
    const data = await alpacaFetch(`/v2/stocks/quotes/latest?symbols=${symbolParam}&feed=iex`);

    const results = {};
    if (data.quotes) {
      for (const [symbol, quote] of Object.entries(data.quotes)) {
        results[symbol] = {
          symbol,
          price: quote.ap || quote.bp || 0,
          bid: quote.bp || 0,
          ask: quote.ap || 0,
          timestamp: quote.t,
        };
      }
    }

    console.log(`[Alpaca] Got quotes for ${Object.keys(results).length} symbols`);
    return results;
  } catch (error) {
    console.error("[Alpaca] Multi quotes error:", error.message);
    return {};
  }
}

/**
 * Get latest trades for multiple symbols (fallback if quotes are empty)
 */
export async function getMultiTrades(symbols) {
  try {
    const symbolParam = symbols.join(",");
    const data = await alpacaFetch(`/v2/stocks/trades/latest?symbols=${symbolParam}&feed=iex`);

    const results = {};
    if (data.trades) {
      for (const [symbol, trade] of Object.entries(data.trades)) {
        results[symbol] = {
          symbol,
          price: trade.p || 0,
          bid: trade.p || 0,
          ask: trade.p || 0,
          timestamp: trade.t,
        };
      }
    }

    return results;
  } catch (error) {
    console.error("[Alpaca] Multi trades error:", error.message);
    return {};
  }
}

/**
 * Get real-time quote for a symbol
 */
export async function getQuote(symbol) {
  try {
    const data = await alpacaFetch(`/v2/stocks/${symbol}/quotes/latest?feed=iex`);
    return {
      symbol,
      price: data.quote?.ap || data.quote?.bp || 0,
      bid: data.quote?.bp || 0,
      ask: data.quote?.ap || 0,
      timestamp: data.quote?.t,
    };
  } catch (error) {
    console.error(`[Alpaca] Quote error for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Get latest trade for a symbol
 */
export async function getLatestTrade(symbol) {
  try {
    const data = await alpacaFetch(`/v2/stocks/${symbol}/trades/latest?feed=iex`);
    return {
      symbol,
      price: data.trade?.p || 0,
      size: data.trade?.s || 0,
      timestamp: data.trade?.t,
    };
  } catch (error) {
    console.error(`[Alpaca] Trade error for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Get historical bars (OHLCV) for a symbol
 */
export async function getBars(symbol, timeframe = "1Day", limit = 60) {
  try {
    const data = await alpacaFetch(
      `/v2/stocks/${symbol}/bars?timeframe=${timeframe}&limit=${limit}&feed=iex`
    );

    return (data.bars || []).map((bar) => ({
      symbol,
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      vwap: bar.vw,
    }));
  } catch (error) {
    console.error(`[Alpaca] Bars error for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Get account info (paper trading)
 */
export async function getAccount() {
  try {
    const data = await alpacaFetch("/v2/account", TRADE_BASE);
    return {
      buyingPower: data.buying_power,
      cash: data.cash,
      portfolioValue: data.portfolio_value,
      equity: data.equity,
    };
  } catch (error) {
    console.error("[Alpaca] Account error:", error.message);
    return null;
  }
}

/**
 * Check if market is open
 */
export async function isMarketOpen() {
  try {
    const data = await alpacaFetch("/v2/clock", TRADE_BASE);
    return data.is_open;
  } catch (error) {
    console.error("[Alpaca] Clock error:", error.message);
    return false;
  }
}
