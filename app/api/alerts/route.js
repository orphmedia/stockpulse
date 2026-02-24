import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { cleanPhone } from "@/lib/phone";

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER;

// Email-to-SMS gateways for major US carriers
const SMS_GATEWAYS = {
  att: "txt.att.net",
  tmobile: "tmomail.net",
  verizon: "vtext.com",
  sprint: "messaging.sprintpcs.com",
  uscellular: "email.uscc.net",
  cricket: "sms.cricketwireless.net",
  boost: "sms.myboostmobile.com",
  metro: "mymetropcs.com",
  mint: "tmomail.net", // Mint uses T-Mobile
  visible: "vtext.com", // Visible uses Verizon
};

async function sendTwilioSMS(to, body) {
  if (!TWILIO_SID || !TWILIO_AUTH || !TWILIO_FROM) {
    return { sent: false, reason: "Twilio not configured" };
  }

  const phone = cleanPhone(to);
  if (!phone) return { sent: false, reason: `Invalid phone number: ${to}` };

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString("base64"),
        },
        body: new URLSearchParams({ To: phone, From: TWILIO_FROM, Body: body }),
      }
    );
    const data = await res.json();
    if (data.sid) {
      console.log(`[Alerts] SMS sent via Twilio — SID: ${data.sid}`);
      return { sent: true, sid: data.sid };
    }
    console.error("[Alerts] Twilio error:", data.message);
    return { sent: false, reason: data.message || "Twilio error" };
  } catch (error) {
    return { sent: false, reason: error.message };
  }
}

async function sendEmailSMS(phone, carrier, body) {
  // Email-to-SMS requires SMTP — use webhook or Resend/SendGrid if configured
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
  const FROM_EMAIL = process.env.ALERT_FROM_EMAIL || "alerts@stockpulse.app";
  
  const gateway = SMS_GATEWAYS[carrier?.toLowerCase()];
  if (!gateway) return { sent: false, reason: `Unknown carrier: ${carrier}` };
  
  const cleanPhone = phone.replace(/[\s()+\-]/g, "").replace(/^1/, "");
  const toEmail = `${cleanPhone}@${gateway}`;

  if (RESEND_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_EMAIL, to: toEmail, subject: "", text: body }),
      });
      if (res.ok) { console.log(`[Alerts] Email-SMS sent via Resend to ${toEmail}`); return { sent: true }; }
    } catch {}
  }

  if (SENDGRID_KEY) {
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${SENDGRID_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: toEmail }] }],
          from: { email: FROM_EMAIL },
          subject: "",
          content: [{ type: "text/plain", value: body }],
        }),
      });
      if (res.ok || res.status === 202) { console.log(`[Alerts] Email-SMS sent via SendGrid to ${toEmail}`); return { sent: true }; }
    } catch {}
  }

  return { sent: false, reason: "No email service configured (set RESEND_API_KEY or SENDGRID_API_KEY)" };
}

// POST — send an alert
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol, message, urgency } = await request.json();

  try {
    // Get user's phone — try with carrier, fallback without
    let user = null;
    let { data, error } = await supabaseAdmin
      .from("users")
      .select("phone, carrier, alert_webhook")
      .eq("id", session.user.id)
      .single();
    
    if (error) {
      // carrier column might not exist
      const res2 = await supabaseAdmin
        .from("users")
        .select("phone, alert_webhook")
        .eq("id", session.user.id)
        .single();
      data = res2.data;
    }
    user = data;

    const smsBody = `StockPulse ${urgency === "high" ? "URGENT" : "Alert"}${symbol ? ` $${symbol}` : ""}: ${message}`;

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

    // Method 1: Twilio
    if (user?.phone && TWILIO_SID) {
      result = await sendTwilioSMS(user.phone, smsBody);
      if (result.sent && alert) {
        await supabaseAdmin.from("alerts").update({ sent_via: "twilio" }).eq("id", alert.id);
      }
    }
    // Method 2: Email-to-SMS gateway
    else if (user?.phone && user?.carrier) {
      result = await sendEmailSMS(user.phone, user.carrier, smsBody);
      if (result.sent && alert) {
        await supabaseAdmin.from("alerts").update({ sent_via: "email-sms" }).eq("id", alert.id);
      }
    }
    // Method 3: Webhook
    else if (user?.alert_webhook || process.env.ALERT_WEBHOOK_URL) {
      const webhookUrl = user?.alert_webhook || process.env.ALERT_WEBHOOK_URL;
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: user?.phone || "", message: smsBody, symbol, urgency, user_email: session.user.email, timestamp: new Date().toISOString() }),
        });
        result = { sent: true };
        if (alert) await supabaseAdmin.from("alerts").update({ sent_via: "webhook" }).eq("id", alert.id);
      } catch (e) { console.error("[Alerts] Webhook error:", e.message); }
    }

    // Tell user what's missing
    if (!result.sent) {
      const reasons = [];
      if (!user?.phone) reasons.push("no phone number in Settings");
      if (!TWILIO_SID && !user?.carrier) reasons.push("no Twilio config and no carrier selected");
      if (!TWILIO_SID) reasons.push("Twilio not configured (add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER to env vars)");
      if (user?.phone && !user?.carrier && !TWILIO_SID) reasons.push("select your carrier in Settings for free email-to-SMS");
      
      return NextResponse.json({
        sent: false,
        alertSaved: !!alert,
        message: `Alert saved but SMS not sent: ${reasons.join("; ")}`,
        setup: reasons,
      });
    }

    return NextResponse.json({ sent: true, message: "Alert sent!" });
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
