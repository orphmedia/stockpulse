import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchSocialSentiment } from "@/lib/social";

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get("symbols")?.split(",") || [];

  if (symbols.length === 0) {
    return NextResponse.json({ error: "No symbols provided" }, { status: 400 });
  }

  try {
    const social = await fetchSocialSentiment(symbols);
    return NextResponse.json(social);
  } catch (error) {
    console.error("Social API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
