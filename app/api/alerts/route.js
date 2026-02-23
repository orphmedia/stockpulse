import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER;

async function sendTwilioSMS(to, body) {
  if (!TWILIO_SID || !TWILIO_AUTH || !TWILIO_FROM) {
    console.log("[Alerts] Twilio not configured — skipping SMS");
    return { sent: false, reason: "Twilio not configured" };
  }

  // Clean phone number
  let phone = to.replace(/[\s()-]/g, "");
  if (!phone.startsWith("+")) phone = "+1" + phone.replace(/^\+?1?/, "");

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString("base64"),
        },
        body: new URLSearchParams({
          To: phone,
          From: TWILIO_FROM,
          Body: body,
        }),
      }
    );

    const data = await res.json();

    if (data.sid) {
      console.log(`[Alerts] SMS sent to ${phone} — SID: ${data.sid}`);
      return { sent: true, sid: data.sid };
    } else {
      console.error("[Alerts] Twilio error:", data.message || data);
      return { sent: false, reason: data.message || "Twilio error" };
    }
  } catch (error) {
    console.error("[Alerts] SMS send error:", error.message);
    return { sent: false, reason: error.message };
  }
}

// POST — send an alert
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol, message, urgency } = await request.json();

  try {
    // Get user's phone
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("phone, alert_webhook")
      .eq("id", session.user.id)
      .single();

    const smsBody = `StockPulse ${urgency === "high" ? "🚨 URGENT" : "📊 Alert"}${symbol ? ` $${symbol}` : ""}: ${message}`;

    // Store alert
    const { data: alert } = await supabaseAdmin
      .from("alerts")
      .insert({
        user_id: session.user.id,
        symbol: symbol || "GENERAL",
        message,
        urgency: urgency || "normal",
        sent_via: "pending",
      })
      .select()
      .single();

    let result = { sent: false };

    // Method 1: Direct Twilio SMS
    if (user?.phone && TWILIO_SID) {
      result = await sendTwilioSMS(user.phone, smsBody);
      if (result.sent && alert) {
        await supabaseAdmin.from("alerts").update({ sent_via: "twilio" }).eq("id", alert.id);
      }
    }
    // Method 2: Custom webhook fallback
    else if (user?.alert_webhook || process.env.ALERT_WEBHOOK_URL) {
      const webhookUrl = user.alert_webhook || process.env.ALERT_WEBHOOK_URL;
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: user?.phone || "",
            message: smsBody,
            symbol,
            urgency,
            user_email: session.user.email,
            timestamp: new Date().toISOString(),
          }),
        });
        result = { sent: true };
        if (alert) {
          await supabaseAdmin.from("alerts").update({ sent_via: "webhook" }).eq("id", alert.id);
        }
      } catch (e) {
        console.error("[Alerts] Webhook error:", e.message);
      }
    }

    if (!result.sent && !user?.phone) {
      return NextResponse.json({
        sent: false,
        message: "Alert saved. Add your phone number in Settings to receive SMS alerts.",
      });
    }

    return NextResponse.json({
      sent: result.sent,
      message: result.sent ? "SMS alert sent!" : "Alert saved but SMS delivery failed. Check Settings.",
    });
  } catch (error) {
    console.error("Alert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET — list recent alerts
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("alerts")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alerts: data || [] });
}
