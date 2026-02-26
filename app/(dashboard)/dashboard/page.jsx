"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import AIChat from "@/components/dashboard/AIChat";

const MARKET_INDICES = [
  { symbol: "SPY", name: "S&P 500" },
  { symbol: "QQQ", name: "Nasdaq" },
  { symbol: "DIA", name: "Dow Jones" },
];

const WORKFLOWS = [
  { id: "portfolio-review", label: "Portfolio Review", icon: "📊", desc: "Full portfolio health check with P/L, diversification, and rebalancing analysis" },
  { id: "deep-dive", label: "Deep Dive", icon: "🔍", desc: "Comprehensive single-stock research with analyst consensus, technicals, and catalysts", needsSymbol: true },
  { id: "earnings-prep", label: "Earnings Prep", icon: "📋", desc: "Pre-earnings briefing with expectations, estimates, and trading setup", needsSymbol: true },
  { id: "dividend-calendar", label: "Dividend Calendar", icon: "💰", desc: "Upcoming ex-dividend dates, yields, and income projections" },
  { id: "sector-rotation", label: "Sector Rotation", icon: "🔄", desc: "Sector performance analysis, rotation signals, and allocation recommendations" },
  { id: "weekly-review", label: "Weekly Review", icon: "📈", desc: "Week in review — portfolio performance, market moves, and action items" },
];

// Inline sparkline
function Sparkline({ data, width = 80, height = 24 }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const prices = data.map((d) => d.close || d.price || d);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const stepX = width / (prices.length - 1);
  const points = prices.map((p, i) => `${i * stepX},${height - ((p - min) / range) * (height - 4) - 2}`).join(" ");
  const isUp = prices[prices.length - 1] >= prices[0];
  const color = isUp ? "#10b981" : "#ef4444";
  const areaPoints = `0,${height} ${points} ${(prices.length - 1) * stepX},${height}`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`sp-${isUp ? "u" : "d"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#sp-${isUp ? "u" : "d"})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AnalystBadge({ rating }) {
  if (!rating) return null;
  const lower = rating.toLowerCase();
  const isBuy = lower.includes("buy");
  const isSell = lower.includes("sell") || lower.includes("under");
  const label = lower.includes("strong buy") ? "Strong Buy" : isBuy ? "Buy" : isSell ? "Sell" : "Hold";
  const cls = isBuy ? "bg-emerald-500/15 text-emerald-500" : isSell ? "bg-red-500/15 text-red-500" : "bg-yellow-500/15 text-yellow-500";
  return <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
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
  const [indexCharts, setIndexCharts] = useState({});
  const [morningBrief, setMorningBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [workflowResult, setWorkflowResult] = useState(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowId, setWorkflowId] = useState(null);
  const [workflowSymbol, setWorkflowSymbol] = useState("");
  const [showSymbolPicker, setShowSymbolPicker] = useState(null);
  const [sortCol, setSortCol] = useState("symbol");
  const [sortDir, setSortDir] = useState("asc");
  const [rightTab, setRightTab] = useState("chat");
  const intervalRef = useRef(null);
  const chartsFetched = useRef(false);
  const briefGenerated = useRef(false);

  const allSymbols = [...new Set([...portfolioSymbols, ...watchlistSymbols, ...MARKET_INDICES.map((i) => i.symbol)])];
  const symbolsParam = allSymbols.length > 0 ? allSymbols.join(",") : "SPY,QQQ,DIA";

  // Load portfolio + watchlist
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

  // Fetch prices
  const fetchPrices = useCallback(async () => {
    try {
      const r = await fetch(`/api/stocks/prices?symbols=${symbolsParam}`);
      if (r.ok) { const d = await r.json(); setPrevPrices((p) => ({ ...p, ...prices })); setPrices(d.prices || {}); setSignals(d.signals || {}); setLastUpdate(new Date()); setLoading(false); }
    } catch {}
  }, [symbolsParam]);

  // Fetch news
  const fetchNews = useCallback(async () => {
    try {
      const s = allSymbols.filter((x) => !["SPY", "QQQ", "DIA"].includes(x)).slice(0, 8).join(",") || "AAPL,NVDA,MSFT,TSLA";
      const r = await fetch(`/api/news?symbols=${s}`);
      if (r.ok) { const d = await r.json(); setNews(d.articles || []); }
    } catch {}
  }, [allSymbols.join(",")]);

  useEffect(() => { fetchPrices(); fetchNews(); }, [symbolsParam]);
  useEffect(() => {
    if (!isLive) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(fetchPrices, 10000);
    return () => clearInterval(intervalRef.current);
  }, [fetchPrices, isLive]);

  // Fetch intraday charts for market indices
  useEffect(() => {
    if (chartsFetched.current || loading) return;
    chartsFetched.current = true;
    const fetchCharts = async () => {
      const charts = {};
      await Promise.all(MARKET_INDICES.map(async (idx) => {
        try {
          const r = await fetch(`/api/stocks/prices?type=historical&symbol=${idx.symbol}&timeframe=5Min&limit=78`);
          if (r.ok) { const d = await r.json(); if (d.bars?.length >= 2) charts[idx.symbol] = d.bars; }
        } catch {}
      }));
      setIndexCharts(charts);
    };
    fetchCharts();
  }, [loading]);

  // Auto-generate Morning Brief on first load
  useEffect(() => {
    if (briefGenerated.current || loading || portfolioHoldings.length === 0 || Object.keys(prices).length === 0) return;
    briefGenerated.current = true;
    generateMorningBrief();
  }, [loading, portfolioHoldings, prices]);

  const generateMorningBrief = async () => {
    setBriefLoading(true);
    try {
      // Build context
      const totalValue = portfolioHoldings.reduce((sum, h) => {
        const p = prices[h.symbol];
        return sum + (p?.price || 0) * (h.shares || 0);
      }, 0);
      const totalCost = portfolioHoldings.reduce((sum, h) => sum + (h.cost_basis || 0) * (h.shares || 0), 0);
      const dayChange = portfolioHoldings.reduce((sum, h) => {
        const p = prices[h.symbol];
        return sum + (p?.change || 0) * (h.shares || 0);
      }, 0);
      const topMover = [...portfolioHoldings].sort((a, b) => {
        const pA = prices[a.symbol]?.changePct || 0;
        const pB = prices[b.symbol]?.changePct || 0;
        return Math.abs(pB) - Math.abs(pA);
      })[0];
      const topMoverPrice = prices[topMover?.symbol];

      // Upcoming dividends
      const upcomingDivs = portfolioHoldings
        .filter((h) => prices[h.symbol]?.exDividendDate)
        .map((h) => ({ symbol: h.symbol, date: prices[h.symbol].exDividendDate, yield: prices[h.symbol].dividendYield }))
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 3);

      const spy = prices["SPY"];
      const qqq = prices["QQQ"];
      const dia = prices["DIA"];

      const hour = new Date().getHours();
      const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      const name = session?.user?.name?.split(" ")[0] || "there";

      const mkt = spy ? `Markets ${spy.changePct >= 0 ? "up" : "down"} ${Math.abs(spy.changePct).toFixed(1)}%.` : "";
      const port = totalValue > 0 ? ` Portfolio at $${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${dayChange >= 0 ? "+" : ""}$${dayChange.toFixed(0)} today).` : "";
      const mover = topMover && topMoverPrice ? ` ${topMover.symbol} biggest mover at ${topMoverPrice.changePct >= 0 ? "+" : ""}${topMoverPrice.changePct.toFixed(1)}%.` : "";
      const divInfo = upcomingDivs.length > 0 ? ` ${upcomingDivs[0].symbol} ex-div ${upcomingDivs[0].date}.` : "";

      // Analyst highlights
      const analystHighlights = portfolioHoldings
        .filter((h) => prices[h.symbol]?.analystRating)
        .map((h) => ({
          symbol: h.symbol,
          rating: prices[h.symbol].analystRating,
          target: prices[h.symbol].targetMean,
          price: prices[h.symbol].price,
          upside: prices[h.symbol].targetMean > 0 && prices[h.symbol].price > 0
            ? ((prices[h.symbol].targetMean - prices[h.symbol].price) / prices[h.symbol].price * 100).toFixed(1)
            : null,
        }));

      setMorningBrief({
        greeting: `${greeting}, ${name}.`,
        summary: `${mkt}${port}${mover}${divInfo}`,
        totalValue,
        dayChange,
        totalPL: totalValue - totalCost,
        topMover: topMover?.symbol,
        topMoverChange: topMoverPrice?.changePct,
        upcomingDivs,
        analystHighlights: analystHighlights.slice(0, 4),
        marketStatus: { spy, qqq, dia },
      });
    } catch (e) {
      console.error("Morning brief error:", e);
    }
    setBriefLoading(false);
  };

  // Run workflow
  const runWorkflow = async (wfId, symbol) => {
    setWorkflowLoading(true);
    setWorkflowId(wfId);
    setWorkflowResult(null);
    setShowSymbolPicker(null);
    try {
      const body = { workflow: wfId };
      if (symbol) body.symbol = symbol;
      // For portfolio-review, send holdings context
      if (wfId === "portfolio-review" || wfId === "weekly-review" || wfId === "dividend-calendar" || wfId === "sector-rotation") {
        body.holdings = portfolioHoldings.map((h) => ({
          symbol: h.symbol,
          shares: h.shares,
          costBasis: h.cost_basis,
          ...prices[h.symbol],
        }));
      }
      const r = await fetch("/api/ai/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const d = await r.json();
        setWorkflowResult(d);
      } else {
        const err = await r.text();
        setWorkflowResult({ error: `Workflow failed: ${err}` });
      }
    } catch (e) {
      setWorkflowResult({ error: e.message });
    }
    setWorkflowLoading(false);
  };

  const handleWorkflowClick = (wf) => {
    if (wf.needsSymbol) {
      setShowSymbolPicker(wf.id);
      setWorkflowSymbol("");
    } else {
      runWorkflow(wf.id);
    }
  };

  const handleDataUpdate = () => setPortfolioKey((k) => k + 1);

  // Portfolio table with sorting
  const sortedPortfolio = useMemo(() => {
    return [...portfolioHoldings].sort((a, b) => {
      const pA = prices[a.symbol] || {};
      const pB = prices[b.symbol] || {};
      let vA, vB;
      switch (sortCol) {
        case "symbol": vA = a.symbol; vB = b.symbol; return sortDir === "asc" ? vA.localeCompare(vB) : vB.localeCompare(vA);
        case "price": vA = pA.price || 0; vB = pB.price || 0; break;
        case "change": vA = pA.changePct || 0; vB = pB.changePct || 0; break;
        case "pl": vA = ((pA.price || 0) - (a.cost_basis || 0)) * (a.shares || 0); vB = ((pB.price || 0) - (b.cost_basis || 0)) * (b.shares || 0); break;
        case "value": vA = (pA.price || 0) * (a.shares || 0); vB = (pB.price || 0) * (b.shares || 0); break;
        case "target": vA = pA.targetMean || 0; vB = pB.targetMean || 0; break;
        case "upside": {
          const uA = pA.targetMean > 0 && pA.price > 0 ? (pA.targetMean - pA.price) / pA.price : -999;
          const uB = pB.targetMean > 0 && pB.price > 0 ? (pB.targetMean - pB.price) / pB.price : -999;
          vA = uA; vB = uB; break;
        }
        default: vA = 0; vB = 0;
      }
      return sortDir === "asc" ? vA - vB : vB - vA;
    });
  }, [portfolioHoldings, prices, sortCol, sortDir]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const SortHeader = ({ col, label, className = "" }) => (
    <th className={`text-left text-[9px] font-mono font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none ${className}`} onClick={() => toggleSort(col)}>
      {label} {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  // Alerts
  const alerts = useMemo(() => {
    const items = [];
    portfolioHoldings.forEach((h) => {
      const p = prices[h.symbol];
      if (!p) return;
      // Ex-div coming up
      if (p.exDividendDate) {
        const daysUntil = Math.ceil((new Date(p.exDividendDate) - new Date()) / 86400000);
        if (daysUntil > 0 && daysUntil <= 14) {
          items.push({ type: "dividend", icon: "💰", text: `${h.symbol} ex-div in ${daysUntil} day${daysUntil > 1 ? "s" : ""}`, priority: daysUntil <= 3 ? "high" : "normal" });
        }
      }
      // Big movers
      if (Math.abs(p.changePct) > 3) {
        items.push({ type: "mover", icon: p.changePct > 0 ? "🚀" : "⚠️", text: `${h.symbol} ${p.changePct > 0 ? "up" : "down"} ${Math.abs(p.changePct).toFixed(1)}% today`, priority: "high" });
      }
      // Price at/above analyst target
      if (p.targetMean > 0 && p.price >= p.targetMean * 0.98) {
        items.push({ type: "target", icon: "🎯", text: `${h.symbol} near analyst target ($${p.targetMean.toFixed(0)})`, priority: "normal" });
      }
      // Near 52-week high
      if (p.week52High > 0 && p.price >= p.week52High * 0.97) {
        items.push({ type: "high", icon: "📈", text: `${h.symbol} near 52-week high`, priority: "normal" });
      }
    });
    return items.sort((a, b) => (a.priority === "high" ? -1 : 1) - (b.priority === "high" ? -1 : 1));
  }, [portfolioHoldings, prices]);

  // Render workflow results
  const renderWorkflowResult = () => {
    if (!workflowResult) return null;
    if (workflowResult.error) return <div className="text-red-400 text-sm p-3">{workflowResult.error}</div>;

    const data = workflowResult.result || workflowResult;
    const wfLabel = WORKFLOWS.find((w) => w.id === workflowId)?.label || "Analysis";

    return (
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono font-semibold text-blue-400">{wfLabel.toUpperCase()} RESULTS</h3>
          <button onClick={() => { setWorkflowResult(null); setWorkflowId(null); }} className="text-[10px] text-muted-foreground hover:text-foreground">✕ Close</button>
        </div>
        <div className="text-sm leading-relaxed space-y-2">
          {typeof data === "string" ? (
            <p className="whitespace-pre-wrap">{data}</p>
          ) : (
            Object.entries(data).map(([key, val]) => {
              if (key === "error" || key === "model") return null;
              const label = key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
              return (
                <div key={key} className="bg-background rounded-lg p-3">
                  <div className="text-[9px] font-mono font-semibold text-muted-foreground uppercase mb-1">{label}</div>
                  {Array.isArray(val) ? (
                    <ul className="text-xs space-y-1">
                      {val.map((item, i) => <li key={i}>• {typeof item === "object" ? JSON.stringify(item) : item}</li>)}
                    </ul>
                  ) : typeof val === "object" && val !== null ? (
                    <div className="text-xs space-y-1">
                      {Object.entries(val).map(([k, v]) => (
                        <div key={k}><span className="text-muted-foreground">{k.replace(/([A-Z])/g, " $1").trim()}:</span> {String(v)}</div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs">{String(val)}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-5 max-w-[1400px] mx-auto space-y-4">
      {/* === HEADER === */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">StockPulse</h1>
          <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-bold">v2.0</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsLive(!isLive)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono ${isLive ? "text-emerald-500" : "text-muted-foreground"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
            {isLive ? "LIVE" : "PAUSED"}
          </button>
          {lastUpdate && <span className="text-[10px] font-mono text-muted-foreground hidden sm:block">{lastUpdate.toLocaleTimeString()}</span>}
        </div>
      </div>

      {/* === MARKET PULSE STRIP === */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {MARKET_INDICES.map((idx) => {
          const p = prices[idx.symbol];
          const ch = p?.changePct || 0;
          return (
            <a key={idx.symbol} href={`/stock/${idx.symbol}`} className="flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-2 hover:bg-accent/30 transition-all min-w-[200px]">
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-mono text-muted-foreground">{idx.name}</div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono font-bold text-sm">${p?.price?.toFixed(2) || "—"}</span>
                  {ch !== 0 && (
                    <span className={`text-[10px] font-mono font-bold ${ch > 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {ch > 0 ? "▲" : "▼"}{Math.abs(ch).toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
              <Sparkline data={indexCharts[idx.symbol]} width={70} height={22} />
            </a>
          );
        })}
      </div>

      {/* === MAIN LAYOUT: Left (65%) + Right (35%) === */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-3 space-y-4">

          {/* MORNING BRIEF */}
          <div className="bg-gradient-to-br from-card to-blue-500/5 border border-border rounded-2xl p-4">
            {briefLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="animate-spin">⏳</span> Generating your morning brief...
              </div>
            ) : morningBrief ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{morningBrief.greeting}</h2>
                  <button onClick={generateMorningBrief} className="text-[9px] font-mono text-muted-foreground hover:text-foreground">↻ Refresh</button>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{morningBrief.summary}</p>
                <div className="flex gap-3 flex-wrap">
                  {morningBrief.totalValue > 0 && (
                    <div className="bg-background/50 rounded-lg px-3 py-2">
                      <div className="text-[9px] font-mono text-muted-foreground">PORTFOLIO</div>
                      <div className="font-mono font-bold text-sm">${morningBrief.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                      <div className={`text-[10px] font-mono ${morningBrief.dayChange >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {morningBrief.dayChange >= 0 ? "+" : ""}${morningBrief.dayChange.toFixed(0)} today
                      </div>
                    </div>
                  )}
                  {morningBrief.totalPL !== undefined && morningBrief.totalPL !== 0 && (
                    <div className="bg-background/50 rounded-lg px-3 py-2">
                      <div className="text-[9px] font-mono text-muted-foreground">TOTAL P/L</div>
                      <div className={`font-mono font-bold text-sm ${morningBrief.totalPL >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {morningBrief.totalPL >= 0 ? "+" : ""}${morningBrief.totalPL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  )}
                  {morningBrief.analystHighlights?.slice(0, 3).map((ah) => (
                    <div key={ah.symbol} className="bg-background/50 rounded-lg px-3 py-2">
                      <div className="text-[9px] font-mono text-muted-foreground">{ah.symbol}</div>
                      <AnalystBadge rating={ah.rating} />
                      {ah.upside && <div className="text-[9px] font-mono text-muted-foreground mt-0.5">{ah.upside > 0 ? "+" : ""}{ah.upside}% to target</div>}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Loading portfolio data...</div>
            )}
          </div>

          {/* WORKFLOWS */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-[10px] font-mono font-semibold text-muted-foreground mb-3">AI WORKFLOWS</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {WORKFLOWS.map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => handleWorkflowClick(wf)}
                  disabled={workflowLoading}
                  className={`text-left p-3 rounded-xl transition-all border ${
                    workflowId === wf.id && workflowLoading
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-transparent bg-background hover:bg-accent/50 hover:border-border"
                  } disabled:opacity-50`}
                >
                  <div className="text-base mb-1">{wf.icon}</div>
                  <div className="text-xs font-semibold">{wf.label}</div>
                  <div className="text-[9px] text-muted-foreground mt-0.5 line-clamp-2">{wf.desc}</div>
                </button>
              ))}
            </div>

            {/* Symbol picker for workflows that need one */}
            {showSymbolPicker && (
              <div className="mt-3 flex items-center gap-2 bg-background rounded-xl p-3 border border-border">
                <span className="text-xs text-muted-foreground">Symbol:</span>
                <input
                  type="text"
                  value={workflowSymbol}
                  onChange={(e) => setWorkflowSymbol(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter" && workflowSymbol) runWorkflow(showSymbolPicker, workflowSymbol); }}
                  placeholder="AAPL"
                  className="bg-card border border-border rounded-lg px-2 py-1 text-xs font-mono w-24"
                  autoFocus
                />
                {/* Quick picks from portfolio */}
                <div className="flex gap-1 flex-wrap flex-1">
                  {portfolioSymbols.slice(0, 6).map((s) => (
                    <button key={s} onClick={() => runWorkflow(showSymbolPicker, s)} className="text-[9px] font-mono px-2 py-1 bg-card border border-border rounded-lg hover:bg-accent/50">
                      {s}
                    </button>
                  ))}
                </div>
                <button onClick={() => { if (workflowSymbol) runWorkflow(showSymbolPicker, workflowSymbol); }} className="text-xs px-3 py-1 bg-blue-500 text-white rounded-lg font-semibold">
                  Run
                </button>
                <button onClick={() => setShowSymbolPicker(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
              </div>
            )}

            {/* Loading state */}
            {workflowLoading && (
              <div className="mt-3 flex items-center gap-2 text-sm text-blue-400 bg-blue-500/5 rounded-xl p-3">
                <span className="animate-spin">⏳</span>
                Running {WORKFLOWS.find((w) => w.id === workflowId)?.label || "workflow"}... This may take 15-30 seconds.
              </div>
            )}

            {/* Results */}
            {workflowResult && !workflowLoading && (
              <div className="mt-3">{renderWorkflowResult()}</div>
            )}
          </div>

          {/* PORTFOLIO TABLE */}
          {portfolioHoldings.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="text-[10px] font-mono font-semibold text-muted-foreground mb-3">PORTFOLIO ({portfolioHoldings.length} holdings)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <SortHeader col="symbol" label="Symbol" />
                      <th className="text-right text-[9px] font-mono text-muted-foreground px-1">Shares</th>
                      <SortHeader col="price" label="Price" className="text-right" />
                      <SortHeader col="change" label="Day" className="text-right" />
                      <SortHeader col="value" label="Value" className="text-right hidden sm:table-cell" />
                      <SortHeader col="pl" label="P/L" className="text-right" />
                      <th className="text-center text-[9px] font-mono text-muted-foreground px-1 hidden md:table-cell">Analyst</th>
                      <SortHeader col="target" label="Target" className="text-right hidden md:table-cell" />
                      <SortHeader col="upside" label="vs Target" className="text-right hidden lg:table-cell" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPortfolio.map((h) => {
                      const p = prices[h.symbol] || {};
                      const value = (p.price || 0) * (h.shares || 0);
                      const pl = ((p.price || 0) - (h.cost_basis || 0)) * (h.shares || 0);
                      const plPct = h.cost_basis > 0 ? ((p.price || 0) - h.cost_basis) / h.cost_basis * 100 : 0;
                      const upside = p.targetMean > 0 && p.price > 0 ? ((p.targetMean - p.price) / p.price * 100) : null;
                      return (
                        <tr key={h.symbol} className="border-b border-border/50 hover:bg-accent/30 cursor-pointer" onClick={() => window.location.href = `/stock/${h.symbol}`}>
                          <td className="py-2 px-1">
                            <div className="font-mono font-bold">{h.symbol}</div>
                            <div className="text-[9px] text-muted-foreground truncate max-w-[100px]">{p.name || ""}</div>
                          </td>
                          <td className="text-right font-mono px-1">{h.shares}</td>
                          <td className="text-right font-mono font-semibold px-1">${p.price?.toFixed(2) || "—"}</td>
                          <td className={`text-right font-mono px-1 ${(p.changePct || 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {(p.changePct || 0) >= 0 ? "+" : ""}{(p.changePct || 0).toFixed(2)}%
                          </td>
                          <td className="text-right font-mono px-1 hidden sm:table-cell">${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className={`text-right font-mono font-semibold px-1 ${pl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {pl >= 0 ? "+" : ""}${pl.toFixed(0)}
                            <div className="text-[8px]">{plPct >= 0 ? "+" : ""}{plPct.toFixed(1)}%</div>
                          </td>
                          <td className="text-center px-1 hidden md:table-cell"><AnalystBadge rating={p.analystRating} /></td>
                          <td className="text-right font-mono px-1 hidden md:table-cell">{p.targetMean > 0 ? `$${p.targetMean.toFixed(0)}` : "—"}</td>
                          <td className={`text-right font-mono px-1 hidden lg:table-cell ${upside !== null ? (upside >= 0 ? "text-emerald-500" : "text-red-500") : ""}`}>
                            {upside !== null ? `${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
            {[
              { id: "chat", label: "💬 AI Chat" },
              { id: "alerts", label: `⚡ Alerts${alerts.length > 0 ? ` (${alerts.length})` : ""}` },
              { id: "watchlist", label: "👁 Watch" },
            ].map((t) => (
              <button key={t.id} onClick={() => setRightTab(t.id)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                  rightTab === t.id ? "bg-blue-500 text-white" : "text-muted-foreground hover:text-foreground"
                }`}>{t.label}</button>
            ))}
          </div>

          {/* AI CHAT */}
          {rightTab === "chat" && (
            <div style={{ maxHeight: "70vh" }}>
              <AIChat
                prices={prices}
                news={news}
                signals={signals}
                watchlist={watchlistData}
                portfolio={portfolioHoldings}
                socialData={socialData}
                onWatchlistUpdate={handleDataUpdate}
                onPortfolioUpdate={handleDataUpdate}
                dataReady={!loading && Object.keys(prices).length > 0}
              />
            </div>
          )}

          {/* ALERTS */}
          {rightTab === "alerts" && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
              <h3 className="text-[10px] font-mono font-semibold text-muted-foreground mb-2">ALERTS & ACTION ITEMS</h3>
              {alerts.length > 0 ? alerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg ${a.priority === "high" ? "bg-red-500/5 border border-red-500/20" : "bg-background"}`}>
                  <span className="text-sm">{a.icon}</span>
                  <span className="text-xs leading-relaxed">{a.text}</span>
                </div>
              )) : (
                <p className="text-xs text-muted-foreground text-center py-6">No alerts right now. Your portfolio is steady.</p>
              )}

              {/* Quick Actions */}
              <div className="pt-3 border-t border-border mt-3">
                <div className="text-[9px] font-mono font-semibold text-muted-foreground mb-2">QUICK ACTIONS</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleWorkflowClick(WORKFLOWS.find(w => w.id === "portfolio-review"))} className="text-[10px] font-semibold p-2 rounded-lg bg-background hover:bg-accent/50 transition-all">
                    📊 Portfolio Check
                  </button>
                  <button onClick={() => handleWorkflowClick(WORKFLOWS.find(w => w.id === "dividend-calendar"))} className="text-[10px] font-semibold p-2 rounded-lg bg-background hover:bg-accent/50 transition-all">
                    💰 Div Calendar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* WATCHLIST */}
          {rightTab === "watchlist" && (
            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="text-[10px] font-mono font-semibold text-muted-foreground mb-3">WATCHLIST</h3>
              {watchlistSymbols.length > 0 ? (
                <div className="space-y-1.5">
                  {watchlistSymbols.map((sym) => {
                    const p = prices[sym];
                    const ch = p?.changePct || 0;
                    return (
                      <a key={sym} href={`/stock/${sym}`} className="flex items-center justify-between p-2.5 bg-background rounded-lg hover:bg-accent/50 transition-all cursor-pointer">
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="font-mono font-bold text-xs">{sym}</span>
                            {p?.name && <div className="text-[9px] text-muted-foreground">{p.name}</div>}
                          </div>
                          <AnalystBadge rating={p?.analystRating} />
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-xs font-semibold">${p?.price?.toFixed(2) || "—"}</span>
                          {ch !== 0 && <div className={`text-[10px] font-mono font-semibold ${ch > 0 ? "text-emerald-500" : "text-red-500"}`}>{ch > 0 ? "▲" : "▼"}{Math.abs(ch).toFixed(2)}%</div>}
                          {p?.targetMean > 0 && (
                            <div className="text-[8px] font-mono text-muted-foreground">
                              Target: ${p.targetMean.toFixed(0)}
                            </div>
                          )}
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-3">Ask the AI to watch stocks for you</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="text-center text-[10px] font-mono text-muted-foreground pt-2">Not financial advice · StockPulse v2.0</div>
    </div>
  );
}
