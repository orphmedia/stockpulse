"use client";

export default function StockCard({ symbol, name, price, change, changePct, sector, confidence, targetPrice, dividend, catalyst, onAddWatchlist, onDismiss }) {
  if (!symbol) return null;

  const isUp = change >= 0;

  return (
    <div className="relative bg-card border border-border rounded-2xl overflow-hidden">
      {/* Gradient top bar */}
      <div className="h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600" />

      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-2xl">{symbol}</span>
              {confidence && (
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                  confidence === "HIGH" ? "bg-emerald-500/15 text-emerald-500"
                  : confidence === "MEDIUM" ? "bg-blue-500/15 text-blue-500"
                  : "bg-amber-500/15 text-amber-500"
                }`}>{confidence}</span>
              )}
              {sector && <span className="text-[10px] font-mono text-muted-foreground bg-accent px-2 py-0.5 rounded">{sector}</span>}
            </div>
            {name && <p className="text-sm text-muted-foreground mt-0.5">{name}</p>}
          </div>
          <div className="flex items-center gap-2">
            {onAddWatchlist && (
              <button onClick={onAddWatchlist}
                className="text-xs font-semibold px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all">
                + Watch
              </button>
            )}
            {onDismiss && (
              <button onClick={onDismiss} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Metrics row */}
        <div className="flex items-end gap-6 flex-wrap">
          {price > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground font-mono mb-0.5">PRICE</div>
              <div className="font-mono font-bold text-xl">${Number(price).toFixed(2)}</div>
            </div>
          )}
          {(change !== undefined && change !== null) && (
            <div>
              <div className="text-[10px] text-muted-foreground font-mono mb-0.5">CHANGE</div>
              <div className={`font-mono font-bold text-lg ${isUp ? "text-emerald-500" : "text-red-500"}`}>
                {isUp ? "+" : ""}{Number(change).toFixed(2)} ({changePct ? `${Number(changePct).toFixed(1)}%` : ""})
              </div>
            </div>
          )}
          {targetPrice > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground font-mono mb-0.5">TARGET</div>
              <div className="font-mono font-bold text-lg text-emerald-500">${Number(targetPrice).toFixed(2)}</div>
            </div>
          )}
          {dividend > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground font-mono mb-0.5">DIVIDEND</div>
              <div className="font-mono font-bold text-lg text-blue-400">{Number(dividend).toFixed(2)}%</div>
            </div>
          )}
        </div>

        {catalyst && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground leading-relaxed">{catalyst}</p>
          </div>
        )}
      </div>
    </div>
  );
}
