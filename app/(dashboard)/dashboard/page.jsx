"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import AIChat from "@/components/dashboard/AIChat";
import DailyPicks from "@/components/dashboard/DailyPicks";
import PortfolioWidget from "@/components/dashboard/PortfolioWidget";

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
  const [isLive, setIsLive] = useState(true);
  const [portfolioKey, setPortfolioKey] = useState(0);
  const [sidePanel, setSidePanel] = useState("picks");
  const intervalRef = useRef(null);

  const allSymbols = [...new Set([...portfolioSymbols, ...watchlistSymbols, ...MARKET_INDICES.map((i) => i.symbol)])];
  const symbolsParam = allSymbols.length > 0 ? allSymbols.join(",") : "SPY,QQQ,DIA";

  useEffect(() => {
    const load = async () => {
      try {
        const [pR, wR] = await Promise.all([fetch("/api/portfolio"), fetch("/api/watchlist")]);
        if (pR.ok) { const d = await pR.json(); const h = d.portfolio || []; setPortfolioSymbols(h.map((x) => x.symbol)); setPortfolioHoldings(h); }
        if (wR.ok) { const d = await wR.json(); const w = d.watchlist || []; setWatchlistSymbols(w.map((x) => x.symbol)); setWatchlistData(w); }
      } catch {}
    };
    load();
  }, [portfolioKey]);

  const fetchPrices = useCallback(async () => {
    try {
      const r = await fetch(`/api/stocks/prices?symbols=${symbolsParam}`);
      if (r.ok) { const d = await r.json(); setPrevPrices((p) => ({ ...p, ...prices })); setPrices(d.prices || {}); setSignals(d.signals || {}); setLastUpdate(new Date()); setLoading(false); }
    } catch {}
  }, [symbolsParam]);

  const fetchNews = useCallback(async () => {
    try {
      const s = allSymbols.filter((x) => !["SPY", "QQQ", "DIA"].includes(x)).slice(0, 8).join(",") || "AAPL,NVDA,MSFT,TSLA";
      const r = await fetch(`/api/news?symbols=${s}`);
      if (r.ok) { const d = await r.json(); setNews(d.articles || []); }
    } catch {}
  }, [allSymbols.join(",")]);

  useEffect(() => { fetchPrices(); fetchNews(); }, [symbolsParam]);
  useEffect(() => { if (!isLive) { clearInterval(intervalRef.current); return; } intervalRef.current = setInterval(fetchPrices, 10000); return () => clearInterval(intervalRef.current); }, [fetchPrices, isLive]);

  const handleDataUpdate = () => setPortfolioKey((k) => k + 1);

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header with indices */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold">StockPulse</h1>
          <div className="hidden sm:flex gap-3">
            {MARKET_INDICES.map((idx) => {
              const p = prices[idx.symbol]; const prev = prevPrices[idx.symbol];
              const ch = p?.price && prev?.price ? ((p.price - prev.price) / prev.price * 100) : 0;
              return (
                <div key={idx.symbol} className="flex items-center gap-1.5 text-[11px] font-mono">
                  <span className="text-muted-foreground">{idx.name}</span>
                  <span className="font-semibold">${p?.price?.toFixed(0) || "—"}</span>
                  {ch !== 0 && <span className={ch > 0 ? "text-emerald-500" : "text-red-500"}>{ch > 0 ? "▲" : "▼"}{Math.abs(ch).toFixed(1)}%</span>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsLive(!isLive)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono ${isLive ? "text-emerald-500" : "text-muted-foreground"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
            {isLive ? "LIVE" : "PAUSED"}
          </button>
          {lastUpdate && <span className="text-[10px] font-mono text-muted-foreground hidden sm:block">{lastUpdate.toLocaleTimeString()}</span>}
        </div>
      </div>

      {/* Main Layout: Chat (2/3) + Right Column (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2/3: Chat */}
        <div className="col-span-1 lg:col-span-2">
          <AIChat prices={prices} news={news} signals={signals} watchlist={watchlistData} portfolio={portfolioHoldings} socialData={socialData} onWatchlistUpdate={handleDataUpdate} onPortfolioUpdate={handleDataUpdate} />
        </div>

        {/* Right 1/3: Tabbed - Picks / Portfolio / Watchlist */}
        <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "85vh" }}>
          {/* Tabs */}
          <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
            {[
              { id: "picks", label: "⭐ Discoveries" },
              { id: "portfolio", label: "💼 Portfolio" },
              { id: "watchlist", label: "👁 Watchlist" },
            ].map((t) => (
              <button key={t.id} onClick={() => setSidePanel(t.id)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                  sidePanel === t.id ? "bg-blue-500 text-white" : "text-muted-foreground hover:text-foreground"
                }`}>{t.label}</button>
            ))}
          </div>

          {sidePanel === "picks" && (
            <DailyPicks prices={prices} news={news} signals={signals} portfolio={portfolioSymbols} watchlist={watchlistSymbols} onWatchlistUpdate={handleDataUpdate} />
          )}

          {sidePanel === "portfolio" && (
            <PortfolioWidget key={portfolioKey} prices={prices} signals={signals} />
          )}

          {sidePanel === "watchlist" && (
            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="text-xs font-mono font-semibold text-muted-foreground mb-3">WATCHLIST</h3>
              {watchlistSymbols.length > 0 ? (
                <div className="space-y-1.5">
                  {watchlistSymbols.map((sym) => {
                    const p = prices[sym]; const prev = prevPrices[sym];
                    const ch = p?.price && prev?.price ? ((p.price - prev.price) / prev.price * 100) : 0;
                    return (
                      <div key={sym} className="flex items-center justify-between p-2.5 bg-background rounded-lg">
                        <span className="font-mono font-bold text-xs">{sym}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">${p?.price?.toFixed(2) || "—"}</span>
                          {ch !== 0 && <span className={`text-[10px] font-mono font-semibold ${ch > 0 ? "text-emerald-500" : "text-red-500"}`}>{ch > 0 ? "▲" : "▼"}{Math.abs(ch).toFixed(1)}%</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-xs text-muted-foreground text-center py-3">Ask the AI to watch stocks for you</p>}
            </div>
          )}
        </div>
      </div>

      <div className="text-center text-[10px] font-mono text-muted-foreground pt-2">Not financial advice · StockPulse v1.0</div>
    </div>
  );
}
