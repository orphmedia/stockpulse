import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// GET — list user's watchlist
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("watchlist")
    .select("*")
    .eq("user_id", session.user.id)
    .order("added_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ watchlist: data });
}

// POST — add to watchlist
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol, name, sector } = await request.json();

  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("watchlist")
    .upsert(
      {
        user_id: session.user.id,
        symbol: symbol.toUpperCase(),
        name: name || symbol,
        sector: sector || "Unknown",
      },
      { onConflict: "user_id,symbol" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data, message: `${symbol} added to watchlist` });
}

// DELETE — remove from watchlist
export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol } = await request.json();

  const { error } = await supabaseAdmin
    .from("watchlist")
    .delete()
    .eq("user_id", session.user.id)
    .eq("symbol", symbol.toUpperCase());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: `${symbol} removed from watchlist` });
}
