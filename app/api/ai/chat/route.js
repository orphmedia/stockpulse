// Edge runtime = no cold starts
export const runtime = "edge";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CHAT_MODEL || "claude-haiku-4-5-20251001";

export async function POST(request) {
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "No API key" }), { status: 503 });
  }

  const { message, history, prices, watchlist, portfolio, userName } = await request.json();
  const first = (userName || "there").split(" ")[0];

  // Current date/time
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  const hour = parseInt(now.toLocaleTimeString("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }));
  const marketOpen = hour >= 9 && hour < 16;
  const marketStatus = marketOpen ? "MARKET OPEN" : hour < 9 ? "PRE-MARKET" : "AFTER HOURS";

  // Rich price context
  const priceLines = Object.entries(prices || {}).slice(0, 20).map(([s, p]) => {
    const price = p.price?.toFixed(2) || "?";
    const ch = p.change?.toFixed(2) || "0";
    const chPct = p.changePct?.toFixed(2) || "0";
    const dir = parseFloat(ch) >= 0 ? "+" : "";
    const name = p.name || "";
    return `${s}${name ? ` (${name})` : ""}: $${price} ${dir}${ch} (${dir}${chPct}%)`;
  }).join("\n");

  // Rich portfolio context
  const portfolioLines = (portfolio || []).slice(0, 15).map((h) => {
    const cur = prices?.[h.symbol]?.price;
    const shares = h.shares || 0;
    const cost = h.avg_cost || 0;
    const mktVal = cur ? (cur * shares).toFixed(0) : "?";
    const pnl = cur && cost ? ((cur - cost) * shares).toFixed(2) : "?";
    const pnlPct = cur && cost > 0 ? (((cur - cost) / cost) * 100).toFixed(1) : "?";
    const dayChg = prices?.[h.symbol]?.change;
    const dayPnl = dayChg ? (dayChg * shares).toFixed(2) : "?";
    return `${h.symbol}: ${shares} shares @ $${cost.toFixed(2)} → now $${cur?.toFixed(2) || "?"} | value $${mktVal} | total P/L $${pnl} (${pnlPct}%) | today $${dayPnl}`;
  }).join("\n");

  const wl = (watchlist || []).slice(0, 10).map((w) => w.symbol).join(", ");

  // Calculate portfolio totals for the AI
  let totalValue = 0, totalCost = 0, totalDayPnl = 0;
  for (const h of (portfolio || [])) {
    const cur = prices?.[h.symbol]?.price;
    const dayChg = prices?.[h.symbol]?.change;
    if (cur) totalValue += cur * (h.shares || 0);
    totalCost += (h.avg_cost || 0) * (h.shares || 0);
    if (dayChg) totalDayPnl += dayChg * (h.shares || 0);
  }
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? ((totalPnl / totalCost) * 100).toFixed(1) : "0";

  const system = `You are ${first}'s personal stock AI. Be direct and actionable. No markdown, no bullet points, no asterisks.

TODAY: ${dateStr}, ${timeStr} ET — ${marketStatus}

LIVE MARKET PRICES (real-time from Yahoo Finance):
${priceLines || "No prices loaded yet — tell the user to wait a moment for data to load."}

PORTFOLIO SUMMARY:
Total Value: $${totalValue.toFixed(0)} | Cost Basis: $${totalCost.toFixed(0)} | Total P/L: ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(0)} (${totalPnlPct}%) | Today: ${totalDayPnl >= 0 ? "+" : ""}$${totalDayPnl.toFixed(2)}

HOLDINGS:
${portfolioLines || "No holdings — portfolio is empty."}

WATCHLIST: ${wl || "none"}

INSTRUCTIONS:
- These prices are LIVE and REAL. Use them with confidence. Do NOT say you cannot access live data — you have it above.
- For briefings: state the date, summarize portfolio P/L (total and today), highlight biggest movers, give 1-2 actionable insights. 4-6 sentences.
- For stock questions: 1-3 sentences. Give direct BUY/SELL/HOLD with reasoning.
- For stocks NOT in the price list: tell the user to add it to their watchlist so you can track it.
- Always reference actual dollar amounts and percentages from the data above.

ACTIONS — append at END of response when appropriate:
<action type="show_stock" symbol="X" name="N" price="0" targetPrice="0" confidence="HIGH" catalyst="why"/>
<action type="add_to_watchlist" symbol="X" name="N" sector="S"/>
<action type="remove_from_watchlist" symbol="X"/>
<action type="add_to_portfolio" symbol="X" shares="0" avg_cost="0" name="N"/>
<action type="remove_from_portfolio" symbol="X"/>
<action type="send_alert" symbol="X" message="Price hit target" urgency="high"/>`;

  // Messages — strict alternation
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
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system,
        messages: msgs,
        stream: true,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[Chat] API", res.status, errBody.slice(0, 300));
      return new Response(JSON.stringify({ error: errBody.slice(0, 200) }), { 
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(res.body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
