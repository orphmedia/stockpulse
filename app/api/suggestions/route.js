import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// GET — fetch suggestions for current or specified week
export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const weekOf = searchParams.get("week_of");

  let query = supabaseAdmin
    .from("weekly_suggestions")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: true });

  if (weekOf) {
    query = query.eq("week_of", weekOf);
  } else {
    // Get most recent week's suggestions
    query = query.order("week_of", { ascending: false }).limit(20);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by most recent week_of if no specific week requested
  const suggestions = data || [];
  const latestWeek = suggestions[0]?.week_of;
  const filtered = latestWeek ? suggestions.filter((s) => s.week_of === latestWeek) : [];

  return NextResponse.json({ suggestions: filtered, weekOf: latestWeek });
}

// PUT — update suggestion status
export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, status } = await request.json();
  if (!id || !["done", "passed", "pending"].includes(status)) {
    return NextResponse.json({ error: "Invalid id or status" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("weekly_suggestions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", session.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
