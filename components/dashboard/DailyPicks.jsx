"use client";

import { useState, useEffect, useCallback } from "react";

const CONFIDENCE_STYLES = {
  HIGH: { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/20" },
  MEDIUM: { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/20" },
  SPECULATIVE: { bg: "bg-amber-500/10", text: "text-amber-500", border: "border-amber-500/20" },
};

export default function DailyPicks({ prices, news, signals, portfolio, watchlist, onWatchlistUpdate }) {
  const [picks, setPicks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastGenerated, setLastGenerated] = useState(null);
  const [adding, setAdding] = useState({});

  const generatePicks = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ news, signals, prices, portfolio, watchlist }),
      });
      if (res.ok) {
        const data = await res.json();
        setPicks(data);
        setLastGenerated(new Date());
        // Cache in sessionStorage
        sessionStorage.setItem("stockpulse_picks", JSON.stringify({ data, time: Date.now() }));
      }
    } catch (e) {
      console.error("Picks error:", e);
    }
    setLoading(false);
  }, [news, signals, prices, portfolio, watchlist, loading]);

  // Load cached picks or auto-generate
  useEffect(() => {
    try {
      const cached = JSON.parse(sessionStorage.getItem("stockpulse_picks") || "null");
      if (cached && Date.now() - cached.time < 3600000) { // 1 hour cache
        setPicks(cached.data);
        setLastGenerated(new Date(cached.time));
        return;
      }
    } catch {}
    // Auto-generate if we have data
    if (Object.keys(prices || {}).length > 0 && (news || []).length > 0 && !picks && !loading) {
      generatePicks();
    }
  }, [prices, news]);

  const addToWatchlist = async (pick) => {
    setAdding((prev) => ({ ...prev, [pick.symbol]: true }));
    try {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: pick.symbol,
          name: pick.name || pick.symbol,
          sector: "AI Pick",
        }),
      });
      if (onWatchlistUpdate) onWatchlistUpdate();
    } catch (e) {
      console.error("Add error:", e);
    }
    setTimeout(() => setAdding((prev) => ({ ...prev, [pick.symbol]: false })), 2000);
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-mono font-semibold text-muted-foreground">TODAY&apos;S PICKS</h3>
            {lastGenerated && (
              <span className="text-[9px] text-muted-foreground">
                {lastGenerated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={generatePicks}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg text-[10px] font-semibold hover:bg-primary/20 transition-all disabled:opacity-50"
        >
          {loading ? (
            <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 4 23 10 17 10" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10" />
            </svg>
          )}
          {loading ? "Analyzing..." : "Refresh"}
        </button>
      </div>

      {/* Market Outlook */}
      {picks?.market_outlook && (
        <div className="px-3 py-2 bg-background rounded-lg mb-3">
          <p className="text-xs text-muted-foreground">{picks.market_outlook}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && !picks && (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs text-muted-foreground">AI analyzing market data...</p>
        </div>
      )}

      {/* Picks */}
      {picks?.picks && (
        <div className="space-y-2">
          {picks.picks.map((pick) => {
            const conf = CONFIDENCE_STYLES[pick.confidence] || CONFIDENCE_STYLES.MEDIUM;
            const isAdding = adding[pick.symbol];
            return (
              <div key={pick.symbol} className={`p-3 rounded-xl border ${conf.border} ${conf.bg}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm">{pick.symbol}</span>
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${conf.bg} ${conf.text}`}>
                      {pick.action} · {pick.confidence}
                    </span>
                  </div>
                  <button
                    onClick={() => addToWatchlist(pick)}
                    disabled={isAdding}
                    className={`text-[10px] font-semibold px-2 py-1 rounded-lg transition-all ${
                      isAdding
                        ? "bg-emerald-500/20 text-emerald-500"
                        : "bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {isAdding ? "✓ Added" : "+ Watch"}
                  </button>
                </div>
                <p className="text-[11px] text-foreground/80 mb-1">{pick.name}</p>
                <p className="text-[11px] text-muted-foreground">{pick.reason}</p>
                {pick.catalyst && (
                  <p className="text-[10px] text-muted-foreground/70 mt-1 italic">Catalyst: {pick.catalyst}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Avoid */}
      {picks?.avoid?.length > 0 && (
        <div className="mt-3 p-3 bg-red-500/5 border border-red-500/10 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono font-bold text-red-500">AVOID</span>
            <span className="font-mono font-bold text-xs">{picks.avoid.join(", ")}</span>
          </div>
          {picks.avoid_reason && (
            <p className="text-[10px] text-muted-foreground">{picks.avoid_reason}</p>
          )}
        </div>
      )}

      {/* Empty State */}
      {!picks && !loading && (
        <div className="text-center py-6">
          <p className="text-xs text-muted-foreground">Click Refresh to generate today&apos;s AI picks</p>
        </div>
      )}
    </div>
  );
}
