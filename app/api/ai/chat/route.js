// Edge runtime = no cold starts, deployed at CDN edge
export const runtime = "edge";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// claude-3-5-haiku is the fastest model available
const MODEL = process.env.CHAT_MODEL || "claude-3-5-haiku-20241022";

export async function POST(request) {
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "No API key" }), { status: 503 });
  }

  const { message, history, prices, watchlist, portfolio, userName } = await request.json();
  const first = (userName || "there").split(" ")[0];

  // Ultra-compact context
  const pl = Object.entries(prices || {}).slice(0, 15).map(([s, p]) => `${s}:${p.price?.toFixed(0)}`).join(" ");
  const hl = (portfolio || []).slice(0, 10).map((h) => `${h.symbol}(${h.shares}@${h.avg_cost?.toFixed(0)})`).join(" ");
  const wl = (watchlist || []).slice(0, 10).map((w) => w.symbol).join(",");

  const system = `${first}'s stock AI. 1-3 sentences. Direct BUY/SELL/HOLD. No markdown.
Portfolio: ${hl || "empty"} | Watch: ${wl || "empty"} | Prices: ${pl || "n/a"}
Stock card: <action type="show_stock" symbol="X" name="N" price="0" targetPrice="0" confidence="HIGH" catalyst="why"/>
Watchlist: <action type="add_to_watchlist" symbol="X" name="N"/>
Portfolio: <action type="add_to_portfolio" symbol="X" shares="N" avg_cost="N" name="N"/>`;

  // Messages — strict alternation, minimal
  const msgs = [];
  if (history?.length) {
    let last = null;
    for (const m of history.slice(-10)) { // only last 10
      if (m.role === last) continue;
      msgs.push({ role: m.role, content: m.content });
      last = m.role;
    }
  }
  if (msgs.length && msgs[msgs.length - 1].role === "user") msgs.pop();
  msgs.push({ role: "user", content: message });

  try {
    const t0 = Date.now();

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system,
        messages: msgs,
        stream: true,
      }),
    });

    console.log(`[Chat] ${MODEL} call took ${Date.now() - t0}ms, status: ${res.status}`);

    if (!res.ok) {
      const err = await res.text();
      console.error("[Chat] Error:", err.slice(0, 200));
      return new Response(JSON.stringify({ error: `API ${res.status}` }), { status: 502 });
    }

    // Stream directly to client — zero buffering
    return new Response(res.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("[Chat]", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
