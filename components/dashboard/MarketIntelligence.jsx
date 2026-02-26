"use client";

import { useState, useEffect } from "react";

const SCORE_COLORS = {
  hot: { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/20", bar: "bg-emerald-500" },
  warm: { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/20", bar: "bg-blue-500" },
  cold: { bg: "bg-red-500/10", text: "text-red-500", border: "border-red-500/20", bar: "bg-red-500" },
  neutral: { bg: "bg-zinc-500/10", text: "text-zinc-400", border: "border-zinc-500/20", bar: "bg-zinc-400" },
};

function getScoreStyle(score) {
  if (score >= 70) return SCORE_COLORS.hot;
  if (score >= 50) return SCORE_COLORS.warm;
  if (score >= 35) return SCORE_COLORS.neutral;
  return SCORE_COLORS.cold;
}

function ScoreRing({ score, size = 44 }) {
  const style = getScoreStyle(score);
  const radius = (size - 6) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" strokeWidth="3"
          className={style.text} strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-xs font-mono font-bold ${style.text}`}>{score}</span>
      </div>
    </div>
  );
}

export default function MarketIntelligence({ prices, portfolio, watchlist, onAddWatchlist }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchIntelligence = async () => {
    if (loading) return;
    setLoading(true);
    try {
      // Check cache first
      const cached = sessionStorage.getItem("stockpulse_intel");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed._ts < 1800000) { // 30 min cache
          setData(parsed);
          setLastFetch(new Date(parsed._ts));
          setLoading(false);
          return;
        }
      }

      const res = await fetch("/api/ai/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolio, watchlist, prices }),
      });

      if (res.ok) {
        const d = await res.json();
        d._ts = Date.now();
        setData(d);
        setLastFetch(new Date());
        sessionStorage.setItem("stockpulse_intel", JSON.stringify(d));
      }
    } catch (e) {
      console.error("[Intel]", e);
    }
    setLoading(false);
  };

  // Auto-fetch on mount if we have price data
  useEffect(() => {
    if (Object.keys(prices || {}).length > 0 && !data && !loading) {
      fetchIntelligence();
    }
  }, [prices]);

  const addToWatch = async (stock) => {
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: stock.symbol, name: stock.name || stock.symbol, sector: stock.sector || "Unknown" }),
    });
    if (onAddWatchlist) onAddWatchlist();
  };

  if (loading && !data) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Scanning markets, news & social channels...</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map((i) => (
            <div key={i} className="bg-background rounded-xl p-4 animate-pulse">
              <div className="h-3 bg-accent rounded w-16 mb-2" />
              <div className="h-5 bg-accent rounded w-12 mb-2" />
              <div className="h-2 bg-accent rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const mood = data.marketMood;
  const moodColor = mood === "BULLISH" ? "text-emerald-500" : mood === "BEARISH" ? "text-red-500" : "text-yellow-500";

  return (
    <div className="space-y-4">
      {/* Market Mood Header */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`text-2xl`}>
              {mood === "BULLISH" ? "🟢" : mood === "BEARISH" ? "🔴" : "🟡"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold text-muted-foreground">MARKET MOOD</span>
                <span className={`text-xs font-mono font-bold ${moodColor}`}>{mood}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {data.stocks?.length || 0} stocks scanned · {lastFetch?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) || ""}
              </p>
            </div>
          </div>
          <button onClick={fetchIntelligence} disabled={loading}
            className="text-[10px] font-semibold px-3 py-1.5 bg-accent rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-50">
            {loading ? "Scanning..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Top Picks */}
      {data.topPicks?.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-mono font-semibold text-emerald-500">TOP PICKS</span>
            <span className="text-[10px] text-muted-foreground">highest score + BUY signal</span>
          </div>
          <div className="space-y-2">
            {data.topPicks.map((stock) => {
              const style = getScoreStyle(stock.score);
              return (
                <div key={stock.symbol} className={`flex items-center gap-3 p-3 rounded-xl border ${style.border} ${style.bg}`}>
                  <ScoreRing score={stock.score} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm">{stock.symbol}</span>
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                        {stock.action} · {stock.confidence}
                      </span>
                      {stock.inPortfolio && <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded font-mono">HELD</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{stock.name}</p>
                    <p className="text-[10px] text-foreground/70 mt-0.5">{stock.catalyst}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono font-bold text-sm">${stock.price?.toFixed?.(2) || stock.price || "—"}</div>
                    {stock.upsidePct > 0 && (
                      <div className="text-[10px] font-mono text-emerald-500">▲ {stock.upsidePct?.toFixed?.(1) || stock.upsidePct}%</div>
                    )}
                    {!stock.inWatchlist && !stock.inPortfolio && (
                      <button onClick={() => addToWatch(stock)} className="text-[9px] text-primary font-semibold mt-1 hover:underline">+ Watch</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Watchlist Scores */}
      {data.stocks?.filter((s) => s.inWatchlist || s.inPortfolio).length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <span className="text-xs font-mono font-semibold text-muted-foreground mb-3 block">YOUR STOCKS</span>
          <div className="space-y-1.5">
            {data.stocks.filter((s) => s.inWatchlist || s.inPortfolio).map((stock) => {
              const style = getScoreStyle(stock.score);
              return (
                <div key={stock.symbol} className="flex items-center gap-3 p-2.5 bg-background rounded-lg">
                  <ScoreRing score={stock.score} size={36} />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-xs">{stock.symbol}</span>
                      <span className={`text-[8px] font-mono font-bold ${style.text}`}>{stock.action}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs">${stock.price?.toFixed?.(2) || stock.price || "—"}</span>
                    <div className={`text-[9px] font-mono ${stock.changePct > 0 ? "text-emerald-500" : stock.changePct < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {stock.changePct > 0 ? "▲" : stock.changePct < 0 ? "▼" : ""} {Math.abs(stock.changePct || 0).toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Warnings */}
      {data.warnings?.length > 0 && (
        <div className="bg-card border border-red-500/10 rounded-2xl p-4">
          <span className="text-xs font-mono font-semibold text-red-500 mb-3 block">CAUTION</span>
          <div className="space-y-1.5">
            {data.warnings.map((stock) => (
              <div key={stock.symbol} className="flex items-center gap-3 p-2.5 bg-red-500/5 rounded-lg">
                <ScoreRing score={stock.score} size={36} />
                <div className="flex-1">
                  <span className="font-mono font-bold text-xs">{stock.symbol}</span>
                  <p className="text-[9px] text-red-400">{stock.catalyst}</p>
                </div>
                <span className="text-[9px] font-mono font-bold text-red-500">{stock.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
