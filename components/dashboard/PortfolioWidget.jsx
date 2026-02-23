"use client";

import { useState, useEffect, useCallback, useRef } from "react";

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  // Parse header
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

  // Map common column names
  const colMap = {};
  header.forEach((h, i) => {
    if (h.includes("symbol") || h.includes("ticker") || h === "stock") colMap.symbol = i;
    else if (h.includes("share") || h.includes("quantity") || h.includes("qty")) colMap.shares = i;
    else if (h.includes("cost") || h.includes("avg") || h.includes("price") || h.includes("basis")) colMap.avg_cost = i;
    else if (h.includes("name") || h.includes("company")) colMap.name = i;
    else if (h.includes("sector") || h.includes("industry")) colMap.sector = i;
  });

  if (colMap.symbol === undefined) return [];

  // Parse rows
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/['"$]/g, ""));
    return {
      symbol: cols[colMap.symbol] || "",
      shares: cols[colMap.shares] || "0",
      avg_cost: cols[colMap.avg_cost] || "0",
      name: cols[colMap.name] || "",
      sector: cols[colMap.sector] || "",
    };
  }).filter((r) => r.symbol);
}

export default function PortfolioWidget({ prices }) {
  const [portfolio, setPortfolio] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const fileInputRef = useRef(null);

  const fetchPortfolio = useCallback(async () => {
    try {
      const res = await fetch("/api/portfolio");
      if (res.ok) {
        const data = await res.json();
        setPortfolio(data.portfolio || []);
      }
    } catch (error) {
      console.error("Portfolio fetch error:", error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const handleCSVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const text = await file.text();
      const holdings = parseCSV(text);

      if (holdings.length === 0) {
        alert("No valid holdings found. CSV should have columns: Symbol, Shares, Cost/Price");
        setUploading(false);
        return;
      }

      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings }),
      });

      if (res.ok) {
        fetchPortfolio();
        setShowUpload(false);
      }
    } catch (error) {
      console.error("CSV upload error:", error);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemove = async (symbol) => {
    try {
      await fetch("/api/portfolio", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      fetchPortfolio();
    } catch (error) {
      console.error("Remove error:", error);
    }
  };

  // Calculate portfolio metrics
  const holdings = portfolio.map((h) => {
    const currentPrice = prices?.[h.symbol]?.price || 0;
    const marketValue = currentPrice * h.shares;
    const costBasis = h.avg_cost * h.shares;
    const pnl = marketValue - costBasis;
    const pnlPct = costBasis > 0 ? ((pnl / costBasis) * 100) : 0;
    return { ...h, currentPrice, marketValue, costBasis, pnl, pnlPct };
  });

  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  const totalCost = holdings.reduce((sum, h) => sum + h.costBasis, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? ((totalPnl / totalCost) * 100) : 0;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Compact Header — always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2v20M2 12h20" />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-xs font-mono font-semibold text-muted-foreground">PORTFOLIO</div>
            <div className="text-sm font-bold font-mono">
              {totalValue > 0 ? `$${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {totalValue > 0 && (
            <span className={`text-xs font-mono font-semibold px-2 py-1 rounded ${
              totalPnl >= 0
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-red-500/10 text-red-500"
            }`}>
              {totalPnl >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%
            </span>
          )}
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border">
          {/* Actions */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg text-[10px] font-semibold hover:bg-primary/20 transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload CSV
            </button>
            <button
              onClick={fetchPortfolio}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent border border-border rounded-lg text-[10px] font-semibold hover:bg-accent/80 transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10" />
              </svg>
              Refresh
            </button>
          </div>

          {/* CSV Upload Area */}
          {showUpload && (
            <div className="px-4 py-3 border-b border-border bg-accent/20">
              <p className="text-[10px] text-muted-foreground mb-2">
                CSV should have columns: Symbol, Shares, Cost/Price (or Average Cost)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleCSVUpload}
                className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-border file:bg-accent file:text-foreground file:font-semibold file:text-[10px] hover:file:bg-accent/80 file:cursor-pointer"
              />
              {uploading && <p className="text-[10px] text-primary mt-2">Importing...</p>}
            </div>
          )}

          {/* Holdings */}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : holdings.length > 0 ? (
            <>
              {/* Summary Row */}
              <div className="grid grid-cols-4 gap-2 px-4 py-3 bg-background/50">
                <div>
                  <div className="text-[9px] font-mono text-muted-foreground">TOTAL VALUE</div>
                  <div className="text-xs font-mono font-bold">
                    ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-mono text-muted-foreground">COST BASIS</div>
                  <div className="text-xs font-mono font-bold">
                    ${totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-mono text-muted-foreground">P/L</div>
                  <div className={`text-xs font-mono font-bold ${totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-mono text-muted-foreground">RETURN</div>
                  <div className={`text-xs font-mono font-bold ${totalPnlPct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Holdings List */}
              <div className="max-h-[300px] overflow-y-auto divide-y divide-border">
                {holdings.map((h) => (
                  <div key={h.symbol} className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/20 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs">{h.symbol}</span>
                        <span className="text-[9px] text-muted-foreground">{h.shares} shares</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{h.name}</div>
                    </div>
                    <div className="text-right flex-shrink-0 mr-2">
                      <div className="font-mono text-xs font-semibold">
                        ${h.marketValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className={`text-[10px] font-mono ${h.pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {h.pnl >= 0 ? "+" : ""}{h.pnlPct.toFixed(2)}%
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(h.symbol)}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all flex-shrink-0"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-muted-foreground mb-2">No holdings yet</p>
              <p className="text-[10px] text-muted-foreground">Upload a CSV or tell the AI to add stocks</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
