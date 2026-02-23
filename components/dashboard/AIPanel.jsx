"use client";

import { useState } from "react";

const signalColors = {
  "STRONG BUY": { text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30" },
  "BUY": { text: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  "HOLD": { text: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
  "SELL": { text: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
  "STRONG SELL": { text: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/30" },
};

export default function AIPanel({ symbol, stockName, articles, sentiment, price, onAddToWatchlist }) {
  const [isOpen, setIsOpen] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [top10, setTop10] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingTop10, setLoadingTop10] = useState(false);
  const [activeTab, setActiveTab] = useState("analyze"); // analyze | top10

  const analyzeStock = async () => {
    setLoading(true);
    setAnalysis(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "analyze",
          symbol,
          articles,
          sentiment,
          price,
        }),
      });
      const data = await res.json();
      if (data.analysis) {
        setAnalysis(data.analysis);
      } else if (data.error) {
        setAnalysis({ summary: `Error: ${data.error}`, signal: "HOLD", confidence: 0, keyFactors: [], risks: [] });
      }
    } catch (error) {
      setAnalysis({ summary: "Failed to connect to AI service.", signal: "HOLD", confidence: 0, keyFactors: [], risks: [] });
    }
    setLoading(false);
  };

  const generateTop10 = async () => {
    setLoadingTop10(true);
    setTop10(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "top10",
          symbol,
          articles,
        }),
      });
      const data = await res.json();
      if (data.watchlist) {
        setTop10(data.watchlist);
      }
    } catch (error) {
      console.error("Top 10 error:", error);
    }
    setLoadingTop10(false);
  };

  const addToWatchlist = async (sym, name, sector) => {
    try {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym, name, sector }),
      });
      if (onAddToWatchlist) onAddToWatchlist(sym, name);
    } catch (error) {
      console.error("Watchlist error:", error);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => { setIsOpen(true); if (!analysis) analyzeStock(); }}
        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-all shadow-lg shadow-blue-500/20"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a4 4 0 014 4c0 1.1-.9 2-2 2h-4a2 2 0 01-2-2 4 4 0 014-4z" />
          <path d="M8 8v2a6 6 0 006 6h0a6 6 0 006-6V8" />
          <line x1="12" y1="16" x2="12" y2="22" />
          <line x1="8" y1="22" x2="16" y2="22" />
        </svg>
        AI Analysis
      </button>
    );
  }

  const colors = signalColors[analysis?.signal] || signalColors["HOLD"];

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl shadow-black/20">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-blue-600/10 to-cyan-500/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 014 4c0 1.1-.9 2-2 2h-4a2 2 0 01-2-2 4 4 0 014-4z" />
              <path d="M8 8v2a6 6 0 006 6h0a6 6 0 006-6V8" />
            </svg>
          </div>
          <span className="font-semibold text-sm">Claude AI Analysis</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-all text-muted-foreground"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => { setActiveTab("analyze"); if (!analysis) analyzeStock(); }}
          className={`flex-1 px-4 py-3 text-xs font-mono font-semibold transition-all ${
            activeTab === "analyze" ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          ANALYZE {symbol}
        </button>
        <button
          onClick={() => { setActiveTab("top10"); if (!top10) generateTop10(); }}
          className={`flex-1 px-4 py-3 text-xs font-mono font-semibold transition-all ${
            activeTab === "top10" ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          TOP 10 WATCHLIST
        </button>
      </div>

      {/* Content */}
      <div className="p-6 max-h-[500px] overflow-y-auto">
        {activeTab === "analyze" && (
          <>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm text-muted-foreground font-mono">Analyzing {symbol}...</p>
              </div>
            ) : analysis ? (
              <div className="space-y-5">
                {/* Signal Badge */}
                <div className={`flex items-center justify-between p-4 rounded-xl ${colors.bg} border ${colors.border}`}>
                  <div>
                    <div className={`text-2xl font-bold font-mono ${colors.text}`}>{analysis.signal}</div>
                    <div className="text-xs text-muted-foreground mt-1 font-mono">
                      {analysis.confidence}% confidence
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold font-mono">{symbol}</div>
                    <div className="text-xs text-muted-foreground">${price?.toFixed(2) || "—"}</div>
                  </div>
                </div>

                {/* Summary */}
                <div>
                  <h4 className="text-xs font-mono font-semibold text-muted-foreground mb-2">SUMMARY</h4>
                  <p className="text-sm leading-relaxed">{analysis.summary}</p>
                </div>

                {/* Key Factors */}
                {analysis.keyFactors?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-mono font-semibold text-muted-foreground mb-2">KEY FACTORS</h4>
                    <div className="space-y-2">
                      {analysis.keyFactors.map((factor, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-primary mt-0.5">→</span>
                          <span>{factor}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Risks */}
                {analysis.risks?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-mono font-semibold text-muted-foreground mb-2">RISKS TO WATCH</h4>
                    <div className="space-y-2">
                      {analysis.risks.map((risk, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-bearish mt-0.5">⚠</span>
                          <span>{risk}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Price Outlook */}
                {analysis.priceOutlook && (
                  <div className="bg-background rounded-xl p-4">
                    <h4 className="text-xs font-mono font-semibold text-muted-foreground mb-1">PRICE OUTLOOK</h4>
                    <p className="text-sm">{analysis.priceOutlook}</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => addToWatchlist(symbol, stockName)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-semibold hover:bg-primary/20 transition-all"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26z" />
                    </svg>
                    Add to Watchlist
                  </button>
                  <button
                    onClick={analyzeStock}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-accent border border-border rounded-xl text-xs font-semibold hover:bg-accent/80 transition-all"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                    Re-analyze
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}

        {activeTab === "top10" && (
          <>
            {loadingTop10 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm text-muted-foreground font-mono">Generating top 10 watchlist...</p>
              </div>
            ) : top10 ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground mb-4">
                  AI-curated watchlist based on current market conditions and news sentiment.
                </p>
                {top10.map((stock, i) => {
                  const sc = signalColors[stock.signal] || signalColors["HOLD"];
                  return (
                    <div
                      key={stock.symbol}
                      className="flex items-center gap-4 p-4 bg-background rounded-xl border border-border hover:border-primary/20 transition-all"
                    >
                      <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center font-mono font-bold text-xs text-muted-foreground">
                        {stock.priority || i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm">{stock.symbol}</span>
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${sc.bg} ${sc.text}`}>
                            {stock.signal}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{stock.reason}</p>
                      </div>
                      <button
                        onClick={() => addToWatchlist(stock.symbol, stock.name)}
                        className="flex-shrink-0 px-3 py-2 bg-primary/10 text-primary border border-primary/20 rounded-lg text-[10px] font-semibold hover:bg-primary/20 transition-all"
                      >
                        + Add
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={generateTop10}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent border border-border rounded-xl text-xs font-semibold hover:bg-accent/80 transition-all mt-4"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                  </svg>
                  Regenerate Top 10
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
