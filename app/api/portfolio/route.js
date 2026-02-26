import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// GET — get user's portfolio
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("portfolio")
    .select("*")
    .eq("user_id", session.user.id)
    .order("symbol", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ portfolio: data || [] });
}

// POST — add/update portfolio holdings (single or batch from CSV)
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  try {
    // Batch import from CSV
    if (body.holdings && Array.isArray(body.holdings)) {
      const records = body.holdings.map((h) => ({
        user_id: session.user.id,
        symbol: h.symbol?.toUpperCase()?.trim(),
        shares: parseFloat(h.shares) || 0,
        avg_cost: parseFloat(h.avg_cost || h.cost_basis || h.price) || 0,
        name: h.name || h.symbol?.toUpperCase()?.trim(),
        sector: h.sector || "Unknown",
      })).filter((r) => r.symbol && r.shares > 0);

      if (records.length === 0) {
        return NextResponse.json({ error: "No valid holdings found" }, { status: 400 });
      }

      // Upsert all holdings
      const { data, error } = await supabaseAdmin
        .from("portfolio")
        .upsert(records, { onConflict: "user_id,symbol" })
        .select();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        portfolio: data,
        message: `Imported ${records.length} holdings`,
      });
    }

    // Single holding add/update
    const { symbol, shares, avg_cost, name, sector } = body;

    if (!symbol) {
      return NextResponse.json({ error: "Symbol required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("portfolio")
      .upsert(
        {
          user_id: session.user.id,
          symbol: symbol.toUpperCase(),
          shares: parseFloat(shares) || 0,
          avg_cost: parseFloat(avg_cost) || 0,
          name: name || symbol.toUpperCase(),
          sector: sector || "Unknown",
        },
        { onConflict: "user_id,symbol" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ holding: data });
  } catch (error) {
    console.error("Portfolio error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — remove a holding
export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol } = await request.json();

  const { error } = await supabaseAdmin
    .from("portfolio")
    .delete()
    .eq("user_id", session.user.id)
    .eq("symbol", symbol.toUpperCase());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: `${symbol} removed` });
}
