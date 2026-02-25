import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET cached discoveries — no auth required, instant load
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("daily_cache")
      .select("value, updated_at")
      .eq("key", "discoveries")
      .single();

    if (error || !data) {
      // Table might not exist yet — that's OK
      return NextResponse.json({ cached: false });
    }

    const picks = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    const age = Date.now() - new Date(data.updated_at).getTime();
    const stale = age > 12 * 60 * 60 * 1000; // older than 12 hours

    return NextResponse.json({
      cached: true,
      stale,
      updatedAt: data.updated_at,
      ...picks,
    });
  } catch (e) {
    // Table doesn't exist or other error — not critical
    return NextResponse.json({ cached: false });
  }
}
