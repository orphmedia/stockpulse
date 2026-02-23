"use client";

import { useState, useEffect } from "react";

export default function TopWatchlist({ onSelectSymbol }) {
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchWatchlist = async () => {
    try {
      const res = await fetch("/api/watchlist");
      if (res.ok) {
        const data = await res.json();
        setWatchlist(data.watchlist || []);
      }
    } catch (error) {
      console.error("Watchlist fetch error:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchWatchlist();
    // Refresh every 30 seconds to pick up AI-added stocks
    const interval = setInterval(fetchWatchlist, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRemove = async (symbol) => {
    try {
      await fetch("/api/watchlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      fetchWatchlist();
    } catch (error) {
      console.error("Remove error:", error);
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-4">
        <h3 className="text-xs font-mono font-semibold text-muted-foreground mb-3">MY WATCHLIST</h3>
        <div className="flex items-center justify-center py-6">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-mono font-semibold text-muted-foreground">MY WATCHLIST</h3>
        <span className="text-[10px] font-mono text-muted-foreground">{watchlist.length} stocks</span>
      </div>
      {watchlist.length > 0 ? (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {watchlist.map((item, i) => (
            <div
              key={item.id || item.symbol}
              className="flex items-center justify-between p-2.5 bg-background rounded-lg hover:bg-accent/50 transition-colors group"
            >
              <button
                onClick={() => onSelectSymbol && onSelectSymbol(item.symbol)}
                className="flex items-center gap-3 text-left flex-1 min-w-0"
              >
                <span className="w-6 h-6 rounded bg-accent flex items-center justify-center text-[10px] font-mono font-bold text-muted-foreground flex-shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="font-mono font-bold text-xs">{item.symbol}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{item.name}</div>
                </div>
              </button>
              <button
                onClick={() => handleRemove(item.symbol)}
                className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all flex-shrink-0"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-xs text-muted-foreground">No stocks in your watchlist yet.</p>
          <p className="text-[10px] text-muted-foreground mt-1">Ask the AI to build you a top 10!</p>
        </div>
      )}
    </div>
  );
}
