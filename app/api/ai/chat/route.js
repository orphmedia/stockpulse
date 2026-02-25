// Edge runtime = no cold starts
export const runtime = "edge";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CHAT_MODEL || "claude-haiku-4-5-20251001";

// Fetch real-time quotes from Yahoo Finance (server-side, no API key needed)
async function fetchLiveQuotes(symbols) {
  if (!symbols || symbols.length === 0) return {};
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(",")}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName,regularMarketVolume,regularMarketDayHigh,regularMarketDayLow,regularMarketOpen,regularMarketPreviousClose`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const results = {};
    for (const q of data.quoteResponse?.result || []) {
      results[q.symbol] = {
        price: q.regularMarketPrice,
        change: q.regularMarketChange || 0,
        changePct: q.regularMarketChangePercent || 0,
        volume: q.regularMarketVolume || 0,
        high: q.regularMarketDayHigh || 0,
        low: q.regularMarketDayLow || 0,
        open: q.regularMarketOpen || 0,
        prevClose: q.regularMarketPreviousClose || 0,
        name: q.shortName || q.symbol,
      };
    }
    return results;
  } catch (e) {
    console.error("[Chat] Yahoo quote fetch failed:", e.message);
    return {};
  }
}

export async function POST(request) {
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "No API key" }), { status: 503 });
  }

  const { message, history, prices: clientPrices, watchlist, portfolio, userName } = await request.json();
  const first = (userName || "there").split(" ")[0];

  // Collect all symbols we need quotes for
  const allSymbols = new Set(["SPY", "QQQ", "DIA"]);
  for (const h of (portfolio || [])) if (h.symbol) allSymbols.add(h.symbol);
  for (const w of (watchlist || [])) if (w.symbol) allSymbols.add(w.symbol);
  // Extract any symbols mentioned in the message
  const mentioned = message.match(/\b[A-Z]{1,5}\b/g) || [];
  for (const s of mentioned) {
    if (s.length >= 2 && !["AM","PM","ET","AI","US","UK","CEO","P","L","I","A","OK","GDP","IPO","THE","AND","FOR","BUY","SELL","HOLD","NOT","ALL","HAS","HOW","ARE","DID","CAN","GET","HIT","NEW","NOW","TOP","DAY","SET","RUN","PUT","ADD","LOW","BIG","ANY","OUR","HIS","HER","ITS","HAS","WAS","MAY"].includes(s)) {
      allSymbols.add(s);
    }
  }

  // Fetch LIVE quotes from Yahoo Finance (server-side, real-time)
  const liveQuotes = await fetchLiveQuotes([...allSymbols]);

  // Merge with client prices as fallback
  const prices = { ...clientPrices };
  for (const [sym, q] of Object.entries(liveQuotes)) {
    prices[sym] = { ...prices[sym], ...q };
  }

  // Current date/time
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  const hour = parseInt(now.toLocaleTimeString("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }));
  const marketOpen = hour >= 9 && hour < 16;
  const marketStatus = marketOpen ? "MARKET OPEN" : hour < 9 ? "PRE-MARKET" : "AFTER HOURS";

  // Format market indices
  const indices = ["SPY", "QQQ", "DIA"].map(s => {
    const p = prices[s];
    if (!p?.price) return `${s}: no data`;
    const vol = p.volume ? `vol ${(p.volume / 1e6).toFixed(1)}M` : "";
    return `${s} (${p.name || s}): $${p.price.toFixed(2)} ${p.change >= 0 ? "+" : ""}${p.change?.toFixed(2)} (${p.changePct >= 0 ? "+" : ""}${p.changePct?.toFixed(2)}%) | H:$${p.high?.toFixed(2)} L:$${p.low?.toFixed(2)} | ${vol}`;
  }).join("\n");

  // Format all stock quotes
  const quoteLines = Object.entries(prices)
    .filter(([s]) => !["SPY", "QQQ", "DIA"].includes(s))
    .slice(0, 25)
    .map(([s, p]) => {
      if (!p?.price) return `${s}: no data`;
      return `${s} (${p.name || s}): $${p.price.toFixed(2)} ${p.change >= 0 ? "+" : ""}${(p.change || 0).toFixed(2)} (${(p.changePct || 0).toFixed(2)}%)`;
    }).join("\n");

  // Portfolio with live P/L
  let totalValue = 0, totalCost = 0, totalDayPnl = 0;
  const portfolioLines = (portfolio || []).slice(0, 15).map((h) => {
    const p = prices[h.symbol];
    const cur = p?.price || 0;
    const shares = h.shares || 0;
    const cost = h.avg_cost || 0;
    const mktVal = cur * shares;
    const pnl = (cur - cost) * shares;
    const pnlPct = cost > 0 ? ((cur - cost) / cost * 100) : 0;
    const dayPnl = (p?.change || 0) * shares;
    totalValue += mktVal;
    totalCost += cost * shares;
    totalDayPnl += dayPnl;
    return `${h.symbol}: ${shares} sh @ $${cost.toFixed(2)} → $${cur.toFixed(2)} | val $${mktVal.toFixed(0)} | P/L ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(0)} (${pnlPct.toFixed(1)}%) | today ${dayPnl >= 0 ? "+" : ""}$${dayPnl.toFixed(2)}`;
  }).join("\n");
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost * 100).toFixed(1) : "0";

  const wl = (watchlist || []).slice(0, 10).map(w => w.symbol).join(", ");

  const system = `You are ${first}'s personal stock AI. Be direct and actionable. No markdown, no bullets, no asterisks.

TODAY: ${dateStr}, ${timeStr} ET — ${marketStatus}

MARKET INDICES (LIVE from Yahoo Finance):
${indices}

STOCK QUOTES (LIVE):
${quoteLines || "No individual stock data"}

PORTFOLIO TOTALS: Value $${totalValue.toFixed(0)} | Cost $${totalCost.toFixed(0)} | Total P/L ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(0)} (${totalPnlPct}%) | Today ${totalDayPnl >= 0 ? "+" : ""}$${totalDayPnl.toFixed(2)}
HOLDINGS:
${portfolioLines || "Empty portfolio"}

WATCHLIST: ${wl || "none"}

RULES:
- All prices above are LIVE and REAL from Yahoo Finance. Use them confidently with exact numbers.
- For briefings: state date/time, market status, portfolio total value and today's P/L, biggest movers, and 1-2 actionable suggestions. 4-6 sentences.
- For stock questions: 1-3 sentences with actual price data. Give BUY/SELL/HOLD.
- For stocks you have data for: cite the exact price, change, and %.
- For stocks NOT in the data: say you need to add it to the watchlist to get live tracking.

ACTIONS — append at END of response:
<action type="show_stock" symbol="X" name="N" price="0" targetPrice="0" confidence="HIGH" catalyst="why"/>
<action type="add_to_watchlist" symbol="X" name="N" sector="S"/>
<action type="remove_from_watchlist" symbol="X"/>
<action type="add_to_portfolio" symbol="X" shares="0" avg_cost="0" name="N"/>
<action type="remove_from_portfolio" symbol="X"/>
<action type="send_alert" symbol="X" message="Price hit target" urgency="high"/>`;

  // Messages
  const msgs = [];
  if (history?.length) {
    let last = null;
    for (const m of history.slice(-10)) {
      if (m.role === last) continue;
      msgs.push({ role: m.role, content: m.content });
      last = m.role;
    }
  }
  if (msgs.length && msgs[msgs.length - 1].role === "user") msgs.pop();
  msgs.push({ role: "user", content: message });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system, messages: msgs, stream: true }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[Chat] API", res.status, errBody.slice(0, 300));
      return new Response(JSON.stringify({ error: errBody.slice(0, 200) }), { status: res.status, headers: { "Content-Type": "application/json" } });
    }

    return new Response(res.body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
