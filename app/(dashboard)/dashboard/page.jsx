"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import AIChat from "@/components/dashboard/AIChat";
import PortfolioWidget from "@/components/dashboard/PortfolioWidget";
import DailyPicks from "@/components/dashboard/DailyPicks";

const REFRESH_INTERVALS = { "5s": 5000, "10s": 10000, "30s": 30000, "1m": 60000 };
const MARKET_INDICES = [
  { symbol: "SPY", name: "S&P 500" },
  { symbol: "QQQ", name: "Nasdaq" },
  { symbol: "DIA", name: "Dow Jones" },
];

export default function DashboardPage() {
  const { data: session } = useSession();
  const [prices, setPrices] = useState({});
  const [prevPrices, setPrevPrices] = useState({});
  const [news, setNews] = useState([]);
  const [signals, setSignals] = useState({});
  const [socialData, setSocialData] = useState(null);
  const [portfolioSymbols, setPortfolioSymbols] = useState([]);
  const [portfolioHoldings, setPortfolioHoldings] = useState([]);
  const [watchlistSymbols, setWatchlistSymbols] = useState([]);
  const [watchlistData, setWatchlistData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [refreshRate, setRefreshRate] = useState("10s");
  const [isLive, setIsLive] = useState(true);
  const [portfolioKey, setPortfolioKey] = useState(0);
  const intervalRef = useRef(null);
  const newsIntervalRef = useRef(null);
  const socialIntervalRef = useRef(null);

  const allSymbols = [...new Set([...portfolioSymbols, ...watchlistSymbols, ...MARKET_INDICES.map((i) => i.symbol)])];
  const symbolsParam = allSymbols.length > 0 ? allSymbols.join(",") : "SPY,QQQ,DIA";

  useEffect(() => {
    const loadSymbols = async () => {
      try {
        const [portRes, watchRes] = await Promise.all([fetch("/api/portfolio"), fetch("/api/watchlist")]);
        if (portRes.ok) { const d = await portRes.json(); const h = d.portfolio || []; setPortfolioSymbols(h.map((x) => x.symbol)); setPortfolioHoldings(h); }
        if (watchRes.ok) { const d = await watchRes.json(); const w = d.watchlist || []; setWatchlistSymbols(w.map((x) => x.symbol)); setWatchlistData(w); }
      } catch (e) { console.error("Symbol load error:", e); }
    };
    loadSymbols();
  }, [portfolioKey]);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(`/api/stocks/prices?symbols=${symbolsParam}`);
      if (res.ok) { const d = await res.json(); setPrevPrices(prices); setPrices(d.prices || {}); setLastUpdate(new Date()); }
    } catch {} setLoading(false);
  }, [symbolsParam]);

  const fetchNews = useCallback(async () => {
    try { const res = await fetch(`/api/news?symbols=${symbolsParam}`); if (res.ok) { const d = await res.json(); setNews(d.articles || []); setSignals(d.signals || {}); } } catch {}
  }, [symbolsParam]);

  const fetchSocial = useCallback(async () => {
    try { const syms = [...portfolioSymbols, ...watchlistSymbols].slice(0, 5).join(","); if (!syms) return; const res = await fetch(`/api/social?symbols=${syms}`); if (res.ok) setSocialData(await res.json()); } catch {}
  }, [portfolioSymbols, watchlistSymbols]);

  useEffect(() => { fetchPrices(); fetchNews(); fetchSocial(); }, [fetchPrices, fetchNews, fetchSocial]);
  useEffect(() => { if (!isLive) { clearInterval(intervalRef.current); return; } intervalRef.current = setInterval(fetchPrices, REFRESH_INTERVALS[refreshRate] || 10000); return () => clearInterval(intervalRef.current); }, [isLive, refreshRate, fetchPrices]);
  useEffect(() => { newsIntervalRef.current = setInterval(fetchNews, 120000); return () => clearInterval(newsIntervalRef.current); }, [fetchNews]);
  useEffect(() => { socialIntervalRef.current = setInterval(fetchSocial, 300000); return () => clearInterval(socialIntervalRef.current); }, [fetchSocial]);

  const handleRefresh = () => { fetchPrices(); fetchNews(); fetchSocial(); };
  const firstName = session?.user?.name?.split(" ")[0] || "Trader";

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold">Welcome back, {firstName}</h1>
          <p className="text-xs text-muted-foreground font-mono">StockPulse Dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={refreshRate} onChange={(e) => setRefreshRate(e.target.value)} className="bg-card border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none">
            {Object.keys(REFRESH_INTERVALS).map((r) => (<option key={r} value={r}>{r}</option>))}
          </select>
          <button onClick={() => setIsLive(!isLive)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${isLive ? "bg-emerald-500/10 border-emerald-500/30" : "bg-card border-border"}`}>
            <span className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
            <span className="text-xs font-mono text-muted-foreground">{isLive ? "LIVE" : "PAUSED"}</span>
          </button>
          <button onClick={handleRefresh} className="px-3 py-2 bg-card border border-border rounded-lg hover:bg-accent transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
          </button>
          {lastUpdate && <div className="text-xs font-mono text-muted-foreground hidden sm:block">{lastUpdate.toLocaleTimeString()}</div>}
        </div>
      </div>

      {/* Market Indices */}
      <div className="flex gap-3">
        {MARKET_INDICES.map((idx) => {
          const p = prices[idx.symbol]; const prev = prevPrices[idx.symbol];
          const change = p?.price && prev?.price ? ((p.price - prev.price) / prev.price * 100) : 0;
          return (
            <div key={idx.symbol} className="flex-1 bg-card border border-border rounded-xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono text-muted-foreground">{idx.name}</div>
                  <div className="font-mono font-bold text-sm">${p?.price?.toFixed(2) || "—"}</div>
                </div>
                {change !== 0 && (
                  <span className={`text-xs font-mono font-semibold px-2 py-1 rounded ${change > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                    {change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Layout: Chat (2 cols) | Sidebar (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT 2/3: AI Chat — front and center */}
        <div className="col-span-1 lg:col-span-2">
          <AIChat prices={prices} news={news} signals={signals} watchlist={watchlistData} portfolio={portfolioHoldings} socialData={socialData} userName={session?.user?.name || ""} onWatchlistUpdate={() => setPortfolioKey((k) => k + 1)} onPortfolioUpdate={() => setPortfolioKey((k) => k + 1)} />
        </div>

        {/* RIGHT 1/3: Discoveries + Watchlist + Portfolio */}
        <div className="space-y-6">
          <DailyPicks prices={prices} news={news} signals={signals} portfolio={portfolioSymbols} watchlist={watchlistSymbols} onWatchlistUpdate={() => setPortfolioKey((k) => k + 1)} />

          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="text-xs font-mono font-semibold text-muted-foreground mb-3">WATCHLIST</h3>
            {watchlistSymbols.length > 0 ? (
              <div className="space-y-1.5">
                {watchlistSymbols.map((sym) => {
                  const p = prices[sym]; const prev = prevPrices[sym];
                  const change = p?.price && prev?.price ? ((p.price - prev.price) / prev.price * 100) : 0;
                  return (
                    <div key={sym} className="flex items-center justify-between p-2.5 bg-background rounded-lg">
                      <span className="font-mono font-bold text-xs">{sym}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">${p?.price?.toFixed(2) || "—"}</span>
                        {change !== 0 && <span className={`text-[10px] font-mono font-semibold ${change > 0 ? "text-emerald-500" : "text-red-500"}`}>{change > 0 ? "▲" : "▼"}{Math.abs(change).toFixed(2)}%</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-xs text-muted-foreground text-center py-4">Tell the AI to add stocks</p>}
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-mono font-semibold text-muted-foreground">NEWS</h3>
              <span className="text-[10px] font-mono text-muted-foreground">{news.length}</span>
            </div>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {news.length > 0 ? news.slice(0, 12).map((article, i) => (
                <a key={i} href={article.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 p-2.5 bg-background rounded-lg border border-border hover:border-primary/20 transition-all">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${article.sentiment?.score > 0.1 ? "bg-emerald-500" : article.sentiment?.score < -0.1 ? "bg-red-500" : "bg-yellow-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] leading-relaxed line-clamp-2">{article.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {article.symbols?.slice(0, 2).map((s) => <span key={s} className="text-[9px] font-mono font-bold text-primary">${s}</span>)}
                      <span className="text-[9px] text-muted-foreground ml-auto">{article.source}</span>
                    </div>
                  </div>
                </a>
              )) : <p className="text-xs text-muted-foreground text-center py-6">Loading...</p>}
            </div>
          </div>

          <PortfolioWidget key={portfolioKey} prices={prices} signals={signals} />
        </div>
      </div>

      <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground pt-4 border-t border-border">
        <span>Not financial advice — For personal analysis only</span>
        <span>StockPulse v1.0 · {refreshRate}</span>
      </div>
    </div>
  );
}
