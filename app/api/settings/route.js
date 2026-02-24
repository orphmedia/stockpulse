import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { phone, carrier, alert_webhook } = await request.json();

  // Try saving all fields, fallback if carrier column doesn't exist
  let { error } = await supabaseAdmin
    .from("users")
    .update({ phone, carrier, alert_webhook })
    .eq("id", session.user.id);

  if (error) {
    console.log("[Settings] Full update failed, trying without carrier:", error.message);
    // Retry without carrier column
    const res2 = await supabaseAdmin
      .from("users")
      .update({ phone, alert_webhook })
      .eq("id", session.user.id);
    error = res2.error;
  }

  if (error) {
    console.error("[Settings] Save failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Settings saved", phone });
}

// GET - check what's saved
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("phone, carrier, alert_webhook")
    .eq("id", session.user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ phone: data?.phone, carrier: data?.carrier, hasPhone: !!data?.phone });
}
