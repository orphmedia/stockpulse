import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// POST — send an alert (SMS via webhook, or store for later)
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol, message, urgency } = await request.json();

  try {
    // Get user's phone number from settings
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("phone, alert_webhook")
      .eq("id", session.user.id)
      .single();

    // Store alert in database
    await supabaseAdmin.from("alerts").insert({
      user_id: session.user.id,
      symbol: symbol || "GENERAL",
      message,
      urgency: urgency || "normal",
      sent_via: "pending",
    });

    // Send SMS via webhook (Twilio, Make.com, Zapier, etc.)
    const webhookUrl = user?.alert_webhook || process.env.ALERT_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: user?.phone || "",
            message: `🚨 StockPulse Alert [${urgency?.toUpperCase() || "NORMAL"}]: ${symbol ? `$${symbol} — ` : ""}${message}`,
            symbol,
            urgency,
            user_email: session.user.email,
            timestamp: new Date().toISOString(),
          }),
        });

        // Update alert status
        await supabaseAdmin
          .from("alerts")
          .update({ sent_via: "webhook" })
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(1);
      } catch (webhookError) {
        console.error("Webhook send error:", webhookError.message);
      }
    }

    return NextResponse.json({ 
      sent: !!webhookUrl,
      message: webhookUrl 
        ? "Alert sent via SMS/webhook" 
        : "Alert saved — configure phone number in Settings to receive SMS alerts"
    });
  } catch (error) {
    console.error("Alert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET — list user's recent alerts
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
