"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import AIChat from "@/components/dashboard/AIChat";
import PortfolioWidget from "@/components/dashboard/PortfolioWidget";

const REFRESH_INTERVALS = { "5s": 5000, "10s": 10000, "30s": 30000, "1m": 60000 };

// Only fetch prices for portfolio stocks (loaded dynamically)
const MARKET_INDICES = [
  { symbol: "SPY", name: "S&P 500" },
  { symbol: "QQQ", name: "Nasdaq" },
  { symbol: "DIA", name: "Dow Jones" },
];

export default function DashboardPage() {
  const [prices, setPrices] = useState({});
  const [prevPrices, setPrevPrices] = useState({});
  const [news, setNews] = useState([]);
  const [signals, setSignals] = useState({});
  const [socialData, setSocialData] = useState(null);
  const [portfolioSymbols, setPortfolioSymbols] = useState([]);
  const [watchlistSymbols, setWatchlistSymbols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [refreshRate, setRefreshRate] = useState("10s");
  const [isLive, setIsLive] = useState(true);
  const [portfolioKey, setPortfolioKey] = useState(0);
  const intervalRef = useRef(null);
  const newsIntervalRef = useRef(null);
  const socialIntervalRef = useRef(null);

  // Build symbols list from portfolio + watchlist + indices
  const allSymbols = [...new Set([
    ...portfolioSymbols,
    ...watchlistSymbols,
    ...MARKET_INDICES.map((i) => i.symbol),
  ])];
  const symbolsParam = allSymbols.length > 0 ? allSymbols.join(",") : "SPY,QQQ,DIA";

  // Load portfolio symbols
  useEffect(() => {
    const loadSymbols = async () => {
      try {
        const [portRes, watchRes] = await Promise.all([
          fetch("/api/portfolio"),
          fetch("/api/watchlist"),
        ]);
        if (portRes.ok) {
          const data = await portRes.json();
          setPortfolioSymbols((data.portfolio || []).map((h) => h.symbol));
        }
        if (watchRes.ok) {
          const data = await watchRes.json();
          setWatchlistSymbols((data.watchlist || []).map((w) => w.symbol));
        }
      } catch (e) { console.error("Symbol load error:", e); }
    };
    loadSymbols();
  }, [portfolioKey]);

  // Fetch prices
  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(`/api/stocks/prices?symbols=${symbolsParam}&type=quote`);
      if (res.ok) {
        const data = await res.json();
        setPrevPrices((prev) => Object.keys(prev).length > 0 ? prev : data.quotes);
        setPrices((prev) => {
          setPrevPrices(prev);
          return data.quotes || {};
        });
        setLastUpdate(new Date());
        setLoading(false);
      }
    } catch (e) { console.error("Price error:", e); setLoading(false); }
  }, [symbolsParam]);

  // Fetch news
  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch(`/api/news?symbols=${symbolsParam}`);
      if (res.ok) {
        const data = await res.json();
        setNews(data.articles || []);
        if (data.sentiment) setSignals(data.sentiment);
      }
    } catch (e) { console.error("News error:", e); }
  }, [symbolsParam]);

  // Fetch social
  const fetchSocial = useCallback(async () => {
    try {
      const res = await fetch(`/api/social?symbols=${symbolsParam}`);
      if (res.ok) setSocialData(await res.json());
    } catch (e) { console.error("Social error:", e); }
  }, [symbolsParam]);

  // Polling
  useEffect(() => {
    fetchPrices();
    if (isLive) intervalRef.current = setInterval(fetchPrices, REFRESH_INTERVALS[refreshRate]);
    return () => clearInterval(intervalRef.current);
  }, [fetchPrices, refreshRate, isLive]);

  useEffect(() => {
    fetchNews();
    newsIntervalRef.current = setInterval(fetchNews, 120000);
    return () => clearInterval(newsIntervalRef.current);
  }, [fetchNews]);

  useEffect(() => {
    fetchSocial();
    socialIntervalRef.current = setInterval(fetchSocial, 180000);
    return () => clearInterval(socialIntervalRef.current);
  }, [fetchSocial]);

  const handleRefresh = () => { fetchPrices(); fetchNews(); fetchSocial(); };

  // Loading state
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tap the chat bubble to talk to your AI assistant
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Refresh Rate */}
          <div className="flex items-center bg-card border border-border rounded-lg overflow-hidden">
            {Object.keys(REFRESH_INTERVALS).map((rate) => (
              <button key={rate} onClick={() => setRefreshRate(rate)}
                className={`px-3 py-2 text-xs font-mono transition-all ${
                  refreshRate === rate ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>{rate}</button>
            ))}
          </div>

          {/* Live */}
          <button onClick={() => { if (isLive) clearInterval(intervalRef.current); setIsLive(!isLive); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
              isLive ? "bg-emerald-500/10 border-emerald-500/30" : "bg-card border-border"
            }`}>
            <span className={`w-2 h-2 rounded-full ${isLive ? "bg-bullish animate-live-pulse" : "bg-muted-foreground"}`} />
            <span className="text-xs font-mono text-muted-foreground">{isLive ? "LIVE" : "PAUSED"}</span>
          </button>

          {/* Refresh */}
          <button onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg hover:bg-accent transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          </button>

          {lastUpdate && (
            <div className="text-xs font-mono text-muted-foreground hidden sm:block">{lastUpdate.toLocaleTimeString()}</div>
          )}
        </div>
      </div>

      {/* Market Indices — compact strip */}
      <div className="flex gap-3">
        {MARKET_INDICES.map((idx) => {
          const p = prices[idx.symbol];
          const prev = prevPrices[idx.symbol];
          const change = p?.price && prev?.price ? ((p.price - prev.price) / prev.price * 100) : 0;
          return (
            <div key={idx.symbol} className="flex-1 bg-card border border-border rounded-xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono text-muted-foreground">{idx.name}</div>
                  <div className="font-mono font-bold text-sm">${p?.price?.toFixed(2) || "—"}</div>
                </div>
                {change !== 0 && (
                  <span className={`text-xs font-mono font-semibold px-2 py-1 rounded ${
                    change > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                  }`}>
                    {change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Portfolio + News */}
        <div className="col-span-1 lg:col-span-2 space-y-6">
          {/* Portfolio */}
          <PortfolioWidget key={portfolioKey} prices={prices} signals={signals} />

          {/* News Feed — compact */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-mono font-semibold text-muted-foreground">NEWS & SENTIMENT</h3>
              <span className="text-[10px] font-mono text-muted-foreground">{news.length} articles</span>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {news.length > 0 ? (
                news.slice(0, 15).map((article, i) => (
                  <a key={i} href={article.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 bg-background rounded-lg border border-border hover:border-primary/20 transition-all">
                    {/* Sentiment dot */}
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      article.sentiment?.score > 0.1 ? "bg-emerald-500"
                      : article.sentiment?.score < -0.1 ? "bg-red-500" : "bg-yellow-500"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-relaxed line-clamp-2">{article.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {article.symbols?.slice(0, 3).map((s) => (
                          <span key={s} className="text-[9px] font-mono font-bold text-primary">${s}</span>
                        ))}
                        <span className="text-[9px] text-muted-foreground ml-auto">{article.source}</span>
                      </div>
                    </div>
                  </a>
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">Loading news...</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Quick Watchlist */}
        <div className="space-y-6">
          {/* Watchlist */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="text-xs font-mono font-semibold text-muted-foreground mb-3">WATCHLIST</h3>
            {watchlistSymbols.length > 0 ? (
              <div className="space-y-1.5">
                {watchlistSymbols.map((sym) => {
                  const p = prices[sym];
                  const prev = prevPrices[sym];
                  const change = p?.price && prev?.price ? ((p.price - prev.price) / prev.price * 100) : 0;
                  return (
                    <div key={sym} className="flex items-center justify-between p-2.5 bg-background rounded-lg">
                      <span className="font-mono font-bold text-xs">{sym}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">${p?.price?.toFixed(2) || "—"}</span>
                        {change !== 0 && (
                          <span className={`text-[10px] font-mono font-semibold ${change > 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {change > 0 ? "▲" : "▼"}{Math.abs(change).toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                Tell the AI to add stocks to watch
              </p>
            )}
          </div>

          {/* Quick Stats */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="text-xs font-mono font-semibold text-muted-foreground mb-3">AI ASSISTANT</h3>
            <div className="space-y-3 text-xs text-muted-foreground">
              <p>🎙️ <span className="text-foreground font-medium">Voice commands</span> — tap the mic and talk</p>
              <p>📊 <span className="text-foreground font-medium">Portfolio</span> — "Add 50 shares of AAPL"</p>
              <p>👁 <span className="text-foreground font-medium">Monitor</span> — "Watch NVDA for me"</p>
              <p>📰 <span className="text-foreground font-medium">Analysis</span> — "What's the buzz on Tesla?"</p>
              <p>📋 <span className="text-foreground font-medium">Watchlist</span> — "Build me a top 10"</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground pt-4 border-t border-border">
        <span>Not financial advice — For personal analysis only</span>
        <span>StockPulse v1.0 · Refreshing every {refreshRate}</span>
      </div>

      {/* AI Chat */}
      <AIChat
        prices={prices}
        news={news}
        signals={signals}
        watchlist={watchlistSymbols.map((s) => ({ symbol: s }))}
        socialData={socialData}
        onWatchlistUpdate={() => setPortfolioKey((k) => k + 1)}
        onPortfolioUpdate={() => setPortfolioKey((k) => k + 1)}
      />
    </div>
  );
}
