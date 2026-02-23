"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import AIChat from "@/components/dashboard/AIChat";
import Movers from "@/components/dashboard/Movers";
import TopWatchlist from "@/components/dashboard/TopWatchlist";
import SocialFeed from "@/components/dashboard/SocialFeed";
import PortfolioWidget from "@/components/dashboard/PortfolioWidget";

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

const REFRESH_INTERVALS = {
  "5s": 5000,
  "10s": 10000,
  "30s": 30000,
  "1m": 60000,
};

export default function DashboardPage() {
  const [watchlist] = useState(DEFAULT_WATCHLIST);
  const [prices, setPrices] = useState({});
  const [prevPrices, setPrevPrices] = useState({});
  const [news, setNews] = useState([]);
  const [signals, setSignals] = useState({});
  const [socialData, setSocialData] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState("AAPL");
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [refreshRate, setRefreshRate] = useState("10s");
  const [isLive, setIsLive] = useState(true);
  const [fetchCount, setFetchCount] = useState(0);
  const [priceFlash, setPriceFlash] = useState({});
  const [portfolioKey, setPortfolioKey] = useState(0);
  const intervalRef = useRef(null);
  const newsIntervalRef = useRef(null);
  const socialIntervalRef = useRef(null);

 // const symbols = watchlist.map((w) => w.symbol);

  const symbols = watchlist.map((w) => w.symbol);
  const symbolsParam = symbols.join(",");

  // Fetch prices (fast — every few seconds)
  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(`/api/stocks/prices?symbols=${symbolsParam}&type=quote`);
      if (res.ok) {
        const data = await res.json();
        const newQuotes = data.quotes || {};

        setPrices((prev) => {
          const flashes = {};
          for (const [sym, quote] of Object.entries(newQuotes)) {
            if (prev[sym] && quote.price !== prev[sym].price) {
              flashes[sym] = quote.price > prev[sym].price ? "up" : "down";
            }
          }
          setPriceFlash(flashes);
          setTimeout(() => setPriceFlash({}), 600);
          setPrevPrices(prev);
          return newQuotes;
        });

        setLastUpdate(new Date());
        setFetchCount((c) => c + 1);
      }
    } catch (error) {
      console.error("Price fetch error:", error);
    }
    setLoading(false);
  }, [symbolsParam]);

  // Fetch news + signals (slower — every 2 minutes)
  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch(`/api/news?symbols=${symbolsParam}`);
      if (res.ok) {
        const data = await res.json();
        setNews(data.articles || []);
        if (data.sentiment) {
          setSignals(data.sentiment);
        }
      }
    } catch (error) {
      console.error("News fetch error:", error);
    }
  }, [symbolsParam]);

  const fetchSocial = useCallback(async () => {
    try {
      const res = await fetch(`/api/social?symbols=${symbolsParam}`);
      if (res.ok) {
        const data = await res.json();
        setSocialData(data);
      }
    } catch (error) {
      console.error("Social fetch error:", error);
    }
  }, [symbolsParam]);

  const handleRefresh = () => {
    fetchPrices();
    fetchNews();
    fetchSocial();
  };

  // Price polling
  useEffect(() => {
    fetchPrices();
    if (isLive) {
      intervalRef.current = setInterval(fetchPrices, REFRESH_INTERVALS[refreshRate]);
    }
    return () => clearInterval(intervalRef.current);
  }, [fetchPrices, refreshRate, isLive]);

  // News polling (every 2 min)
  useEffect(() => {
    fetchNews();
    newsIntervalRef.current = setInterval(fetchNews, 120000);
    return () => clearInterval(newsIntervalRef.current);
  }, [fetchNews]);

  // Social polling (every 3 min)
  useEffect(() => {
    fetchSocial();
    socialIntervalRef.current = setInterval(fetchSocial, 180000);
    return () => clearInterval(socialIntervalRef.current);
  }, [fetchSocial]);

  const toggleLive = () => {
    if (isLive) {
      clearInterval(intervalRef.current);
    }
    setIsLive(!isLive);
  };

  const getPriceChange = (symbol) => {
    const current = prices[symbol]?.price;
    const prev = prevPrices[symbol]?.price;
    if (!current || !prev) return { change: 0, pct: "0.00", isUp: true };
    const change = current - prev;
    const pct = ((change / prev) * 100).toFixed(2);
    return { change, pct, isUp: change >= 0 };
  };

  const getSignalLabel = (symbol) => {
    const sent = signals[symbol];
    if (!sent || sent.articleCount === 0) return { label: "—", color: "text-muted-foreground", bg: "bg-muted/30" };
    if (sent.avgScore > 0.3) return { label: "BUY", color: "text-emerald-500", bg: "bg-emerald-500/15" };
    if (sent.avgScore > 0.1) return { label: "LEAN BUY", color: "text-emerald-400", bg: "bg-emerald-400/15" };
    if (sent.avgScore < -0.3) return { label: "SELL", color: "text-red-500", bg: "bg-red-500/15" };
    if (sent.avgScore < -0.1) return { label: "LEAN SELL", color: "text-red-400", bg: "bg-red-400/15" };
    return { label: "HOLD", color: "text-yellow-500", bg: "bg-yellow-500/15" };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-mono text-muted-foreground">Connecting to market data...</p>
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
          {/* Refresh Rate Selector */}
          <div className="flex items-center bg-card border border-border rounded-lg overflow-hidden">
            {Object.keys(REFRESH_INTERVALS).map((rate) => (
              <button
                key={rate}
                onClick={() => setRefreshRate(rate)}
                className={`px-3 py-2 text-xs font-mono transition-all ${
                  refreshRate === rate
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {rate}
              </button>
            ))}
          </div>

          {/* Live Toggle */}
          <button
            onClick={toggleLive}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
              isLive ? "bg-emerald-500/10 border-emerald-500/30" : "bg-card border-border"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isLive ? "bg-bullish animate-live-pulse" : "bg-muted-foreground"}`} />
            <span className="text-xs font-mono text-muted-foreground">{isLive ? "LIVE" : "PAUSED"}</span>
          </button>

          {/* Manual Refresh */}
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg hover:bg-accent transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            <span className="text-xs font-mono text-muted-foreground">REFRESH</span>
          </button>

          <div className="text-right">
            {lastUpdate && (
              <div className="text-xs font-mono text-muted-foreground">{lastUpdate.toLocaleTimeString()}</div>
            )}
            <div className="text-[10px] font-mono text-muted-foreground/50">{fetchCount} updates</div>
          </div>
        </div>
      </div>

      {/* Ticker Strip */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {watchlist.map((stock) => {
          const price = prices[stock.symbol];
          const isSelected = stock.symbol === selectedSymbol;
          const flash = priceFlash[stock.symbol];
          const change = getPriceChange(stock.symbol);
          const signal = getSignalLabel(stock.symbol);
          return (
            <button
              key={stock.symbol}
              onClick={() => setSelectedSymbol(stock.symbol)}
              className={`flex-shrink-0 px-5 py-4 rounded-xl border transition-all ${
                isSelected ? "bg-accent border-primary/40" : "bg-card border-border hover:border-border/80"
              } ${flash === "up" ? "price-up" : flash === "down" ? "price-down" : ""}`}
            >
              <div className="flex items-center gap-4 min-w-[160px]">
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm">{stock.symbol}</span>
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${signal.bg} ${signal.color}`}>
                      {signal.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{stock.sector}</div>
                </div>
                <div className="text-right ml-auto">
                  <div className="font-mono font-semibold text-sm">${price?.price?.toFixed(2) || "—"}</div>
                  {change.pct !== "0.00" && (
                    <div className={`text-[10px] font-mono ${change.isUp ? "text-bullish" : "text-bearish"}`}>
                      {change.isUp ? "▲" : "▼"} {Math.abs(change.pct)}%
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-1 lg:col-span-2 space-y-6">
          {/* Selected Stock Detail */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold font-mono">${prices[selectedSymbol]?.price?.toFixed(2) || "—"}</h2>
                  {(() => {
                    const c = getPriceChange(selectedSymbol);
                    return c.pct !== "0.00" ? (
                      <span className={`px-2 py-1 rounded-md text-xs font-mono font-semibold ${
                        c.isUp ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
                      }`}>
                        {c.isUp ? "+" : ""}{c.pct}%
                      </span>
                    ) : null;
                  })()}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {watchlist.find((w) => w.symbol === selectedSymbol)?.name} · {selectedSymbol}
                </p>
              </div>
              {(() => {
                const sig = getSignalLabel(selectedSymbol);
                const sent = signals[selectedSymbol];
                return (
                  <div className={`px-5 py-3 rounded-xl border text-center ${sig.bg}`} style={{ borderColor: "currentColor", borderOpacity: 0.2 }}>
                    <div className={`text-lg font-bold font-mono ${sig.color}`}>{sig.label}</div>
                    {sent && sent.articleCount > 0 && (
                      <div className="text-[10px] font-mono text-muted-foreground mt-1">
                        Sentiment: {sent.avgScore > 0 ? "+" : ""}{sent.avgScore.toFixed(2)} · {sent.articleCount} articles
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-background rounded-xl p-4">
                <div className="text-[10px] font-mono text-muted-foreground mb-1">BID</div>
                <div className="font-mono font-semibold text-sm">${prices[selectedSymbol]?.bid?.toFixed(2) || "—"}</div>
              </div>
              <div className="bg-background rounded-xl p-4">
                <div className="text-[10px] font-mono text-muted-foreground mb-1">ASK</div>
                <div className="font-mono font-semibold text-sm">${prices[selectedSymbol]?.ask?.toFixed(2) || "—"}</div>
              </div>
              <div className="bg-background rounded-xl p-4">
                <div className="text-[10px] font-mono text-muted-foreground mb-1">SPREAD</div>
                <div className="font-mono font-semibold text-sm">
                  {prices[selectedSymbol]?.bid && prices[selectedSymbol]?.ask
                    ? `$${(prices[selectedSymbol].ask - prices[selectedSymbol].bid).toFixed(2)}`
                    : "—"}
                </div>
              </div>
              <div className="bg-background rounded-xl p-4">
                <div className="text-[10px] font-mono text-muted-foreground mb-1">SENTIMENT</div>
                <div className={`font-mono font-semibold text-sm ${
                  (signals[selectedSymbol]?.avgScore || 0) > 0.1 ? "text-bullish"
                    : (signals[selectedSymbol]?.avgScore || 0) < -0.1 ? "text-bearish" : "text-neutral"
                }`}>
                  {signals[selectedSymbol]
                    ? `${signals[selectedSymbol].avgScore > 0 ? "+" : ""}${signals[selectedSymbol].avgScore.toFixed(2)}`
                    : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Gainers & Losers */}
          <Movers prices={prices} prevPrices={prevPrices} watchlist={watchlist} />

          {/* Social Media Sentiment */}
          <SocialFeed symbols={symbols} selectedSymbol={selectedSymbol} />

          {/* All Signals Grid */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="text-sm font-semibold font-mono text-muted-foreground mb-4">ALL SIGNALS</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {watchlist.map((stock) => {
                const price = prices[stock.symbol];
                const flash = priceFlash[stock.symbol];
                const change = getPriceChange(stock.symbol);
                const signal = getSignalLabel(stock.symbol);
                return (
                  <button
                    key={stock.symbol}
                    onClick={() => setSelectedSymbol(stock.symbol)}
                    className={`p-4 rounded-xl border transition-all text-left ${
                      stock.symbol === selectedSymbol ? "bg-accent border-primary/30" : "bg-background border-border hover:border-border/80"
                    } ${flash === "up" ? "price-up" : flash === "down" ? "price-down" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-bold text-sm">{stock.symbol}</span>
                      <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded ${signal.bg} ${signal.color}`}>
                        {signal.label}
                      </span>
                    </div>
                    <div className="font-mono font-semibold">${price?.price?.toFixed(2) || "—"}</div>
                    {change.pct !== "0.00" && (
                      <div className={`text-[10px] font-mono mt-1 ${change.isUp ? "text-bullish" : "text-bearish"}`}>
                        {change.isUp ? "▲" : "▼"} {Math.abs(change.pct)}%
                      </div>
                    )}
                    {signals[stock.symbol] && (
                      <div className="text-[10px] font-mono text-muted-foreground mt-1">
                        Sent: {signals[stock.symbol].avgScore > 0 ? "+" : ""}{signals[stock.symbol].avgScore.toFixed(2)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Portfolio Widget */}
        <PortfolioWidget key={portfolioKey} prices={prices} />

        {/* News Feed */}
        <div className="bg-card border border-border rounded-2xl p-6 max-h-[800px] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold font-mono text-muted-foreground">LIVE NEWS FEED</h3>
            <span className="text-[10px] font-mono text-muted-foreground">{news.length} articles</span>
          </div>
          <div className="space-y-3 overflow-y-auto flex-1">
            {news.length > 0 ? (
              news.slice(0, 20).map((article, i) => (
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
                        onClick={(e) => { e.preventDefault(); setSelectedSymbol(s); }}
                        className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded cursor-pointer hover:bg-primary/20"
                      >
                        {s}
                      </span>
                    ))}
                    <span className="text-[10px] text-muted-foreground ml-auto">{article.source}</span>
                  </div>
                  <p className="text-xs leading-relaxed">{article.title}</p>
                  {article.sentiment && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`w-2 h-2 rounded-full ${
                        article.sentiment.score > 0.1 ? "bg-bullish" : article.sentiment.score < -0.1 ? "bg-bearish" : "bg-neutral"
                      }`} />
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {article.sentiment.score > 0 ? "+" : ""}{article.sentiment.score.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50 ml-auto">
                        {new Date(article.published_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  )}
                </a>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">Loading news feed...</p>
            )}
          </div>
        </div>

        {/* My Watchlist */}
        <TopWatchlist onSelectSymbol={setSelectedSymbol} />
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground pt-4 border-t border-border">
        <span>⚠️ Not financial advice — For personal analysis only</span>
        <span>StockPulse v1.0 · Refreshing every {refreshRate} · {fetchCount} updates this session</span>
      </div>

      {/* AI Chat */}
      <AIChat
        prices={prices}
        news={news}
        signals={signals}
        watchlist={watchlist}
        socialData={socialData}
        onWatchlistUpdate={() => {
          setFetchCount((c) => c + 0.001);
        }}
        onPortfolioUpdate={() => {
          setPortfolioKey((k) => k + 1);
        }}
      />
    </div>
  );
}
