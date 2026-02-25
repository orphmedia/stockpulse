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

// Inline sparkline SVG
function Sparkline({ data, width = 120, height = 32 }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const prices = data.map((d) => d.close || d.price || d);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const stepX = width / (prices.length - 1);
  const points = prices.map((p, i) => `${i * stepX},${height - ((p - min) / range) * (height - 4) - 2}`).join(" ");
  const isUp = prices[prices.length - 1] >= prices[0];
  const color = isUp ? "#10b981" : "#ef4444";
  // Area fill
  const areaPoints = `0,${height} ${points} ${(prices.length - 1) * stepX},${height}`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`sg-${isUp ? "up" : "dn"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#sg-${isUp ? "up" : "dn"})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
  const [indexCharts, setIndexCharts] = useState({});
  const intervalRef = useRef(null);
  const chartsFetched = useRef(false);

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

  // Fetch intraday charts for market indices (once)
  useEffect(() => {
    if (chartsFetched.current || loading) return;
    chartsFetched.current = true;
    const fetchCharts = async () => {
      const charts = {};
      await Promise.all(MARKET_INDICES.map(async (idx) => {
        try {
          const r = await fetch(`/api/stocks/prices?type=historical&symbol=${idx.symbol}&timeframe=5Min&limit=78`);
          if (r.ok) {
            const d = await r.json();
            if (d.bars?.length >= 2) charts[idx.symbol] = d.bars;
          }
        } catch {}
      }));
      setIndexCharts(charts);
    };
    fetchCharts();
  }, [loading]);

  const handleDataUpdate = () => setPortfolioKey((k) => k + 1);

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">StockPulse</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsLive(!isLive)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono ${isLive ? "text-emerald-500" : "text-muted-foreground"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
            {isLive ? "LIVE" : "PAUSED"}
          </button>
          {lastUpdate && <span className="text-[10px] font-mono text-muted-foreground hidden sm:block">{lastUpdate.toLocaleTimeString()}</span>}
        </div>
      </div>

      {/* Market indices with charts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {MARKET_INDICES.map((idx) => {
          const p = prices[idx.symbol];
          const ch = p?.changePct || 0;
          const vol = p?.volume || 0;
          const fmtVol = vol >= 1e9 ? `${(vol / 1e9).toFixed(2)}B` : vol >= 1e6 ? `${(vol / 1e6).toFixed(1)}M` : vol >= 1e3 ? `${(vol / 1e3).toFixed(0)}K` : `${vol}`;
          return (
            <a key={idx.symbol} href={`/stock/${idx.symbol}`} className="bg-card border border-border rounded-xl p-3 hover:bg-accent/30 transition-all cursor-pointer block">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-muted-foreground">{idx.name}</span>
                {ch !== 0 && (
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${ch > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                    {ch > 0 ? "▲" : "▼"} {Math.abs(ch).toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono font-bold text-lg">${p?.price?.toFixed(2) || "—"}</span>
                    {p?.change != null && (
                      <span className={`text-xs font-mono ${p.change >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {p.change >= 0 ? "+" : ""}{p.change.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[9px] font-mono text-muted-foreground">
                    {vol > 0 && <span>Vol: {fmtVol}</span>}
                    {p?.high > 0 && <span>H: ${p.high.toFixed(2)}</span>}
                    {p?.low > 0 && <span>L: ${p.low.toFixed(2)}</span>}
                  </div>
                </div>
                <Sparkline data={indexCharts[idx.symbol]} width={100} height={36} />
              </div>
            </a>
          );
        })}
      </div>

      {/* Main Layout: Chat (2/3) + Right Column (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2/3: Chat */}
        <div className="col-span-1 lg:col-span-2">
          <AIChat prices={prices} news={news} signals={signals} watchlist={watchlistData} portfolio={portfolioHoldings} socialData={socialData} onWatchlistUpdate={handleDataUpdate} onPortfolioUpdate={handleDataUpdate} dataReady={!loading && Object.keys(prices).length > 0} />
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
                    const p = prices[sym];
                    const ch = p?.changePct || 0;
                    return (
                      <a key={sym} href={`/stock/${sym}`} className="flex items-center justify-between p-2.5 bg-background rounded-lg hover:bg-accent/50 transition-all cursor-pointer">
                        <div>
                          <span className="font-mono font-bold text-xs">{sym}</span>
                          {p?.name && <span className="text-[9px] text-muted-foreground ml-1.5">{p.name}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold">${p?.price?.toFixed(2) || "—"}</span>
                          {ch !== 0 && <span className={`text-[10px] font-mono font-semibold ${ch > 0 ? "text-emerald-500" : "text-red-500"}`}>{ch > 0 ? "▲" : "▼"}{Math.abs(ch).toFixed(2)}%</span>}
                        </div>
                      </a>
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
