// Edge runtime = no cold starts
export const runtime = "edge";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// Use Haiku 4.5 for speed — 4-5x faster than Sonnet, confirmed model string
const MODEL = process.env.CHAT_MODEL || "claude-haiku-4-5-20251001";

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
Actions — append at END of response when user asks:
<action type="show_stock" symbol="X" name="N" price="0" targetPrice="0" confidence="HIGH" catalyst="why"/>
<action type="add_to_watchlist" symbol="X" name="N" sector="S"/>
<action type="remove_from_watchlist" symbol="X"/>
<action type="add_to_portfolio" symbol="X" shares="0" avg_cost="0" name="N"/>
<action type="remove_from_portfolio" symbol="X"/>
<action type="send_alert" symbol="X" message="Price hit target" urgency="high"/>
When user says remove/delete from watchlist, use remove_from_watchlist. When they say alert/notify me, use send_alert.`;

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
        max_tokens: 300,
        system,
        messages: msgs,
        stream: true,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[Chat] API", res.status, errBody.slice(0, 300));
      // Pass through the actual error so client can see it
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
