import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { cleanPhone } from "@/lib/phone";

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const diagnostics = {
    userId: session.user.id,
    email: session.user.email,
    twilioConfigured: !!(TWILIO_SID && TWILIO_AUTH && TWILIO_FROM),
    twilioSid: TWILIO_SID ? `${TWILIO_SID.slice(0, 6)}...` : "NOT SET",
    twilioFrom: TWILIO_FROM || "NOT SET",
  };

  // Check if phone is in database
  try {
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("phone, carrier, alert_webhook")
      .eq("id", session.user.id)
      .single();

    diagnostics.dbPhoneRaw = user?.phone || "NOT SET";
    diagnostics.dbPhone = cleanPhone(user?.phone) || "INVALID";
    diagnostics.dbCarrier = user?.carrier || "NOT SET";
    diagnostics.dbError = error?.message || null;
  } catch (e) {
    diagnostics.dbError = e.message;
  }

  // Try sending a test SMS
  const phone = diagnostics.dbPhone;
  if (diagnostics.twilioConfigured && phone && phone !== "INVALID") {
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
            Body: "StockPulse test alert - SMS is working!",
          }),
        }
      );
      const data = await res.json();
      diagnostics.smsResult = data.sid ? "SENT" : "FAILED";
      diagnostics.smsSid = data.sid || null;
      diagnostics.smsError = data.message || data.code || null;
      diagnostics.smsTo = phone;
    } catch (e) {
      diagnostics.smsResult = "ERROR";
      diagnostics.smsError = e.message;
    }
  } else {
    diagnostics.smsResult = "SKIPPED";
    diagnostics.smsSkipReason = !diagnostics.twilioConfigured 
      ? "Twilio not configured" 
      : `Phone invalid: raw="${diagnostics.dbPhoneRaw}" cleaned="${phone}"`;
  }

  return NextResponse.json(diagnostics);
}
