import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

// US Market holidays (NYSE) — update annually
const MARKET_HOLIDAYS_2026 = [
  "2026-01-01", // New Year's Day
  "2026-01-19", // MLK Day
  "2026-02-16", // Presidents' Day
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
];

function isMarketHoliday(dateStr) {
  return MARKET_HOLIDAYS_2026.includes(dateStr);
}

function getWeekOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday of this week
  return new Date(d.setDate(diff)).toISOString().split("T")[0];
}

async function getYahooQuotes(symbols) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(",")}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const results = {};
    for (const q of data.quoteResponse?.result || []) {
      if (q.regularMarketPrice) {
        results[q.symbol] = {
          price: q.regularMarketPrice,
          change: q.regularMarketChange || 0,
          changePct: q.regularMarketChangePercent || 0,
          name: q.shortName || q.symbol,
        };
      }
    }
    return results;
  } catch { return {}; }
}

async function sendNotifications(summary, suggestionsCount) {
  // Get all users with phone/carrier for SMS notification
  const { data: users } = await supabaseAdmin
    .from("users")
    .select("id, email, phone, carrier, alert_webhook")
    .limit(10);

  const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER;
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
  const FROM_EMAIL = process.env.ALERT_FROM_EMAIL || "alerts@stockpulse.app";

  const SMS_GATEWAYS = {
    att: "txt.att.net", tmobile: "tmomail.net", verizon: "vtext.com",
    sprint: "messaging.sprintpcs.com", cricket: "sms.cricketwireless.net",
    mint: "tmomail.net", visible: "vtext.com",
  };

  const smsBody = `StockPulse Weekly is ready! ${suggestionsCount} suggestions for next week. Log in to listen and review.`;

  for (const user of users || []) {
    // SMS via Twilio
    if (user.phone && TWILIO_SID) {
      try {
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Basic " + Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString("base64"),
          },
          body: new URLSearchParams({ To: user.phone, From: TWILIO_FROM, Body: smsBody }),
        });
      } catch (e) { console.error("[Weekly] Twilio error:", e.message); }
    }
    // SMS via email gateway
    else if (user.phone && user.carrier) {
      const gateway = SMS_GATEWAYS[user.carrier?.toLowerCase()];
      if (gateway) {
        const toEmail = `${user.phone.replace(/[\s()+\-]/g, "").replace(/^1/, "")}@${gateway}`;
        if (RESEND_KEY) {
          try {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from: FROM_EMAIL, to: toEmail, subject: "", text: smsBody }),
            });
          } catch {}
        }
      }
    }

    // Email notification
    if (user.email && (RESEND_KEY || SENDGRID_KEY)) {
      const emailBody = `<h2>StockPulse Weekly Podcast</h2>
<p>${summary}</p>
<p><strong>${suggestionsCount} actionable suggestions</strong> for next week are ready for your review.</p>
<p>Log in to StockPulse to listen to the podcast and mark suggestions as done or pass.</p>`;

      if (RESEND_KEY) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: FROM_EMAIL, to: user.email,
              subject: `StockPulse Weekly — ${suggestionsCount} Suggestions for Next Week`,
              html: emailBody,
            }),
          });
        } catch {}
      } else if (SENDGRID_KEY) {
        try {
          await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: { Authorization: `Bearer ${SENDGRID_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: user.email }] }],
              from: { email: FROM_EMAIL },
              subject: `StockPulse Weekly — ${suggestionsCount} Suggestions for Next Week`,
              content: [{ type: "text/html", value: emailBody }],
            }),
          });
        } catch {}
      }
    }
  }
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "No API key" }, { status: 503 });
  }

  // Holiday check
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  if (isMarketHoliday(today)) {
    return NextResponse.json({ skipped: true, reason: "market holiday" });
  }

  try {
    // Get all portfolio + watchlist symbols
    const [{ data: portfolioItems }, { data: watchlistItems }] = await Promise.all([
      supabaseAdmin.from("portfolio").select("symbol, shares, avg_cost, name, sector").limit(100),
      supabaseAdmin.from("watchlist").select("symbol, name").limit(100),
    ]);

    const portfolioSymbols = [...new Set((portfolioItems || []).map((p) => p.symbol))];
    const watchlistSymbols = [...new Set((watchlistItems || []).map((w) => w.symbol))];
    const allTracked = [...new Set([...portfolioSymbols, ...watchlistSymbols])];

    const marketQuotes = await getYahooQuotes(["SPY", "QQQ", "DIA", ...allTracked.slice(0, 25)]);

    const portfolioContext = (portfolioItems || []).map((h) => {
      const q = marketQuotes[h.symbol];
      const value = q ? q.price * h.shares : 0;
      const cost = h.avg_cost * h.shares;
      const pl = value - cost;
      return `${h.symbol} (${h.name || h.symbol}): ${h.shares} shares, avg cost $${h.avg_cost}, current $${q?.price?.toFixed(2) || "?"}, P/L ${pl >= 0 ? "+" : ""}$${pl.toFixed(0)} (${cost > 0 ? ((pl / cost) * 100).toFixed(1) : 0}%), week change ${q?.changePct?.toFixed(2) || 0}%`;
    }).join("\n");

    const marketContext = Object.entries(marketQuotes)
      .filter(([s]) => ["SPY", "QQQ", "DIA"].includes(s))
      .map(([s, q]) => `${s}: $${q.price.toFixed(2)} ${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%`)
      .join(", ");

    const friday = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
      timeZone: "America/New_York",
    });

    const prompt = `You are producing a short weekly podcast for StockPulse — a private stock analysis app. Today is ${friday}, market just closed.

PORTFOLIO HOLDINGS:
${portfolioContext || "No holdings"}

WATCHLIST: ${watchlistSymbols.join(", ") || "None"}

MARKET CLOSE: ${marketContext || "Data unavailable"}

Generate a ~3 minute conversational podcast between two hosts:
- SARAH: Female host. Sharp, asks probing questions, has her own strong opinions on stocks. Sometimes challenges the other host.
- MIKE: Male host. Analytical, data-driven, provides the research-backed perspective. Not afraid to disagree with Sarah.

They should discuss:
1. How the portfolio performed this week
2. Key market moves and why they matter
3. Specific actionable suggestions for next week (buy, sell, trim, add, watch)
4. They should occasionally disagree or debate a position

RESPOND WITH VALID JSON ONLY:
{
  "script": [
    { "speaker": "sarah", "text": "Welcome back to StockPulse Weekly..." },
    { "speaker": "mike", "text": "Thanks Sarah. Let me break down this week..." }
  ],
  "summary": "3-4 sentence executive summary of the episode",
  "suggestions": [
    {
      "symbol": "AAPL",
      "action_type": "ADD",
      "suggestion_text": "Add to Apple on the pullback",
      "reasoning": "Trading below 50-day MA with strong earnings ahead",
      "confidence": "HIGH",
      "target_price": 195.00
    }
  ]
}

RULES:
- Script should have 18-24 exchanges (about 3 minutes when spoken)
- Keep each line conversational and natural, not corporate/stiff
- Hosts should have personality — Sarah is more aggressive, Mike is more cautious
- Include at least one point of disagreement between hosts
- 5-7 actionable suggestions
- Suggestions should reference portfolio holdings where relevant
- Be specific about prices, percentages, and reasoning`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    let fullText = "";
    for (const block of data.content || []) {
      if (block.type === "text") fullText += block.text;
    }

    // Clean markup
    fullText = fullText
      .replace(/<\/?antml:cite[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\[\d+\]/g, "");

    // Parse JSON
    let podcast;
    try {
      const cleaned = fullText.replace(/```json\n?|```/g, "").trim();
      podcast = JSON.parse(cleaned);
    } catch {
      const start = fullText.indexOf("{");
      const end = fullText.lastIndexOf("}");
      if (start !== -1 && end > start) {
        podcast = JSON.parse(fullText.slice(start, end + 1));
      }
    }

    if (!podcast) {
      return NextResponse.json({ error: "Failed to parse podcast" }, { status: 500 });
    }

    const weekOf = getWeekOf(new Date());

    // Store suggestions
    if (podcast.suggestions?.length > 0) {
      // Get first user for user_id (private app, single user)
      const { data: users } = await supabaseAdmin.from("users").select("id").limit(1);
      const userId = users?.[0]?.id;

      // Clear old suggestions for this week
      if (userId) {
        await supabaseAdmin.from("weekly_suggestions").delete().eq("week_of", weekOf).eq("user_id", userId);
      }

      const rows = podcast.suggestions.map((s) => ({
        user_id: userId,
        symbol: s.symbol,
        suggestion_text: s.suggestion_text,
        action_type: s.action_type,
        reasoning: s.reasoning,
        confidence: s.confidence,
        target_price: s.target_price,
        status: "pending",
        week_of: weekOf,
      }));

      await supabaseAdmin.from("weekly_suggestions").insert(rows);
    }

    // Store podcast in daily_cache
    await supabaseAdmin.from("daily_cache").upsert({
      key: "weekly_podcast",
      value: JSON.stringify({
        script: podcast.script,
        summary: podcast.summary,
        weekOf,
        generatedAt: new Date().toISOString(),
      }),
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

    // Send notifications
    await sendNotifications(podcast.summary, podcast.suggestions?.length || 0);

    console.log("[Weekly Podcast] Generated", podcast.script?.length, "dialogue lines,", podcast.suggestions?.length, "suggestions");

    return NextResponse.json({
      success: true,
      dialogueLines: podcast.script?.length || 0,
      suggestions: podcast.suggestions?.length || 0,
      weekOf,
    });
  } catch (error) {
    console.error("[Weekly Podcast] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
