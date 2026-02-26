"use client";

import { useState, useEffect, useCallback } from "react";

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [addSymbol, setAddSymbol] = useState("");
  const [addName, setAddName] = useState("");
  const [addSector, setAddSector] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [removing, setRemoving] = useState(null);

  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlist");
      if (res.ok) {
        const data = await res.json();
        setWatchlist(data.watchlist || []);

        // Fetch prices for watchlist items
        const symbols = (data.watchlist || []).map((w) => w.symbol).join(",");
        if (symbols) {
          const priceRes = await fetch(`/api/stocks/prices?symbols=${symbols}&type=quote`);
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            setPrices(priceData.quotes || {});
          }
        }
      }
    } catch (error) {
      console.error("Watchlist fetch error:", error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addSymbol) return;
    setAdding(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: addSymbol.toUpperCase(),
          name: addName || addSymbol.toUpperCase(),
          sector: addSector || "Unknown",
        }),
      });
      if (res.ok) {
        setAddSymbol("");
        setAddName("");
        setAddSector("");
        setShowAdd(false);
        fetchWatchlist();
      }
    } catch (error) {
      console.error("Add error:", error);
    }
    setAdding(false);
  };

  const handleRemove = async (symbol) => {
    setRemoving(symbol);
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
    setRemoving(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-mono text-muted-foreground">Loading watchlist...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Watchlist</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {watchlist.length} stocks tracked
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-all w-fit"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Stock
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-mono font-semibold text-muted-foreground mb-4">ADD TO WATCHLIST</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Symbol *</label>
              <input
                type="text"
                value={addSymbol}
                onChange={(e) => setAddSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Company Name</label>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Apple Inc."
                className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Sector</label>
              <input
                type="text"
                value={addSector}
                onChange={(e) => setAddSector(e.target.value)}
                placeholder="Technology"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={adding}
                className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {adding ? "Adding..." : "Add"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="px-4 py-2.5 bg-accent border border-border rounded-lg text-sm hover:bg-accent/80"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Watchlist Table */}
      {watchlist.length > 0 ? (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden sm:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-4 text-xs font-mono font-semibold text-muted-foreground uppercase">Symbol</th>
                  <th className="text-left px-6 py-4 text-xs font-mono font-semibold text-muted-foreground uppercase">Name</th>
                  <th className="text-left px-6 py-4 text-xs font-mono font-semibold text-muted-foreground uppercase">Sector</th>
                  <th className="text-right px-6 py-4 text-xs font-mono font-semibold text-muted-foreground uppercase">Price</th>
                  <th className="text-right px-6 py-4 text-xs font-mono font-semibold text-muted-foreground uppercase">Bid</th>
                  <th className="text-right px-6 py-4 text-xs font-mono font-semibold text-muted-foreground uppercase">Ask</th>
                  <th className="text-left px-6 py-4 text-xs font-mono font-semibold text-muted-foreground uppercase">Added</th>
                  <th className="text-right px-6 py-4 text-xs font-mono font-semibold text-muted-foreground uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((item) => {
                  const price = prices[item.symbol];
                  return (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-sm">{item.symbol}</td>
                      <td className="px-6 py-4 text-sm">{item.name}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{item.sector}</td>
                      <td className="px-6 py-4 text-right font-mono font-semibold text-sm">
                        ${price?.price?.toFixed(2) || "—"}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-sm text-muted-foreground">
                        ${price?.bid?.toFixed(2) || "—"}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-sm text-muted-foreground">
                        ${price?.ask?.toFixed(2) || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {new Date(item.added_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleRemove(item.symbol)}
                          disabled={removing === item.symbol}
                          className="px-3 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg text-xs font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          {removing === item.symbol ? "..." : "Remove"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="sm:hidden divide-y divide-border">
            {watchlist.map((item) => {
              const price = prices[item.symbol];
              return (
                <div key={item.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono font-bold text-sm">{item.symbol}</span>
                      <span className="text-xs text-muted-foreground ml-2">{item.sector}</span>
                    </div>
                    <span className="font-mono font-semibold">${price?.price?.toFixed(2) || "—"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{item.name}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Added {new Date(item.added_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => handleRemove(item.symbol)}
                      className="px-3 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg text-xs font-semibold"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
              <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2">No stocks in your watchlist</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add stocks to track their prices and get AI-powered recommendations.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90"
          >
            Add Your First Stock
          </button>
        </div>
      )}
    </div>
  );
}
