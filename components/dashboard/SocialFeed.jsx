"use client";

import { useState, useEffect, useCallback } from "react";

const PLATFORM_CONFIG = {
  reddit: { label: "Reddit", color: "text-orange-500", bg: "bg-orange-500/10", icon: "🔴" },
  twitter: { label: "X / Twitter", color: "text-blue-400", bg: "bg-blue-400/10", icon: "𝕏" },
  tiktok: { label: "TikTok", color: "text-pink-500", bg: "bg-pink-500/10", icon: "♪" },
  instagram: { label: "Instagram", color: "text-purple-500", bg: "bg-purple-500/10", icon: "📷" },
};

export default function SocialFeed({ symbols, selectedSymbol }) {
  const [socialData, setSocialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | reddit | twitter | tiktok | instagram

  const fetchSocial = useCallback(async () => {
    try {
      const syms = symbols?.join(",") || "AAPL,NVDA,MSFT,TSLA";
      const res = await fetch(`/api/social?symbols=${syms}`);
      if (res.ok) {
        const data = await res.json();
        setSocialData(data);
      }
    } catch (error) {
      console.error("Social fetch error:", error);
    }
    setLoading(false);
  }, [symbols]);

  useEffect(() => {
    fetchSocial();
    const interval = setInterval(fetchSocial, 180000); // Refresh every 3 min
    return () => clearInterval(interval);
  }, [fetchSocial]);

  const filteredPosts = (socialData?.posts || []).filter((p) => {
    if (filter !== "all" && p.platform !== filter) return false;
    if (selectedSymbol && selectedSymbol !== "ALL" && !p.symbols.includes(selectedSymbol)) return false;
    return true;
  });

  const selectedSentiment = selectedSymbol && socialData?.aggregated?.[selectedSymbol];

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-mono font-semibold text-muted-foreground">SOCIAL SENTIMENT</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Reddit · X/Twitter · TikTok · Instagram
          </p>
        </div>
        <div className="flex items-center gap-2">
          {socialData?.platformCounts && (
            <div className="flex items-center gap-2">
              {Object.entries(socialData.platformCounts).map(([platform, count]) => {
                const config = PLATFORM_CONFIG[platform];
                return (
                  <span key={platform} className={`text-[10px] font-mono ${config.color}`}>
                    {config.icon} {count}
                  </span>
                );
              })}
            </div>
          )}
          <button onClick={fetchSocial} className="p-1.5 hover:bg-accent rounded-lg transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Platform Filter */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex-shrink-0 ${
            filter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
          }`}
        >
          All
        </button>
        {Object.entries(PLATFORM_CONFIG).map(([key, config]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex-shrink-0 ${
              filter === key ? `${config.bg} ${config.color}` : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {config.icon} {config.label}
          </button>
        ))}
      </div>

      {/* Sentiment Summary for Selected Symbol */}
      {selectedSentiment && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {Object.entries(selectedSentiment.platforms || {}).map(([platform, data]) => {
            const config = PLATFORM_CONFIG[platform];
            return (
              <div key={platform} className={`p-3 rounded-xl ${config.bg}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs">{config.icon}</span>
                  <span className={`text-[10px] font-mono font-semibold ${config.color}`}>{config.label}</span>
                </div>
                <div className={`font-mono font-bold text-sm ${
                  data.avgSentiment > 0.1 ? "text-bullish" : data.avgSentiment < -0.1 ? "text-bearish" : "text-neutral"
                }`}>
                  {data.avgSentiment > 0 ? "+" : ""}{data.avgSentiment.toFixed(2)}
                </div>
                <div className="text-[10px] text-muted-foreground">{data.postCount} posts</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Posts Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {filteredPosts.length > 0 ? (
            filteredPosts.slice(0, 25).map((post, i) => {
              const config = PLATFORM_CONFIG[post.platform];
              return (
                <a
                  key={i}
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 bg-background rounded-lg border border-border hover:border-primary/20 transition-all"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs ${config.bg} ${config.color} px-1.5 py-0.5 rounded font-mono font-bold`}>
                      {config.icon} {config.label}
                    </span>
                    {post.symbols?.map((s) => (
                      <span key={s} className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        ${s}
                      </span>
                    ))}
                    {post.source && post.source !== config.label && (
                      <span className="text-[10px] text-muted-foreground ml-auto">{post.source}</span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed">{post.title}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {post.sentiment && !post.needsAIAnalysis && (
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          post.sentiment.score > 0.1 ? "bg-bullish" : post.sentiment.score < -0.1 ? "bg-bearish" : "bg-neutral"
                        }`} />
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {post.sentiment.score > 0 ? "+" : ""}{post.sentiment.score.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {post.engagement > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        🔥 {post.engagement > 1000 ? `${(post.engagement / 1000).toFixed(1)}k` : post.engagement}
                      </span>
                    )}
                    {post.author && (
                      <span className="text-[10px] text-muted-foreground">by {post.author}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground/50 ml-auto">
                      {new Date(post.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </a>
              );
            })
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">
              No social posts found for selected filters
            </p>
          )}
        </div>
      )}
    </div>
  );
}
