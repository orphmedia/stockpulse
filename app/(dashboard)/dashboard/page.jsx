"use client";

import { useState, useEffect, useCallback } from "react";

// Default watchlist — will be loaded from DB later
const DEFAULT_WATCHLIST = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology" },
  { symbol: "NVDA", name: "NVIDIA Corp.", sector: "Technology" },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Technology" },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "Consumer" },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Technology" },
  { symbol: "META", name: "Meta Platforms", sector: "Technology" },
  { symbol: "TSLA", name: "Tesla Inc.", sector: "Automotive" },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Finance" },
];

export default function DashboardPage() {
  const [watchlist] = useState(DEFAULT_WATCHLIST);
  const [prices, setPrices] = useState({});
  const [news, setNews] = useState([]);
  const [signals, setSignals] = useState({});
  const [selectedSymbol, setSelectedSymbol] = useState("AAPL");
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const symbols = watchlist.map((w) => w.symbol);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      const symbolsParam = symbols.join(",");

      // Fetch prices and news in parallel
      const [priceRes, newsRes] = await Promise.all([
        fetch(`/api/stocks/prices?symbols=${symbolsParam}&type=quote`),
        fetch(`/api/news?symbols=${symbolsParam}`),
      ]);

      if (priceRes.ok) {
        const priceData = await priceRes.json();
        setPrices(priceData.quotes || {});
      }

      if (newsRes.ok) {
        const newsData = await newsRes.json();
        setNews(newsData.articles || []);
        // Sentiment data feeds into signal generation on the backend
      }

      setLastUpdate(new Date());
      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  }, [symbols]);

  // Initial fetch + polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every 60s
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-mono text-muted-foreground">Loading market data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time analysis across {watchlist.length} symbols
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg">
            <span className="w-2 h-2 rounded-full bg-bullish animate-live-pulse" />
            <span className="text-xs font-mono text-muted-foreground">LIVE</span>
          </div>
          {lastUpdate && (
            <span className="text-xs font-mono text-muted-foreground">
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Ticker Strip */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {watchlist.map((stock) => {
          const price = prices[stock.symbol];
          const isSelected = stock.symbol === selectedSymbol;
          return (
            <button
              key={stock.symbol}
              onClick={() => setSelectedSymbol(stock.symbol)}
              className={`flex-shrink-0 px-5 py-4 rounded-xl border transition-all ${
                isSelected
                  ? "bg-accent border-primary/40"
                  : "bg-card border-border hover:border-border/80"
              }`}
            >
              <div className="flex items-center gap-4 min-w-[140px]">
                <div className="text-left">
                  <div className="font-mono font-bold text-sm">{stock.symbol}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{stock.sector}</div>
                </div>
                <div className="text-right ml-auto">
                  <div className="font-mono font-semibold text-sm">
                    ${price?.price?.toFixed(2) || "—"}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Price Chart Area */}
        <div className="col-span-2 bg-card border border-border rounded-2xl p-6 min-h-[400px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold font-mono">{selectedSymbol}</h2>
              <p className="text-sm text-muted-foreground">
                {watchlist.find((w) => w.symbol === selectedSymbol)?.name}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold font-mono">
                ${prices[selectedSymbol]?.price?.toFixed(2) || "—"}
              </div>
            </div>
          </div>

          {/* Chart placeholder — integrate Recharts here */}
          <div className="flex items-center justify-center h-[300px] border border-dashed border-border rounded-xl">
            <p className="text-sm text-muted-foreground font-mono">
              Chart renders here with historical data from Alpaca
            </p>
          </div>
        </div>

        {/* News Feed */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-semibold font-mono text-muted-foreground mb-4">
            LIVE NEWS FEED
          </h3>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {news.length > 0 ? (
              news.slice(0, 15).map((article, i) => (
                <a
                  key={i}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 bg-background rounded-lg border border-border hover:border-primary/30 transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {article.symbols?.map((s) => (
                      <span
                        key={s}
                        className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded"
                      >
                        {s}
                      </span>
                    ))}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {article.source}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed">{article.title}</p>
                  {article.sentiment && (
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          article.sentiment.score > 0.1
                            ? "bg-bullish"
                            : article.sentiment.score < -0.1
                            ? "bg-bearish"
                            : "bg-neutral"
                        }`}
                      />
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {article.sentiment.score > 0 ? "+" : ""}
                        {article.sentiment.score.toFixed(2)}
                      </span>
                    </div>
                  )}
                </a>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">
                News will appear here once RSS feeds are connected
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Signals Overview */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-sm font-semibold font-mono text-muted-foreground mb-4">
          ALL SIGNALS
        </h3>
        <div className="grid grid-cols-4 gap-4">
          {watchlist.map((stock) => (
            <button
              key={stock.symbol}
              onClick={() => setSelectedSymbol(stock.symbol)}
              className={`p-4 rounded-xl border transition-all text-left ${
                stock.symbol === selectedSymbol
                  ? "bg-accent border-primary/30"
                  : "bg-background border-border hover:border-border/80"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono font-bold text-sm">{stock.symbol}</span>
                <span className="text-[10px] font-mono font-bold text-neutral bg-neutral/10 px-2 py-0.5 rounded">
                  HOLD
                </span>
              </div>
              <div className="font-mono font-semibold">
                ${prices[stock.symbol]?.price?.toFixed(2) || "—"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground pt-4 border-t border-border">
        <span>⚠️ Not financial advice — For personal analysis only</span>
        <span>StockPulse v1.0</span>
      </div>
    </div>
  );
}
