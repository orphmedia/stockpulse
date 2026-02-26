"use client";

import { useState, useEffect, useCallback } from "react";

const SIGNAL_COLORS = {
  "STRONG BUY": { text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30" },
  "STRONG_BUY": { text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30" },
  "BUY": { text: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  "LEAN BUY": { text: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" },
  "HOLD": { text: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
  "SELL": { text: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
  "LEAN SELL": { text: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20" },
  "STRONG SELL": { text: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/30" },
  "STRONG_SELL": { text: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/30" },
};

export default function AnalysisPage() {
  const [signals, setSignals] = useState([]);
  const [sentimentHistory, setSentimentHistory] = useState([]);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState("ALL");
  const [dateRange, setDateRange] = useState("7d");
  const [activeTab, setActiveTab] = useState("signals"); // signals | sentiment | news

  const symbols = ["AAPL", "NVDA", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "JPM"];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch news with sentiment
      const symbolsParam = selectedSymbol === "ALL" ? symbols.join(",") : selectedSymbol;
      const newsRes = await fetch(`/api/news?symbols=${symbolsParam}`);
      if (newsRes.ok) {
        const data = await newsRes.json();
        setNews(data.articles || []);

        // Build sentiment history from articles
        const sentMap = {};
        (data.articles || []).forEach((article) => {
          if (article.sentiment && article.symbols) {
            article.symbols.forEach((sym) => {
              if (!sentMap[sym]) sentMap[sym] = [];
              sentMap[sym].push({
                score: article.sentiment.score,
                confidence: article.sentiment.confidence,
                title: article.title,
                source: article.source,
                date: article.published_at,
              });
            });
          }
        });
        setSentimentHistory(sentMap);

        // Generate signals from sentiment data
        if (data.sentiment) {
          const sigs = Object.entries(data.sentiment).map(([sym, sent]) => {
            let signal = "HOLD";
            if (sent.avgScore > 0.3) signal = "BUY";
            if (sent.avgScore > 0.5) signal = "STRONG BUY";
            if (sent.avgScore < -0.3) signal = "SELL";
            if (sent.avgScore < -0.5) signal = "STRONG SELL";
            return {
              symbol: sym,
              signal,
              confidence: Math.min(95, 40 + Math.abs(sent.avgScore) * 80),
              sentiment: sent.avgScore,
              articleCount: sent.articleCount,
              trend: sent.trend,
              timestamp: new Date().toISOString(),
            };
          });
          setSignals(sigs);
        }
      }
    } catch (error) {
      console.error("Analysis fetch error:", error);
    }
    setLoading(false);
  }, [selectedSymbol]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getColors = (signal) => SIGNAL_COLORS[signal] || SIGNAL_COLORS["HOLD"];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-mono text-muted-foreground">Loading analysis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Signal history, sentiment tracking, and news analysis
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Symbol Filter */}
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="px-3 py-2 bg-card border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="ALL">All Symbols</option>
            {symbols.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Date Range */}
          <div className="flex items-center bg-card border border-border rounded-lg overflow-hidden">
            {["24h", "7d", "30d"].map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-2 text-xs font-mono transition-all ${
                  dateRange === range
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg hover:bg-accent transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            <span className="text-xs font-mono text-muted-foreground">REFRESH</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {[
          { id: "signals", label: "Signals" },
          { id: "sentiment", label: "Sentiment" },
          { id: "news", label: "News History" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Signals Tab */}
      {activeTab === "signals" && (
        <div className="space-y-4">
          {signals.length > 0 ? (
            <>
              {/* Signal Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {signals.map((sig) => {
                  const colors = getColors(sig.signal);
                  return (
                    <div key={sig.symbol} className={`p-4 rounded-xl border ${colors.border} ${colors.bg}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono font-bold text-sm">{sig.symbol}</span>
                        <span className={`text-[10px] font-mono font-bold ${colors.text}`}>{sig.signal}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Confidence: {sig.confidence.toFixed(0)}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Sentiment: {sig.sentiment > 0 ? "+" : ""}{sig.sentiment.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {sig.articleCount} articles
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Signal History Table */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                  <h3 className="text-sm font-mono font-semibold text-muted-foreground">SIGNAL HISTORY</h3>
                </div>
                {/* Desktop */}
                <div className="hidden sm:block">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Symbol</th>
                        <th className="text-left px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Signal</th>
                        <th className="text-right px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Confidence</th>
                        <th className="text-right px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Sentiment</th>
                        <th className="text-right px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Articles</th>
                        <th className="text-left px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Trend</th>
                        <th className="text-left px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {signals.map((sig, i) => {
                        const colors = getColors(sig.signal);
                        return (
                          <tr key={i} className="border-b border-border last:border-0 hover:bg-accent/30">
                            <td className="px-6 py-3 font-mono font-bold text-sm">{sig.symbol}</td>
                            <td className="px-6 py-3">
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-mono font-semibold ${colors.bg} ${colors.text} border ${colors.border}`}>
                                {sig.signal}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-right font-mono text-sm">{sig.confidence.toFixed(0)}%</td>
                            <td className={`px-6 py-3 text-right font-mono text-sm ${
                              sig.sentiment > 0.1 ? "text-bullish" : sig.sentiment < -0.1 ? "text-bearish" : "text-neutral"
                            }`}>
                              {sig.sentiment > 0 ? "+" : ""}{sig.sentiment.toFixed(2)}
                            </td>
                            <td className="px-6 py-3 text-right font-mono text-sm text-muted-foreground">{sig.articleCount}</td>
                            <td className="px-6 py-3 text-sm text-muted-foreground capitalize">{sig.trend?.replace("_", " ")}</td>
                            <td className="px-6 py-3 text-sm text-muted-foreground">
                              {new Date(sig.timestamp).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Mobile */}
                <div className="sm:hidden divide-y divide-border">
                  {signals.map((sig, i) => {
                    const colors = getColors(sig.signal);
                    return (
                      <div key={i} className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold">{sig.symbol}</span>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-semibold ${colors.bg} ${colors.text}`}>
                            {sig.signal}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Confidence: {sig.confidence.toFixed(0)}%</span>
                          <span className={sig.sentiment > 0 ? "text-bullish" : "text-bearish"}>
                            Sent: {sig.sentiment > 0 ? "+" : ""}{sig.sentiment.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {sig.articleCount} articles · {new Date(sig.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <p className="text-muted-foreground">No signals generated yet. Data will appear once news is analyzed.</p>
            </div>
          )}
        </div>
      )}

      {/* Sentiment Tab */}
      {activeTab === "sentiment" && (
        <div className="space-y-4">
          {Object.keys(sentimentHistory).length > 0 ? (
            Object.entries(sentimentHistory).map(([sym, entries]) => (
              <div key={sym} className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-mono font-bold text-lg">{sym}</h3>
                  <span className="text-xs font-mono text-muted-foreground">
                    {entries.length} data points
                  </span>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {entries.slice(0, 20).map((entry, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-background rounded-lg">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        entry.score > 0.1 ? "bg-bullish" : entry.score < -0.1 ? "bg-bearish" : "bg-neutral"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate">{entry.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {entry.source} · {new Date(entry.date).toLocaleString()}
                        </p>
                      </div>
                      <span className={`font-mono text-xs font-semibold flex-shrink-0 ${
                        entry.score > 0.1 ? "text-bullish" : entry.score < -0.1 ? "text-bearish" : "text-neutral"
                      }`}>
                        {entry.score > 0 ? "+" : ""}{entry.score.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <p className="text-muted-foreground">No sentiment data yet. News analysis will populate this view.</p>
            </div>
          )}
        </div>
      )}

      {/* News History Tab */}
      {activeTab === "news" && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-mono font-semibold text-muted-foreground">NEWS HISTORY</h3>
            <span className="text-xs font-mono text-muted-foreground">{news.length} articles</span>
          </div>
          <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
            {news.length > 0 ? (
              news.map((article, i) => (
                <a
                  key={i}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-6 py-4 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {article.symbols?.map((s) => (
                        <span key={s} className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                          {s}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm flex-1 min-w-0">{article.title}</p>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {article.sentiment && (
                        <span className={`font-mono text-xs font-semibold ${
                          article.sentiment.score > 0.1 ? "text-bullish"
                            : article.sentiment.score < -0.1 ? "text-bearish" : "text-neutral"
                        }`}>
                          {article.sentiment.score > 0 ? "+" : ""}{article.sentiment.score.toFixed(2)}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {article.source}
                      </span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {new Date(article.published_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </a>
              ))
            ) : (
              <div className="p-12 text-center text-muted-foreground">No news articles found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
