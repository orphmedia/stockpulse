"use client";

import { useState, useEffect, useCallback, useRef } from "react";

function parseCSVLine(line) {
  // Handle quoted CSV fields properly (commas inside quotes)
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function cleanNumber(val) {
  if (!val || val === "--" || val === "N/A") return 0;
  return parseFloat(val.replace(/[$,%]/g, "").replace(/,/g, "")) || 0;
}

function parseCSV(text) {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (lines.length < 3) return [];

  // Find the header row (contains "Symbol")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (lines[i].toLowerCase().includes('"symbol"') || lines[i].toLowerCase().includes("symbol")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const header = parseCSVLine(lines[headerIdx]).map((h) => h.toLowerCase().replace(/['"]/g, "").trim());

  // Map columns flexibly
  const colMap = {};
  header.forEach((h, i) => {
    if (h.includes("symbol") || h.includes("ticker")) colMap.symbol = i;
    else if (h.includes("qty") || h.includes("quantity") || h.includes("shares")) colMap.shares = i;
    else if (h.includes("cost/share") || h.includes("avg cost") || h.includes("average cost")) colMap.avg_cost = i;
    else if (h.includes("cost basis") && colMap.cost_basis === undefined) colMap.cost_basis = i;
    else if ((h.includes("price") && !h.includes("chng") && !h.includes("change")) && colMap.price === undefined) colMap.price = i;
    else if (h.includes("description") || h.includes("name") || h.includes("company")) colMap.name = i;
    else if (h.includes("security type") || h.includes("sector") || h.includes("type")) colMap.sector = i;
    else if (h.includes("mkt val") || h.includes("market value")) colMap.market_value = i;
    else if (h.includes("gain %") || h.includes("gain/loss %")) colMap.gain_pct = i;
  });

  if (colMap.symbol === undefined) return [];

  // Parse data rows
  const rows = lines.slice(headerIdx + 1);
  return rows.map((line) => {
    const cols = parseCSVLine(line);
    const symbol = (cols[colMap.symbol] || "").replace(/['"]/g, "").trim();

    // Skip non-stock rows (Cash, Account Total, etc.)
    if (!symbol || symbol === "--" || symbol.includes("Cash") || symbol.includes("Total") || symbol.includes("Account")) {
      return null;
    }

    const shares = cleanNumber(cols[colMap.shares]);
    // Prefer cost/share, fall back to cost_basis / shares, fall back to price
    let avgCost = colMap.avg_cost !== undefined ? cleanNumber(cols[colMap.avg_cost]) : 0;
    if (!avgCost && colMap.cost_basis !== undefined && shares > 0) {
      avgCost = cleanNumber(cols[colMap.cost_basis]) / shares;
    }
    if (!avgCost && colMap.price !== undefined) {
      avgCost = cleanNumber(cols[colMap.price]);
    }

    const name = colMap.name !== undefined ? (cols[colMap.name] || "").replace(/['"]/g, "").trim() : "";
    const sector = colMap.sector !== undefined ? (cols[colMap.sector] || "").replace(/['"]/g, "").trim() : "";

    return {
      symbol,
      shares: shares.toString(),
      avg_cost: avgCost.toString(),
      name: name || symbol,
      sector: sector || "Unknown",
    };
  }).filter(Boolean);
}

export default function PortfolioWidget({ prices, signals }) {
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

    // Generate signal from sentiment if available
    const sent = signals?.[h.symbol];
    let signal = "HOLD";
    let signalColor = "text-yellow-500";
    let signalBg = "bg-yellow-500/10";
    if (sent?.avgScore > 0.3) { signal = "BUY"; signalColor = "text-emerald-500"; signalBg = "bg-emerald-500/10"; }
    else if (sent?.avgScore > 0.1) { signal = "LEAN BUY"; signalColor = "text-emerald-400"; signalBg = "bg-emerald-400/10"; }
    else if (sent?.avgScore < -0.3) { signal = "SELL"; signalColor = "text-red-500"; signalBg = "bg-red-500/10"; }
    else if (sent?.avgScore < -0.1) { signal = "LEAN SELL"; signalColor = "text-red-400"; signalBg = "bg-red-400/10"; }

    return { ...h, currentPrice, marketValue, costBasis, pnl, pnlPct, signal, signalColor, signalBg };
  });

  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  const totalCost = holdings.reduce((sum, h) => sum + h.costBasis, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? ((totalPnl / totalCost) * 100) : 0;

  const gainers = holdings.filter((h) => h.pnl > 0).length;
  const losers = holdings.filter((h) => h.pnl < 0).length;
  const bestPerformer = [...holdings].sort((a, b) => b.pnlPct - a.pnlPct)[0];
  const worstPerformer = [...holdings].sort((a, b) => a.pnlPct - b.pnlPct)[0];

  const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header — always visible */}
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
              {totalValue > 0 ? `$${fmt(totalValue)}` : "—"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {totalValue > 0 && (
            <span className={`text-xs font-mono font-semibold px-2 py-1 rounded ${
              totalPnl >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
            }`}>
              {totalPnl >= 0 ? "▲" : "▼"} {totalPnl >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%
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

      {/* Expanded */}
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
            <button onClick={fetchPortfolio} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent border border-border rounded-lg text-[10px] font-semibold hover:bg-accent/80 transition-all">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10" />
              </svg>
              Refresh
            </button>
          </div>

          {/* CSV Upload */}
          {showUpload && (
            <div className="px-4 py-3 border-b border-border bg-accent/20">
              <p className="text-[10px] text-muted-foreground mb-2">
                Supports Schwab, Fidelity, TD Ameritrade, and standard CSV formats.
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

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : holdings.length > 0 ? (
            <>
              {/* Overall Analysis */}
              <div className="px-4 py-3 border-b border-border">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-background rounded-xl p-3">
                    <div className="text-[9px] font-mono text-muted-foreground mb-1">TOTAL VALUE</div>
                    <div className="text-sm font-mono font-bold">${fmt(totalValue)}</div>
                  </div>
                  <div className="bg-background rounded-xl p-3">
                    <div className="text-[9px] font-mono text-muted-foreground mb-1">TOTAL P/L</div>
                    <div className={`text-sm font-mono font-bold ${totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {totalPnl >= 0 ? "+" : ""}${fmt(totalPnl)}
                    </div>
                  </div>
                  <div className="bg-background rounded-xl p-3">
                    <div className="text-[9px] font-mono text-muted-foreground mb-1">RETURN</div>
                    <div className={`text-sm font-mono font-bold ${totalPnlPct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%
                    </div>
                  </div>
                  <div className="bg-background rounded-xl p-3">
                    <div className="text-[9px] font-mono text-muted-foreground mb-1">WIN / LOSE</div>
                    <div className="text-sm font-mono font-bold">
                      <span className="text-emerald-500">{gainers}</span>
                      <span className="text-muted-foreground mx-1">/</span>
                      <span className="text-red-500">{losers}</span>
                    </div>
                  </div>
                </div>

                {/* Best / Worst */}
                {bestPerformer && (
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex-1 flex items-center gap-2 p-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
                      <span className="text-[9px] text-emerald-500 font-mono">BEST</span>
                      <span className="font-mono font-bold text-xs">{bestPerformer.symbol}</span>
                      <span className="text-emerald-500 font-mono text-[10px] ml-auto">+{bestPerformer.pnlPct.toFixed(1)}%</span>
                    </div>
                    {worstPerformer && worstPerformer.pnl < 0 && (
                      <div className="flex-1 flex items-center gap-2 p-2 bg-red-500/5 border border-red-500/10 rounded-lg">
                        <span className="text-[9px] text-red-500 font-mono">WORST</span>
                        <span className="font-mono font-bold text-xs">{worstPerformer.symbol}</span>
                        <span className="text-red-500 font-mono text-[10px] ml-auto">{worstPerformer.pnlPct.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Holdings List */}
              <div className="max-h-[400px] overflow-y-auto">
                {/* Column Headers */}
                <div className="flex items-center px-4 py-2 text-[9px] font-mono text-muted-foreground uppercase border-b border-border sticky top-0 bg-card">
                  <span className="w-2 mr-2" />
                  <span className="flex-1">Stock</span>
                  <span className="w-20 text-right">Price</span>
                  <span className="w-20 text-right">P/L</span>
                  <span className="w-16 text-right">Signal</span>
                  <span className="w-6" />
                </div>

                {holdings.map((h) => (
                  <div
                    key={h.symbol}
                    className="flex items-center px-4 py-2.5 border-b border-border last:border-0 hover:bg-accent/20 transition-colors group"
                  >
                    {/* Color indicator */}
                    <span className={`w-2 h-full min-h-[32px] rounded-full mr-2 flex-shrink-0 ${
                      h.pnl > 0 ? "bg-emerald-500" : h.pnl < 0 ? "bg-red-500" : "bg-yellow-500"
                    }`} />

                    {/* Stock info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs">{h.symbol}</span>
                        <span className="text-[9px] text-muted-foreground">{h.shares} sh</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{h.name}</div>
                    </div>

                    {/* Price */}
                    <div className="w-20 text-right flex-shrink-0">
                      <div className="font-mono text-xs font-semibold">
                        ${h.currentPrice > 0 ? h.currentPrice.toFixed(2) : "—"}
                      </div>
                      <div className="text-[9px] text-muted-foreground font-mono">
                        cost ${h.avg_cost > 0 ? Number(h.avg_cost).toFixed(2) : "—"}
                      </div>
                    </div>

                    {/* P/L */}
                    <div className="w-20 text-right flex-shrink-0">
                      <div className={`font-mono text-xs font-semibold ${
                        h.pnl > 0 ? "text-emerald-500" : h.pnl < 0 ? "text-red-500" : "text-muted-foreground"
                      }`}>
                        {h.pnl >= 0 ? "+" : ""}{h.pnlPct.toFixed(2)}%
                      </div>
                      <div className={`text-[9px] font-mono ${
                        h.pnl > 0 ? "text-emerald-500/70" : h.pnl < 0 ? "text-red-500/70" : "text-muted-foreground"
                      }`}>
                        {h.pnl >= 0 ? "+" : ""}${fmt(h.pnl)}
                      </div>
                    </div>

                    {/* Signal */}
                    <div className="w-16 text-right flex-shrink-0">
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${h.signalBg} ${h.signalColor}`}>
                        {h.signal}
                      </span>
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => handleRemove(h.symbol)}
                      className="w-6 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded text-muted-foreground hover:text-red-500 transition-all flex-shrink-0"
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
