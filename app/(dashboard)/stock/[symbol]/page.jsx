"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";

const TIMEFRAMES = [
  { label: "1D", value: "1d", tf: "5Min", limit: 78 },
  { label: "1W", value: "1w", tf: "30Min", limit: 70 },
  { label: "1M", value: "1m", tf: "1Day", limit: 22 },
  { label: "3M", value: "3m", tf: "1Day", limit: 63 },
  { label: "1Y", value: "1y", tf: "1Day", limit: 252 },
  { label: "5Y", value: "5y", tf: "1Week", limit: 260 },
];

function MiniChart({ bars, height = 200 }) {
  if (!bars || bars.length < 2) return <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No chart data</div>;

  const prices = bars.map((b) => b.close || b.price);
  const min = Math.min(...prices) * 0.998;
  const max = Math.max(...prices) * 1.002;
  const range = max - min || 1;
  const w = 800;
  const h = height;
  const stepX = w / (prices.length - 1);

  const points = prices.map((p, i) => `${i * stepX},${h - ((p - min) / range) * h}`).join(" ");
  const areaPoints = `0,${h} ${points} ${(prices.length - 1) * stepX},${h}`;

  const isUp = prices[prices.length - 1] >= prices[0];
  const color = isUp ? "#10b981" : "#ef4444";

  // Volume bars
  const volumes = bars.map((b) => b.volume || 0);
  const maxVol = Math.max(...volumes) || 1;

  return (
    <svg viewBox={`0 0 ${w} ${h + 40}`} className="w-full" style={{ height: `${height + 40}px` }}>
      {/* Price area */}
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#chartGrad)" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      {/* Volume bars */}
      {volumes.map((v, i) => (
        <rect key={i} x={i * stepX - stepX * 0.3} y={h + 2 + (38 - (v / maxVol) * 38)} width={stepX * 0.6} height={(v / maxVol) * 38} fill={color} opacity="0.2" />
      ))}
      {/* Price labels */}
      <text x="4" y="14" fill="#888" fontSize="11" fontFamily="monospace">${max.toFixed(2)}</text>
      <text x="4" y={h - 4} fill="#888" fontSize="11" fontFamily="monospace">${min.toFixed(2)}</text>
    </svg>
  );
}

export default function StockDetailPage() {
  const params = useParams();
  const symbol = params?.symbol;
  const router = useRouter();
  const sym = symbol?.toUpperCase();

  const [quote, setQuote] = useState(null);
  const [bars, setBars] = useState([]);
  const [timeframe, setTimeframe] = useState("1m");
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [inPortfolio, setInPortfolio] = useState(false);

  // Fetch quote
  const fetchQuote = useCallback(async () => {
    try {
      const r = await fetch(`/api/stocks/prices?symbols=${sym}`);
      if (r.ok) {
        const d = await r.json();
        setQuote(d.prices?.[sym] || d.quotes?.[sym] || null);
      }
    } catch {}
  }, [sym]);

  // Fetch bars for chart
  const fetchBars = useCallback(async () => {
    const tf = TIMEFRAMES.find((t) => t.value === timeframe);
    try {
      const url = `/api/stocks/prices?type=historical&symbol=${sym}&timeframe=${tf.tf}&limit=${tf.limit}`;
      console.log("[StockDetail] Fetching bars:", url);
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        console.log("[StockDetail] Got", d.bars?.length || 0, "bars for", sym);
        setBars(d.bars || []);
      } else {
        console.error("[StockDetail] Bars fetch failed:", r.status);
      }
    } catch (e) {
      console.error("[StockDetail] Bars error:", e);
    }
  }, [sym, timeframe]);

  // Fetch news
  const fetchNews = useCallback(async () => {
    try {
      const r = await fetch(`/api/news?symbols=${sym}`);
      if (r.ok) {
        const d = await r.json();
        setNews((d.articles || []).slice(0, 8));
      }
    } catch {}
  }, [sym]);

  // Check watchlist/portfolio
  const checkLists = useCallback(async () => {
    try {
      const [wR, pR] = await Promise.all([fetch("/api/watchlist"), fetch("/api/portfolio")]);
      if (wR.ok) { const d = await wR.json(); setInWatchlist((d.watchlist || []).some((w) => w.symbol === sym)); }
      if (pR.ok) { const d = await pR.json(); setInPortfolio((d.portfolio || []).some((p) => p.symbol === sym)); }
    } catch {}
  }, [sym]);

  // AI analysis
  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const r = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym, price: quote?.price }),
      });
      if (r.ok) {
        const d = await r.json();
        setAiAnalysis(d.analysis || d);
      } else {
        const err = await r.text();
        console.error("[Analysis] Error:", r.status, err);
        setAiAnalysis({ recommendation: "ERROR", summary: `Analysis failed (${r.status}). Try again.` });
      }
    } catch (e) {
      console.error("[Analysis]", e);
      setAiAnalysis({ recommendation: "ERROR", summary: "Connection error. Try again." });
    }
    setAnalyzing(false);
  };

  useEffect(() => {
    if (!sym) return;
    setLoading(true);
    Promise.all([fetchQuote(), fetchBars(), fetchNews(), checkLists()]).then(() => {
      setLoading(false);
      // Auto-run AI analysis
      runAnalysis();
    });
  }, [sym]);

  useEffect(() => { fetchBars(); }, [timeframe]);

  // Auto-refresh quote every 15s
  useEffect(() => {
    const i = setInterval(fetchQuote, 15000);
    return () => clearInterval(i);
  }, [fetchQuote]);

  const toggleWatchlist = async () => {
    if (inWatchlist) {
      await fetch("/api/watchlist", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym }) });
    } else {
      await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, name: quote?.name || sym, sector: "Unknown" }) });
    }
    setInWatchlist(!inWatchlist);
  };

  const change = quote?.change || 0;
  const changePct = quote?.changePct || 0;
  const isUp = change >= 0;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-xl bg-accent text-muted-foreground hover:text-foreground">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">{sym}</h1>
              {inPortfolio && <span className="text-[9px] font-mono font-bold bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">IN PORTFOLIO</span>}
              {inWatchlist && <span className="text-[9px] font-mono font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">WATCHING</span>}
            </div>
            <p className="text-sm text-muted-foreground">{quote?.name || sym}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleWatchlist} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${inWatchlist ? "bg-amber-500 text-white" : "bg-accent text-muted-foreground hover:text-foreground"}`}>
            {inWatchlist ? "★ Watching" : "+ Watch"}
          </button>
          <button onClick={runAnalysis} disabled={analyzing} className="px-3 py-1.5 bg-blue-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50">
            {analyzing ? "Analyzing..." : "🤖 AI Analysis"}
          </button>
        </div>
      </div>

      {/* Price + Chart */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-end justify-between mb-4">
          <div>
            <span className="text-3xl font-bold font-mono">${quote?.price?.toFixed(2) || "—"}</span>
            {(change !== 0 || changePct !== 0) && (
              <span className={`ml-3 text-sm font-mono font-semibold ${isUp ? "text-emerald-500" : "text-red-500"}`}>
                {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)} ({Math.abs(changePct).toFixed(2)}%)
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {TIMEFRAMES.map((tf) => (
              <button key={tf.value} onClick={() => setTimeframe(tf.value)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold transition-all ${timeframe === tf.value ? "bg-blue-500 text-white" : "text-muted-foreground hover:text-foreground"}`}>
                {tf.label}
              </button>
            ))}
          </div>
        </div>
        <MiniChart bars={bars} />
      </div>

      {/* Grid: AI Analysis + News */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* AI Analysis */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="text-xs font-mono font-semibold text-muted-foreground mb-3">AI ANALYSIS</h3>
          {aiAnalysis ? (
            <div className="space-y-3">
              {aiAnalysis.recommendation && (
                <div className={`inline-block px-3 py-1.5 rounded-xl text-sm font-mono font-bold ${
                  aiAnalysis.recommendation?.includes("BUY") ? "bg-emerald-500/15 text-emerald-500"
                  : aiAnalysis.recommendation?.includes("SELL") ? "bg-red-500/15 text-red-500"
                  : "bg-yellow-500/15 text-yellow-500"
                }`}>{aiAnalysis.recommendation}</div>
              )}
              {aiAnalysis.targetPrice && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Target:</span>
                  <span className="font-mono font-bold">${aiAnalysis.targetPrice}</span>
                  {quote?.price && aiAnalysis.targetPrice > quote.price && (
                    <span className="text-emerald-500 text-xs font-mono">▲ {(((aiAnalysis.targetPrice - quote.price) / quote.price) * 100).toFixed(1)}% upside</span>
                  )}
                </div>
              )}
              <p className="text-sm leading-relaxed">{aiAnalysis.summary || aiAnalysis.text || JSON.stringify(aiAnalysis)}</p>
              {aiAnalysis.risks && <p className="text-xs text-red-400"><span className="font-semibold">Risks:</span> {aiAnalysis.risks}</p>}
              {aiAnalysis.catalyst && <p className="text-xs text-emerald-400"><span className="font-semibold">Catalyst:</span> {aiAnalysis.catalyst}</p>}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-3">Click "AI Analysis" to get Claude's take on {sym}</p>
              <button onClick={runAnalysis} disabled={analyzing} className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                {analyzing ? "Analyzing..." : "Run Analysis"}
              </button>
            </div>
          )}
        </div>

        {/* News */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="text-xs font-mono font-semibold text-muted-foreground mb-3">LATEST NEWS</h3>
          {news.length > 0 ? (
            <div className="space-y-3 max-h-[350px] overflow-y-auto">
              {news.map((n, i) => (
                <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="block p-3 bg-background rounded-lg hover:bg-accent/50 transition-all">
                  <p className="text-sm font-medium line-clamp-2">{n.title}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-muted-foreground">{n.source}</span>
                    {n.sentiment && (
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        n.sentiment > 0.2 ? "bg-emerald-500/10 text-emerald-500"
                        : n.sentiment < -0.2 ? "bg-red-500/10 text-red-500"
                        : "bg-zinc-500/10 text-zinc-400"
                      }`}>{n.sentiment > 0.2 ? "Bullish" : n.sentiment < -0.2 ? "Bearish" : "Neutral"}</span>
                    )}
                  </div>
                </a>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground text-center py-6">No recent news for {sym}</p>}
        </div>
      </div>

      {/* Key Stats */}
      {quote && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="text-xs font-mono font-semibold text-muted-foreground mb-3">KEY DATA</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Open", value: quote.open ? `$${quote.open.toFixed(2)}` : "—" },
              { label: "Prev Close", value: quote.prevClose ? `$${quote.prevClose.toFixed(2)}` : "—" },
              { label: "Day High", value: quote.high ? `$${quote.high.toFixed(2)}` : "—" },
              { label: "Day Low", value: quote.low ? `$${quote.low.toFixed(2)}` : "—" },
              { label: "Volume", value: quote.volume ? (quote.volume >= 1e9 ? `${(quote.volume/1e9).toFixed(2)}B` : quote.volume >= 1e6 ? `${(quote.volume/1e6).toFixed(1)}M` : `${(quote.volume/1e3).toFixed(0)}K`) : "—" },
              { label: "Market Cap", value: quote.marketCap ? (quote.marketCap >= 1e12 ? `$${(quote.marketCap/1e12).toFixed(2)}T` : quote.marketCap >= 1e9 ? `$${(quote.marketCap/1e9).toFixed(1)}B` : `$${(quote.marketCap/1e6).toFixed(0)}M`) : "—" },
              { label: "P/E Ratio", value: quote.pe > 0 ? quote.pe.toFixed(1) : "—" },
              { label: "EPS", value: quote.eps ? `$${quote.eps.toFixed(2)}` : "—" },
            ].map((s) => (
              <div key={s.label} className="bg-background rounded-lg p-3">
                <div className="text-[10px] font-mono text-muted-foreground">{s.label}</div>
                <div className="font-mono font-bold text-sm">{s.value}</div>
              </div>
            ))}
          </div>

          {/* 52 Week Range */}
          {quote.week52Low > 0 && quote.week52High > 0 && (
            <div className="mt-3 bg-background rounded-lg p-3">
              <div className="text-[10px] font-mono text-muted-foreground mb-2">52-WEEK RANGE</div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-red-400">${quote.week52Low.toFixed(2)}</span>
                <div className="flex-1 h-2 bg-border rounded-full relative">
                  <div
                    className="absolute top-0 h-2 w-2 bg-blue-500 rounded-full -translate-x-1"
                    style={{ left: `${Math.min(100, Math.max(0, ((quote.price - quote.week52Low) / (quote.week52High - quote.week52Low)) * 100))}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-emerald-400">${quote.week52High.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Dividend Info */}
          {(quote.dividendRate > 0 || quote.dividendYield > 0) && (
            <div className="mt-3 bg-background rounded-lg p-3">
              <div className="text-[10px] font-mono text-muted-foreground mb-2">DIVIDEND</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[9px] font-mono text-muted-foreground">Annual Rate</div>
                  <div className="font-mono font-bold text-sm text-emerald-500">${quote.dividendRate.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[9px] font-mono text-muted-foreground">Yield</div>
                  <div className="font-mono font-bold text-sm text-emerald-500">{quote.dividendYield.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-[9px] font-mono text-muted-foreground">Ex-Div Date</div>
                  <div className="font-mono font-bold text-sm">{quote.exDividendDate || "—"}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
