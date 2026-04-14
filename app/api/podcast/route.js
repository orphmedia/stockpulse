import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// GET — fetch latest podcast data
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("daily_cache")
    .select("value, updated_at")
    .eq("key", "weekly_podcast")
    .single();

  if (error || !data) {
    return NextResponse.json({ podcast: null });
  }

  const podcast = typeof data.value === "string" ? JSON.parse(data.value) : data.value;

  return NextResponse.json({ podcast });
}
