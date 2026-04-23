import { NextRequest, NextResponse } from "next/server";
import { searchStays } from "@/lib/duffel";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const results = await searchStays(body);

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to search stays" },
      { status: 400 }
    );
  }
}
