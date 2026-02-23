"use client";

export default function Movers({ prices, prevPrices, watchlist }) {
  // Calculate changes for all stocks
  const movers = watchlist
    .map((stock) => {
      const current = prices[stock.symbol]?.price;
      const prev = prevPrices[stock.symbol]?.price;
      if (!current || !prev || current === prev) return null;
      const change = current - prev;
      const pct = ((change / prev) * 100).toFixed(2);
      return { ...stock, price: current, change, pct: parseFloat(pct), isUp: change > 0 };
    })
    .filter(Boolean)
    .sort((a, b) => b.pct - a.pct);

  const gainers = movers.filter((m) => m.isUp).slice(0, 3);
  const losers = movers.filter((m) => !m.isUp).slice(0, 3);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Gainers */}
      <div className="bg-card border border-emerald-500/20 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
          <h3 className="text-xs font-mono font-semibold text-emerald-500">TOP GAINERS</h3>
        </div>
        {gainers.length > 0 ? (
          <div className="space-y-2">
            {gainers.map((stock) => (
              <div key={stock.symbol} className="flex items-center justify-between p-2 bg-emerald-500/5 rounded-lg">
                <div>
                  <span className="font-mono font-bold text-sm">{stock.symbol}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">${stock.price.toFixed(2)}</span>
                </div>
                <span className="font-mono text-xs font-semibold text-emerald-500">
                  ▲ {Math.abs(stock.pct)}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-3">No gainers yet</p>
        )}
      </div>

      {/* Losers */}
      <div className="bg-card border border-red-500/20 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
            <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
            <polyline points="17 18 23 18 23 12" />
          </svg>
          <h3 className="text-xs font-mono font-semibold text-red-500">TOP LOSERS</h3>
        </div>
        {losers.length > 0 ? (
          <div className="space-y-2">
            {losers.map((stock) => (
              <div key={stock.symbol} className="flex items-center justify-between p-2 bg-red-500/5 rounded-lg">
                <div>
                  <span className="font-mono font-bold text-sm">{stock.symbol}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">${stock.price.toFixed(2)}</span>
                </div>
                <span className="font-mono text-xs font-semibold text-red-500">
                  ▼ {Math.abs(stock.pct)}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-3">No losers yet</p>
        )}
      </div>
    </div>
  );
}
